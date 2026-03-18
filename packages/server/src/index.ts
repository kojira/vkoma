import "dotenv/config";
import { serve } from "@hono/node-server";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import {
  type SceneParam,
  defineScene,
  params as sceneParams,
  renderScene,
  allScenePresets,
  getSceneFrameRanges,
  getSceneAtFrame,
  type SceneItem,
  type Asset,
  type AssetLibrary,
  getAssetType,
} from "../../core/src/index";
import type { Track } from "../../core/src/timeline";
import { analyzeAudio } from "./audio-analyze.js";
import { createAudioAnalyzer } from '../../audio/src/index.js';
import { handleAiChat } from "./ai-chat.js";
import { renderFrameWithTracks } from "./render-frame.js";
import { WorkerPool } from "./workerPool.js";

const require = createRequire(import.meta.url);
const { createChatServer } = require("/Volumes/2TB/openclaw/workspace/projects/cli-chat-poc/src/server.js");

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') {
    // Client disconnected while we were writing - this is normal
    return;
  }
  console.error('[uncaughtException]', err);
  process.exit(1);
});

GlobalFonts.registerFromPath("/System/Library/Fonts/Apple Color Emoji.ttc", "Apple Color Emoji");

interface Project {
  id: string;
  name: string;
  scenes: unknown[];
  timeline?: {
    duration: number;
    tracks: Track[];
  };
  createdAt: string;
  updatedAt: string;
}

type ProjectPatchBody = Partial<Omit<Project, "id" | "createdAt" | "updatedAt">> & {
  timeline?: Partial<NonNullable<Project["timeline"]>>;
};

interface SavedSceneItem {
  id: string;
  name: string;
  duration: number;
  params: Record<string, unknown>;
  sceneConfigId: string;
  renderCode?: string;
  sceneConfig?: { id?: string };
}

const app = new Hono();
let projectsRoot = process.env.VKOMA_PROJECTS_DIR ?? path.join(os.homedir(), "vkoma-projects");
const CONFIG_FILE = path.join(os.homedir(), ".vkoma-config.json");
const MV_ASSETS_DIR = "/Volumes/2TB/openclaw/workspace/projects/vkoma/mv-assets";

// Load persisted config
try {
  const configRaw = fs.readFileSync(CONFIG_FILE, "utf8");
  const config = JSON.parse(configRaw) as { projectsDir?: string };
  if (typeof config.projectsDir === "string" && config.projectsDir.length > 0) {
    projectsRoot = config.projectsDir;
  }
} catch {
  // No config file yet, use default
}

handleAiChat(app, { getProjectsRoot: () => projectsRoot });

app.get("/api/mv-assets/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (filename.includes("..") || filename.includes("/")) {
    return c.text("Forbidden", 403);
  }

  const filepath = path.join(MV_ASSETS_DIR, filename);
  try {
    const data = await readFile(filepath);
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };
    const contentType = mimeTypes[ext] ?? "application/octet-stream";
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return c.text("Not Found", 404);
  }
});

function getProjectDir(id: string) {
  return path.join(projectsRoot, id);
}

function getProjectFile(id: string) {
  return path.join(getProjectDir(id), "project.json");
}

async function ensureProjectsRoot() {
  await mkdir(projectsRoot, { recursive: true });
}

async function readProject(id: string) {
  const projectFile = getProjectFile(id);
  const raw = await readFile(projectFile, "utf8");
  return JSON.parse(raw) as Project;
}

async function writeProject(project: Project) {
  const projectDir = getProjectDir(project.id);
  await mkdir(projectDir, { recursive: true });
  await writeFile(getProjectFile(project.id), JSON.stringify(project, null, 2), "utf8");
}

function mergeProjectPatch(project: Project, patch: ProjectPatchBody): Project {
  const nextProject: Project = { ...project };

  if ("name" in patch && typeof patch.name === "string") {
    nextProject.name = patch.name;
  }

  if ("scenes" in patch && Array.isArray(patch.scenes)) {
    nextProject.scenes = patch.scenes;
  }

  if ("timeline" in patch && patch.timeline && typeof patch.timeline === "object") {
    nextProject.timeline = {
      duration: project.timeline?.duration ?? 0,
      tracks: project.timeline?.tracks ?? [],
      ...patch.timeline,
    };
  }

  nextProject.updatedAt = new Date().toISOString();
  return nextProject;
}

function deserializeServerScenes(rawScenes: unknown): SceneItem[] {
  if (!Array.isArray(rawScenes)) return [];

  const result = rawScenes
    .map<SceneItem | null>((scene, index) => {
      if (!scene || typeof scene !== "object") return null;

      const saved = scene as Partial<SavedSceneItem>;
      const sceneConfigId = saved.sceneConfigId ?? saved.sceneConfig?.id;
      let preset = allScenePresets.find((entry) => entry.id === sceneConfigId);

      if (!preset && saved.renderCode && typeof saved.renderCode === "string") {
        try {
          const drawFn = new Function("ctx", "params", "time", saved.renderCode) as (
            ctx: any,
            params: Record<string, unknown>,
            time: number,
          ) => void;

          const paramEntries =
            saved.params && typeof saved.params === "object" ? Object.entries(saved.params) : [];
          const defaultParams: Record<string, SceneParam> = {};
          for (const [key, value] of paramEntries) {
            if (typeof value === "number") {
              defaultParams[key] = sceneParams.number(key, value);
            } else if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
              defaultParams[key] = sceneParams.color(key, value);
            } else if (typeof value === "string") {
              defaultParams[key] = sceneParams.string(key, value);
            }
          }

          preset = defineScene({
            id: sceneConfigId || `dynamic-${Date.now()}-${index}`,
            name: typeof saved.name === "string" ? saved.name : "Dynamic Scene",
            duration: typeof saved.duration === "number" ? saved.duration : 3,
            defaultParams,
            draw: drawFn,
          });
        } catch {
          return null;
        }
      }

      if (!preset) {
        console.error(
          `[deserialize] scene[${index}] no preset found for sceneConfigId="${sceneConfigId}", renderCode=${saved.renderCode ? "present" : "missing"}`,
        );
        return null;
      }

      const item: SceneItem = {
        id:
          typeof saved.id === "string" && saved.id.length > 0
            ? saved.id
            : `scene-${Date.now()}-${index}`,
        name: typeof saved.name === "string" ? saved.name : preset.name,
        duration: typeof saved.duration === "number" ? Math.max(0.5, saved.duration) : preset.duration,
        sceneConfig: preset,
        params: {
          ...Object.fromEntries(
            Object.entries(preset.defaultParams).map(([key, param]) => [key, param.default]),
          ),
          ...(saved.params && typeof saved.params === "object" ? saved.params : {}),
        },
      };
      if (saved.renderCode) {
        (item as any).renderCode = saved.renderCode;
      }
      return item;
    })
    .filter((scene): scene is SceneItem => scene !== null);

  if (result.length === 0 && rawScenes.length > 0) {
    console.error("[deserialize] all scenes failed to parse:", JSON.stringify(rawScenes).slice(0, 500));
  }

  return result;
}

const __filename_esm = fileURLToPath(import.meta.url);
const __dirname_esm = path.dirname(__filename_esm);

function getWorkerCount(): number {
  // remotion-style: round to nearest, clamp to [1, 8]
  const cpuCount = os.cpus().length;
  return Math.round(Math.min(8, Math.max(1, cpuCount / 2)));
}

const workerPool = new WorkerPool(getWorkerCount());
process.on("exit", () => {
  workerPool.drain().catch(() => {});
});

interface FftFrameData {
  bands: number[];
  beat: boolean;
  beatIntensity: number;
  rms: number;
}

function renderFramesInWorker(
  rawScenes: unknown[],
  fps: number,
  startFrame: number,
  endFrame: number,
  width: number,
  height: number,
  beatTimings?: number[],
  precomputedFftData?: FftFrameData[],
  signal?: AbortSignal,
  everyNthFrame?: number,
): Promise<Buffer[]> {
  return workerPool.run({
    rawScenes,
    fps,
    startFrame,
    endFrame,
    width,
    height,
    beatTimings,
    precomputedFftData,
    everyNthFrame,
  }, signal);
}

async function renderVideo(
  scenes: SceneItem[],
  rawScenes: unknown[],
  fps: number,
  totalFrames: number,
  outputPath: string,
  bgmPath?: string,
  beatTimings?: number[],
  tracks?: Track[],
  options?: {
    signal?: AbortSignal;
    onFrameUpdate?: (renderedFrames: number, totalFrames: number) => void;
    onProgress?: (rendered: number, total: number) => void;
    everyNthFrame?: number;
  },
): Promise<{ frameCaptureMs: number; ffmpegMs: number }> {
  const WIDTH = 1920;
  const HEIGHT = 1080;

  // Determine encoder: VideoToolbox on macOS, libx264 elsewhere
  const useMacHW = process.platform === "darwin";

  const ffmpegArgs = [
    "-y",
    "-f", "mjpeg",
    "-vcodec", "mjpeg",
    "-r", String(fps),
    "-i", "pipe:0",
  ];
  if (bgmPath) {
    ffmpegArgs.push("-i", bgmPath);
  }
  ffmpegArgs.push("-vf", "format=yuv420p");
  if (useMacHW) {
    ffmpegArgs.push("-c:v", "h264_videotoolbox", "-allow_sw", "1");
  } else {
    ffmpegArgs.push("-c:v", "libx264", "-preset", "ultrafast");
  }
  ffmpegArgs.push("-threads", "0");
  if (bgmPath) {
    const videoDuration = totalFrames / fps;
    ffmpegArgs.push("-c:a", "aac", "-t", String(videoDuration));
  }
  ffmpegArgs.push(outputPath);

  const ffmpeg = spawn("ffmpeg", ffmpegArgs, { stdio: ["pipe", "pipe", "pipe"] });

  let stderrOutput = "";
  ffmpeg.stderr.on("data", (chunk: Buffer) => { stderrOutput += chunk.toString(); });
  ffmpeg.stdin.on("error", () => {}); // Suppress EPIPE

  const done = new Promise<void>((resolve, reject) => {
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderrOutput.slice(-500)}`));
    });
    ffmpeg.on("error", reject);
  });

  const t0 = Date.now();

  // Precompute FFT data on main thread if BGM is provided
  let fftFrameData: FftFrameData[] | undefined;
  if (bgmPath) {
    try {
      const analyzer = createAudioAnalyzer(bgmPath, { bands: 32, fps });
      fftFrameData = [];
      for (let i = 0; i < totalFrames; i++) {
        fftFrameData.push(analyzer.getFrame(i));
      }
    } catch (e) {
      console.warn("[renderVideo] FFT precompute failed:", e);
    }
  }

  if (tracks) {
    for (let frame = 0; frame < totalFrames; frame++) {
      if (options?.signal?.aborted) {
        throw new Error("Render aborted");
      }

      const buffer = await renderFrameWithTracks(
        tracks,
        frame / fps,
        WIDTH,
        HEIGHT,
        fftFrameData?.[frame]?.bands ?? [],
        path.dirname(outputPath),
      );

      try {
        const ok = ffmpeg.stdin.write(buffer);
        if (!ok) {
          await new Promise<void>((resolve) => ffmpeg.stdin.once("drain", resolve));
        }
      } catch {
        break;
      }

      const renderedFrames = frame + 1;
      options?.onFrameUpdate?.(renderedFrames, totalFrames);
      options?.onProgress?.(renderedFrames, totalFrames);
    }

    const t1 = Date.now();
    ffmpeg.stdin.end();
    await done;
    const t2 = Date.now();

    return { frameCaptureMs: t1 - t0, ffmpegMs: t2 - t1 };
  }

  // Dynamic chunk scheduling: small chunks for better load balancing (remotion-style)
  const workerCount = Math.min(getWorkerCount(), totalFrames);
  const chunkSize = Math.max(4, Math.ceil(totalFrames / (workerCount * 4)));
  const chunks: Array<{ start: number; end: number; index: number }> = [];
  for (let frame = 0, idx = 0; frame < totalFrames; frame += chunkSize, idx++) {
    chunks.push({ start: frame, end: Math.min(frame + chunkSize, totalFrames), index: idx });
  }

  // Launch all chunks — WorkerPool limits concurrency via its pool size
  const completedChunks = new Map<number, Buffer[]>();
  let renderedFrames = 0;
  let nextChunkToWrite = 0;
  let writeResolve: (() => void) | null = null;

  const chunkPromises = chunks.map((chunk) =>
    renderFramesInWorker(
      rawScenes, fps, chunk.start, chunk.end, WIDTH, HEIGHT,
      beatTimings, fftFrameData?.slice(chunk.start, chunk.end),
      options?.signal, options?.everyNthFrame,
    ).then((buffers) => {
      completedChunks.set(chunk.index, buffers);
      renderedFrames += buffers.length;
      options?.onFrameUpdate?.(renderedFrames, totalFrames);
      options?.onProgress?.(renderedFrames, totalFrames);
      // Notify the ordered writer that a new chunk is available
      if (writeResolve) {
        const fn = writeResolve;
        writeResolve = null;
        fn();
      }
    }),
  );

  // Ordered frame writer: write chunks to ffmpeg in correct sequence
  const writeOrdered = async () => {
    while (nextChunkToWrite < chunks.length) {
      if (!completedChunks.has(nextChunkToWrite)) {
        await new Promise<void>((resolve) => {
          writeResolve = resolve;
        });
        continue;
      }
      const buffers = completedChunks.get(nextChunkToWrite)!;
      completedChunks.delete(nextChunkToWrite);
      nextChunkToWrite++;
      for (const buf of buffers) {
        try {
          const ok = ffmpeg.stdin.write(buf);
          if (!ok) {
            await new Promise<void>((resolve) => ffmpeg.stdin.once("drain", resolve));
          }
        } catch {
          return;
        }
      }
    }
  };

  // Run rendering and ordered writing concurrently
  await Promise.all([Promise.all(chunkPromises), writeOrdered()]);
  const t1 = Date.now();

  ffmpeg.stdin.end();
  await done;
  const t2 = Date.now();

  return { frameCaptureMs: t1 - t0, ffmpegMs: t2 - t1 };
}

app.get("/api/projects", async (c) => {
  await ensureProjectsRoot();
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return await readProject(entry.name);
        } catch {
          return null;
        }
      }),
  );

  return c.json({
    projects: projects
      .filter((project): project is Project => project !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  });
});

app.post("/api/projects", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    name: body.name ?? "Untitled Project",
    scenes: Array.isArray(body.scenes) ? body.scenes : [],
    createdAt: now,
    updatedAt: now,
  };

  await writeProject(project);
  return c.json({ project }, 201);
});

app.get("/api/projects/:id", async (c) => {
  try {
    const project = await readProject(c.req.param("id"));
    return c.json({ project });
  } catch {
    return c.json({ error: "Project not found" }, 404);
  }
});

app.post("/api/projects/:id/bgm", async (c) => {
  const id = c.req.param("id");
  const projectDir = getProjectDir(id);
  await mkdir(projectDir, { recursive: true });

  const body = await c.req.parseBody();
  const bgmFile = body["bgm"];
  if (!bgmFile || typeof bgmFile === "string") {
    return c.json({ error: "No bgm file" }, 400);
  }

  const ext = path.extname(bgmFile.name || "bgm.wav").toLowerCase() || ".wav";
  const bgmPath = path.join(projectDir, `bgm${ext}`);

  try {
    const files = await readdir(projectDir);
    for (const f of files) {
      if (/^bgm\.(wav|mp3|ogg|aac|flac)$/.test(f) && f !== `bgm${ext}`) {
        await rm(path.join(projectDir, f)).catch(() => {});
      }
    }
  } catch {}

  const arrayBuffer = await bgmFile.arrayBuffer();
  await writeFile(bgmPath, Buffer.from(arrayBuffer));

  // FFT解析を非同期で実行してキャッシュ保存（エラーは無視）
  (async () => {
    try {
      const analyzer = createAudioAnalyzer(bgmPath, { bands: 32, fps: 30 });
      const frames: Array<{ bands: number[]; beatIntensity: number }> = [];
      for (let i = 0; i < analyzer.totalFrames; i++) {
        const fd = analyzer.getFrame(i);
        frames.push({ bands: fd.bands, beatIntensity: fd.beatIntensity });
      }
      const cachePath = path.join(projectDir, "fft-cache.json");
      await writeFile(cachePath, JSON.stringify({ frames }), "utf8");
    } catch (e) {
      console.error("[FFT cache] failed", e);
    }
  })();

  return c.json({ bgmPath: `/api/projects/${id}/bgm` });
});

app.get("/api/projects/:id/bgm", async (c) => {
  const id = c.req.param("id");
  const projectDir = getProjectDir(id);

  try {
    const files = await readdir(projectDir);
    const bgmFile = files.find((f) => /^bgm\.(wav|mp3|ogg|aac|flac)$/.test(f));
    if (!bgmFile) {
      return c.json({ error: "Not found" }, 404);
    }

    const bgmPath = path.join(projectDir, bgmFile);
    const data = await readFile(bgmPath);
    const ext = path.extname(bgmFile).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".wav": "audio/wav",
      ".mp3": "audio/mpeg",
      ".ogg": "audio/ogg",
      ".aac": "audio/aac",
      ".flac": "audio/flac",
    };
    const contentType = mimeMap[ext] ?? "audio/wav";
    return new Response(data, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
});

app.get("/api/projects/:id/fft-cache", async (c) => {
  const id = c.req.param("id");
  const cachePath = path.join(getProjectDir(id), "fft-cache.json");
  try {
    const data = await readFile(cachePath, "utf8");
    return c.json(JSON.parse(data));
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
});

app.put("/api/projects/:id", async (c) => {
  let project: Project;

  try {
    project = await readProject(c.req.param("id"));
  } catch {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  project.name = body.name ?? project.name;
  project.scenes = Array.isArray(body.scenes) ? body.scenes : project.scenes;
  if (body.timeline && typeof body.timeline === "object") {
    project.timeline = body.timeline;
  } else if (Array.isArray(body.tracks)) {
    const tracks = body.tracks as Track[];
    const duration = tracks.reduce((max, track) => {
      const trackEnd = track.items.reduce((itemMax, item) => {
        return Math.max(itemMax, item.startTime + item.duration);
      }, 0);
      return Math.max(max, trackEnd);
    }, 0);
    project.timeline = { duration, tracks };
  }
  project.updatedAt = new Date().toISOString();

  await writeProject(project);
  return c.json({ project });
});

app.patch("/api/projects/:id", async (c) => {
  let project: Project;

  try {
    project = await readProject(c.req.param("id"));
  } catch {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = (await c.req.json().catch(() => ({}))) as ProjectPatchBody;
  const updatedProject = mergeProjectPatch(project, body);

  await writeProject(updatedProject);
  return c.json({ project: updatedProject });
});

// Deprecated: retained for backward compatibility with the legacy one-shot Claude CLI flow.
app.post("/api/ai/generate", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const userPrompt = typeof body.prompt === "string" ? body.prompt : "";
  const requestAssets = Array.isArray(body.assets) ? body.assets : [];
  const projectIdForAssets = typeof body.projectId === "string" ? body.projectId : "";

  const systemPrompt = `You are a video scene generator for vKoma. Generate scenes as a JSON array.
Each scene must have these fields:
- id: a unique string identifier (e.g. "scene-title-1")
- name: display name for the scene
- duration: duration in seconds (number)
- params: object with scene parameters — MUST include at least 3 parameters per scene
- code: the scene type id, one of: "title-scene", "subtitle-scene", "color-scene", "bouncing-text-scene", "outro-scene", "particles-scene", "gradient-scene", "zoom-in-scene", "slide-in-scene", "fade-in-scene"

Available preset params:
- title-scene: text, fontSize, color, bgColor
- subtitle-scene: text, fontSize, color, bgColor
- color-scene: speed
- bouncing-text-scene: text, fontSize, color, bgColor
- outro-scene: text, fontSize, color, bgColor
- particles-scene: count, speed, color, bgColor
- gradient-scene: color1, color2, speed
- zoom-in-scene: text, fontSize, color, bgColor
- slide-in-scene: text, fontSize, color, bgColor
- fade-in-scene: text, fontSize, color, bgColor

Optionally, you may include a "renderCode" field with a JavaScript function body (parameters: ctx, params, time) to define a fully custom draw function. When renderCode is provided, the code field can be any unique id. The function body has access to the Canvas 2D context (ctx), the params object, and time in seconds.

When generating scenes for "IrisOut" or "IRIS OUT" band music videos, use: gradient backgrounds + typography with "IRIS OUT" text + particles + geometric shapes (circles, triangles, lines).

You may also include an "audioTracks" array in your response to add audio assets to audio tracks.
Each audio track object should have:
- assetId: the asset ID from the available assets list
- name: display name (optional)
- startTime: start time in seconds (optional, default 0)
- duration: duration in seconds (optional, defaults to total video duration)
- volume: volume 0.0-1.0 (optional, default 1.0)

Example response with audio: {"scenes": [...], "audioTracks": [{"assetId": "abc-123", "startTime": 0, "volume": 0.8}]}

Respond with ONLY a JSON object: {"scenes": [...]}
`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const send = (obj: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const closeController = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      let effectiveSystemPrompt = systemPrompt;
      try {
        const specPath = path.resolve(__dirname, "../../..", "docs/scene-authoring.md");
        const specContent = await readFile(specPath, "utf-8");
        effectiveSystemPrompt =
          "以下はvKomaのシーン作成ガイドです。このガイドに従ってシーンコードを生成してください。\n\n" +
          specContent +
          "\n\n---\n\n" +
          systemPrompt;
      } catch {
        // Use systemPrompt as fallback
      }

      const claudePath = process.env.CLAUDE_PATH || "/Users/kojira/.local/bin/claude";
      const startTime = Date.now();
      let enrichedPrompt = userPrompt;
      if (projectIdForAssets && requestAssets.length > 0) {
        enrichedPrompt += "\n\n利用可能なアセット一覧:\n" + JSON.stringify(requestAssets, null, 2);
      }
      const child = spawn(
        claudePath,
        [
          "--system-prompt", effectiveSystemPrompt,
          "-p", enrichedPrompt,
          "--output-format", "text",
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const heartbeatTimer = setInterval(() => {
        send({ type: "heartbeat", elapsed: Math.floor((Date.now() - startTime) / 1000) });
      }, 3000);

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        send({ type: "chunk", chunk });
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        clearInterval(heartbeatTimer);
        if (code !== 0) {
          const error =
            code === 143
              ? "claude process was killed (possibly timed out or out of memory)"
              : stderr || `claude exited with code ${code}`;
          send({ error, done: true });
          closeController();
          return;
        }

        try {
          const text = stdout;

          // Extract JSON from various formats (markdown code blocks or raw JSON)
          const extractJSON = (rawText: string): string | null => {
            // 1. Try markdown code block ```json...``` or ```...```
            const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
              const candidate = codeBlockMatch[1].trim();
              if (candidate.startsWith("{")) return candidate;
            }
            // 2. Try raw JSON object
            const jsonObjMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonObjMatch) return jsonObjMatch[0];
            return null;
          };

          const jsonStr = extractJSON(text);
          if (!jsonStr) {
            console.error(
              "[ai/generate] Failed to extract JSON. stdout[:500]:",
              stdout.slice(0, 500),
            );
            send({ error: "Failed to parse AI response", done: true });
            closeController();
            return;
          }

          let generated: { scenes?: unknown[] };
          try {
            generated = JSON.parse(jsonStr) as { scenes?: unknown[] };
          } catch (parseErr) {
            console.error(
              "[ai/generate] JSON.parse failed. jsonStr[:500]:",
              jsonStr.slice(0, 500),
            );
            send({ error: "Failed to parse AI response: invalid JSON", done: true });
            closeController();
            return;
          }
          send({ scenes: generated.scenes ?? [], done: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("[ai/generate] Unexpected error:", err);
          send({ error: message, done: true });
        }
        closeController();
      });

      child.on("error", (err) => {
        clearInterval(heartbeatTimer);
        send({ error: err.message, done: true });
        closeController();
      });

      child.stdin.end();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

app.get("/api/render/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const fps = Number(c.req.query("fps") || "30") || 30;

  let project: Project;
  try {
    project = await readProject(projectId);
  } catch {
    return c.json({ error: "Project not found" }, 404);
  }

  const tracks = Array.isArray(project.timeline?.tracks) ? project.timeline.tracks : undefined;
  const scenes = deserializeServerScenes(project.scenes);
  if (!tracks && scenes.length === 0) {
    return c.json({ error: "No scenes to render" }, 400);
  }

  const totalFrames = tracks
    ? Math.ceil(((project.timeline?.duration ?? 0) * fps))
    : (getSceneFrameRanges(scenes, fps).at(-1)?.endFrame ?? 0);
  if (totalFrames <= 0) {
    return c.json({ error: "No frames to render" }, 400);
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "vkoma-render-"));

  try {
    const outputPath = path.join(tmpDir, "output.mp4");
    const tracks = Array.isArray(project.timeline?.tracks) ? project.timeline.tracks : undefined;
    const { frameCaptureMs, ffmpegMs } = await renderVideo(
      scenes,
      project.scenes,
      fps,
      totalFrames,
      outputPath,
      undefined,
      undefined,
      tracks,
    );

    console.log(`[GET render] frame capture (${totalFrames} frames): ${frameCaptureMs}ms, ffmpeg encode: ${ffmpegMs}ms, total: ${frameCaptureMs + ffmpegMs}ms`);

    const projectOutputPath = path.join(getProjectDir(projectId), "output.mp4");
    await copyFile(outputPath, projectOutputPath);

    const mp4Data = await readFile(outputPath);
    const totalMs = frameCaptureMs + ffmpegMs;
    const videoDuration = totalFrames / fps;
    const rtf = videoDuration / (totalMs / 1000);

    return new Response(mp4Data, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="vkoma-export.mp4"`,
        "X-Render-Frames": String(totalFrames),
        "X-Render-Frame-Capture-Ms": String(frameCaptureMs),
        "X-Render-Ffmpeg-Ms": String(ffmpegMs),
        "X-Render-Total-Ms": String(totalMs),
        "X-Render-RTF": String(rtf.toFixed(4)),
      },
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.get("/api/projects/:id/download", async (c) => {
  const id = c.req.param("id");
  const projectOutputPath = path.join(getProjectDir(id), "output.mp4");
  let mp4Data: Buffer;
  try {
    mp4Data = await readFile(projectOutputPath);
  } catch {
    return c.json({ error: "No rendered video found. Please export first." }, 404);
  }
  return new Response(new Uint8Array(mp4Data), {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="vkoma-export.mp4"`,
    },
  });
});

app.get("/api/render/:projectId/stream", async (c) => {
  const projectId = c.req.param("projectId");
  const fps = Number(c.req.query("fps") || "30") || 30;

  let project: Project;
  try {
    project = await readProject(projectId);
  } catch {
    return c.json({ error: "Project not found" }, 404);
  }

  const tracks = Array.isArray(project.timeline?.tracks) ? project.timeline.tracks : undefined;
  const scenes = deserializeServerScenes(project.scenes);
  if (!tracks && scenes.length === 0) {
    return c.json({ error: "No scenes to render" }, 400);
  }

  const totalFrames = tracks
    ? Math.ceil(((project.timeline?.duration ?? 0) * fps))
    : (getSceneFrameRanges(scenes, fps).at(-1)?.endFrame ?? 0);
  if (totalFrames <= 0) {
    return c.json({ error: "No frames to render" }, 400);
  }

  const abortController = new AbortController();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (obj: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const closeController = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      const tmpDir = path.join(os.tmpdir(), `vkoma-render-stream-${Date.now()}`);
      mkdir(tmpDir, { recursive: true }).then(async () => {
        try {
          const outputPath = path.join(tmpDir, "output.mp4");
          const tracks = Array.isArray(project.timeline?.tracks) ? project.timeline.tracks : undefined;
          const { frameCaptureMs, ffmpegMs } = await renderVideo(
            scenes,
            project.scenes,
            fps,
            totalFrames,
            outputPath,
            undefined,
            undefined,
            tracks,
            {
              signal: abortController.signal,
              onFrameUpdate: (rendered, total) => {
                const percent = Math.round((rendered / total) * 100);
                send({ type: "progress", rendered, total, percent });
              },
            },
          );

          console.log(`[SSE render] frame capture (${totalFrames} frames): ${frameCaptureMs}ms, ffmpeg encode: ${ffmpegMs}ms`);
          send({ type: "done", url: `/api/render/${projectId}` });
        } catch (err) {
          if (abortController.signal.aborted) return;
          const message = err instanceof Error ? err.message : "Unknown error";
          send({ type: "error", message });
        } finally {
          closeController();
          rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
      });
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

app.post("/api/render", async (c) => {
  let projectId = "";
  let fps = 30;
  let bgmData: ArrayBuffer | null = null;
  let bgmFilename = "bgm.wav";

  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    projectId = (formData.get("projectId") as string) || "";
    const fpsStr = formData.get("fps");
    if (fpsStr) fps = Number(fpsStr) || 30;
    const bgmFile = formData.get("bgm") as File | null;
    if (bgmFile) {
      bgmData = await bgmFile.arrayBuffer();
      bgmFilename = bgmFile.name || "bgm.wav";
    }
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await c.req.parseBody();
    projectId = typeof body.projectId === "string" ? body.projectId : "";
    const fpsStr = body.fps;
    if (fpsStr) fps = Number(fpsStr) || 30;
  } else {
    const body = await c.req.json().catch(() => ({}));
    projectId = typeof body.projectId === "string" ? body.projectId : "";
    fps = typeof body.fps === "number" ? body.fps : 30;
  }

  if (!projectId) {
    return c.json({ error: "projectId is required" }, 400);
  }

  let project: Project;
  try {
    project = await readProject(projectId);
  } catch {
    return c.json({ error: "Project not found" }, 404);
  }

  const tracks = Array.isArray(project.timeline?.tracks) ? project.timeline.tracks : undefined;
  const scenes = deserializeServerScenes(project.scenes);
  if (!tracks && scenes.length === 0) {
    return c.json({ error: "No scenes to render" }, 400);
  }

  const totalFrames = tracks
    ? Math.ceil(((project.timeline?.duration ?? 0) * fps))
    : (getSceneFrameRanges(scenes, fps).at(-1)?.endFrame ?? 0);
  if (totalFrames <= 0) {
    return c.json({ error: "No frames to render" }, 400);
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "vkoma-render-"));

  try {
    const outputPath = path.join(tmpDir, "output.mp4");
    let bgmPath: string | undefined;
    if (bgmData) {
      bgmPath = path.join(tmpDir, bgmFilename);
      await writeFile(bgmPath, Buffer.from(bgmData));
    }

    let beatTimings: number[] | undefined;
    if (bgmPath) {
      try {
        const analysis = await analyzeAudio(bgmPath);
        beatTimings = analysis.kicks;
        console.log(`[render] Audio analyzed: BPM=${analysis.bpm}, kicks=${analysis.kicks.length}`);
      } catch (err) {
        console.warn("[render] Audio analysis failed:", err);
      }
    }

    const { frameCaptureMs, ffmpegMs } = await renderVideo(
      scenes,
      project.scenes,
      fps,
      totalFrames,
      outputPath,
      bgmPath,
      beatTimings,
      tracks,
    );

    console.log(`[POST render] frame capture (${totalFrames} frames): ${frameCaptureMs}ms, ffmpeg encode: ${ffmpegMs}ms, total: ${frameCaptureMs + ffmpegMs}ms`);

    const mp4Data = await readFile(outputPath);

    return new Response(mp4Data, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="vkoma-export.mp4"`,
      },
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ─────────────────────────────────────────────
// Asset management helpers
// ─────────────────────────────────────────────

function getAssetsDir(projectId: string) {
  return path.join(getProjectDir(projectId), "assets");
}

function getAssetsMetaFile(projectId: string) {
  return path.join(getProjectDir(projectId), "assets.json");
}

async function readAssetLibrary(projectId: string): Promise<AssetLibrary> {
  const metaFile = getAssetsMetaFile(projectId);
  try {
    const raw = await readFile(metaFile, "utf8");
    return JSON.parse(raw) as AssetLibrary;
  } catch {
    return { assets: [] };
  }
}

async function writeAssetLibrary(projectId: string, library: AssetLibrary): Promise<void> {
  const metaFile = getAssetsMetaFile(projectId);
  await writeFile(metaFile, JSON.stringify(library, null, 2), "utf8");
}

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

function inferAssetType(mimeType: string, filename: string) {
  const normalizedMimeType = mimeType.split(";")[0].trim().toLowerCase();
  let assetType = getAssetType(normalizedMimeType);
  if (assetType) {
    return assetType;
  }

  const extension = path.extname(filename).toLowerCase();
  if (AUDIO_EXTENSIONS.includes(extension)) {
    return "audio" as const;
  }
  if (VIDEO_EXTENSIONS.includes(extension)) {
    return "video" as const;
  }
  if (IMAGE_EXTENSIONS.includes(extension)) {
    return "image" as const;
  }
  return null;
}

function extensionForMimeType(mimeType: string): string {
  const normalizedMimeType = mimeType.split(";")[0].trim().toLowerCase();
  const extensionMap: Record<string, string> = {
    "audio/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
    "audio/webm": ".webm",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
  };
  return extensionMap[normalizedMimeType] ?? "";
}

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) {
    return "download";
  }

  const sanitized = path.basename(trimmed).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  return sanitized.length > 0 ? sanitized : "download";
}

function filenameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const rawSegment = parsed.pathname.split("/").pop();
    if (!rawSegment) {
      return null;
    }

    return sanitizeFilename(decodeURIComponent(rawSegment));
  } catch {
    return null;
  }
}

async function saveAssetFile(
  projectId: string,
  fileData: Uint8Array,
  filename: string,
  mimeType: string,
): Promise<Asset> {
  const normalizedMimeType = mimeType.split(";")[0].trim().toLowerCase();
  const safeFilename = sanitizeFilename(filename);
  const assetType = inferAssetType(normalizedMimeType, safeFilename);
  if (!assetType) {
    throw new Error(`Unsupported MIME type: ${normalizedMimeType}`);
  }

  const assetsDir = getAssetsDir(projectId);
  await mkdir(assetsDir, { recursive: true });

  const destPath = path.join(assetsDir, safeFilename);
  await writeFile(destPath, fileData);

  const fileStat = await stat(destPath);

  let width: number | undefined;
  let height: number | undefined;
  if (assetType === "image") {
    try {
      const img = await loadImage(destPath);
      width = img.width;
      height = img.height;
    } catch {
      // 画像のメタデータ取得失敗は無視
    }
  }

  const asset: Asset = {
    id: crypto.randomUUID(),
    type: assetType,
    name: safeFilename,
    filename: safeFilename,
    mimeType: normalizedMimeType,
    size: fileStat.size,
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
    duration: 0,
    projectPath: `assets/${safeFilename}`,
    createdAt: new Date().toISOString(),
  };

  const library = await readAssetLibrary(projectId);
  library.assets.push(asset);
  await writeAssetLibrary(projectId, library);

  // For audio assets, also copy as BGM and trigger FFT analysis
  if (assetType === "audio") {
    const projectDir = getProjectDir(projectId);
    const ext = path.extname(safeFilename).toLowerCase() || ".wav";
    const bgmPath = path.join(projectDir, `bgm${ext}`);
    try {
      // Remove any existing BGM files
      const files = await readdir(projectDir);
      for (const f of files) {
        if (/^bgm\.(wav|mp3|ogg|aac|flac|m4a|webm)$/.test(f)) {
          await rm(path.join(projectDir, f)).catch(() => {});
        }
      }
      await writeFile(bgmPath, fileData);
      // Generate FFT cache asynchronously
      (async () => {
        try {
          const analyzer = createAudioAnalyzer(bgmPath, { bands: 32, fps: 30 });
          const frames: Array<{ bands: number[]; beatIntensity: number }> = [];
          for (let i = 0; i < analyzer.totalFrames; i++) {
            const fd = analyzer.getFrame(i);
            frames.push({ bands: fd.bands, beatIntensity: fd.beatIntensity });
          }
          const cachePath = path.join(projectDir, "fft-cache.json");
          await writeFile(cachePath, JSON.stringify({ frames }), "utf8");
          console.log(`[FFT cache] generated ${frames.length} frames for asset ${safeFilename}`);
        } catch (e) {
          console.error("[FFT cache] failed for asset", safeFilename, e);
        }
      })();
    } catch (e) {
      console.error("[BGM copy] failed for asset", safeFilename, e);
    }
  }

  return asset;
}

// ─────────────────────────────────────────────
// Asset CRUD endpoints
// ─────────────────────────────────────────────

// GET /api/projects/:id/assets — アセット一覧取得
app.get("/api/projects/:id/assets", async (c) => {
  const projectId = c.req.param("id");
  try {
    const library = await readAssetLibrary(projectId);
    return c.json(library);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// POST /api/projects/:id/assets — ファイルアップロード
app.post("/api/projects/:id/assets", async (c) => {
  const projectId = c.req.param("id");
  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return c.json({ error: "file field is required" }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const asset = await saveAssetFile(projectId, new Uint8Array(arrayBuffer), file.name, file.type);
    return c.json({ asset }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Unsupported MIME type:")) {
      return c.json({ error: err.message }, 400);
    }
    return c.json({ error: String(err) }, 500);
  }
});

// POST /api/projects/:id/assets/fetch-url — URLからアセット取得
app.post("/api/projects/:id/assets/fetch-url", async (c) => {
  const projectId = c.req.param("id");
  try {
    const body = await c.req.json().catch(() => null);
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const requestedFilename =
      typeof body?.filename === "string" && body.filename.trim().length > 0
        ? sanitizeFilename(body.filename)
        : null;

    if (!url) {
      return c.json({ error: "url is required" }, 400);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return c.json({ error: "Invalid URL" }, 400);
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return c.json({ error: "Only HTTP(S) URLs are supported" }, 400);
    }

    const response = await fetch(parsedUrl, {
      signal: AbortSignal.timeout(60_000),
      headers: {
        Accept: "*/*",
      },
    });

    if (!response.ok) {
      return c.json(
        { error: `Failed to fetch URL: ${response.status} ${response.statusText}` },
        400,
      );
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const inferredFilename = requestedFilename ?? filenameFromUrl(parsedUrl.toString()) ?? "download";
    const filename = path.extname(inferredFilename)
      ? inferredFilename
      : `${inferredFilename}${extensionForMimeType(contentType)}`;
    const arrayBuffer = await response.arrayBuffer();
    const asset = await saveAssetFile(projectId, new Uint8Array(arrayBuffer), filename, contentType);

    return c.json({ asset }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Unsupported MIME type:")) {
      return c.json({ error: err.message }, 400);
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return c.json({ error: "Timed out while fetching the remote file" }, 504);
    }
    return c.json({ error: String(err) }, 500);
  }
});

// DELETE /api/projects/:id/assets/:assetId — アセット削除
app.delete("/api/projects/:id/assets/:assetId", async (c) => {
  const projectId = c.req.param("id");
  const assetId = c.req.param("assetId");
  try {
    const library = await readAssetLibrary(projectId);
    const assetIndex = library.assets.findIndex((a) => a.id === assetId);
    if (assetIndex === -1) {
      return c.json({ error: "Asset not found" }, 404);
    }

    const asset = library.assets[assetIndex];
    const filePath = path.join(getProjectDir(projectId), asset.projectPath);

    // ファイル削除（存在しなくてもOK）
    await unlink(filePath).catch(() => {});

    // メタデータから削除
    library.assets.splice(assetIndex, 1);
    await writeAssetLibrary(projectId, library);

    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// GET /api/projects/:id/assets/:assetId/file — アセットファイル取得
app.get("/api/projects/:id/assets/:assetId/file", async (c) => {
  const projectId = c.req.param("id");
  const assetId = c.req.param("assetId");
  try {
    const library = await readAssetLibrary(projectId);
    const asset = library.assets.find((a) => a.id === assetId);
    if (!asset) {
      return c.json({ error: "Asset not found" }, 404);
    }

    const filePath = path.join(getProjectDir(projectId), asset.projectPath);
    const data = await readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(asset.filename)}"; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
        "Content-Length": String(asset.size),
      },
    });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

app.get("/api/settings", (c) => {
  return c.json({ projectsDir: projectsRoot });
});

app.post("/api/settings", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const newDir = typeof body.projectsDir === "string" ? body.projectsDir.trim() : "";
  if (!newDir) {
    return c.json({ error: "projectsDir is required" }, 400);
  }
  fs.mkdirSync(newDir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ projectsDir: newDir }, null, 2), "utf8");
  projectsRoot = newDir;
  return c.json({ ok: true, projectsDir: projectsRoot });
});

const port = 3001;

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  () => {
    console.log(`vKoma server listening on http://localhost:${port}`);
  },
);

createChatServer(server, {
  path: "/terminal-ws",
  provider: process.env.AI_PROVIDER || "claude",
  cwd: projectsRoot,
  env: { ...process.env, PATH: process.env.PATH + ":/usr/local/bin:/Users/kojira/.local/bin" },
  getSystemPrompt: async (searchParams: URLSearchParams) => {
    const projectId = searchParams.get("projectId");
    if (!projectId) return undefined;
    try {
      const project = await readProject(projectId);
      const sceneCount = Array.isArray(project.scenes) ? project.scenes.length : 0;
      const trackCount = project.timeline?.tracks?.length ?? 0;
      const duration = project.timeline?.duration ?? 0;
      return [
        `## 現在のvKomaプロジェクト`,
        `- プロジェクト名: ${project.name}`,
        `- プロジェクトID: ${projectId}`,
        `- シーン数: ${sceneCount}`,
        `- トラック数: ${trackCount}`,
        `- 全体の長さ: ${duration}秒`,
        `- API Base: http://localhost:3001/api/projects/${projectId}`,
        ``,
        `プロジェクトの操作にはcurlでAPIを叩いてください。`,
        `例: curl http://localhost:3001/api/projects/${projectId} | jq`,
      ].join("\n");
    } catch {
      return undefined;
    }
  },
});
