import { serve } from "@hono/node-server";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import {
  type SceneParam,
  defineScene,
  params as sceneParams,
  renderScene,
  allScenePresets,
  getSceneFrameRanges,
  getSceneAtFrame,
  type SceneItem,
} from "../../core/src/index";
import { analyzeAudio } from "./audio-analyze.js";
import { createAudioAnalyzer } from '../../audio/src/index.js';
import { WorkerPool } from "./workerPool.js";

GlobalFonts.registerFromPath("/System/Library/Fonts/Apple Color Emoji.ttc", "Apple Color Emoji");

interface Project {
  id: string;
  name: string;
  scenes: unknown[];
  createdAt: string;
  updatedAt: string;
}

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
const projectsRoot = path.join(os.homedir(), "vkoma-projects");

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

function deserializeServerScenes(rawScenes: unknown): SceneItem[] {
  if (!Array.isArray(rawScenes)) return [];

  return rawScenes
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

      if (!preset) return null;

      return {
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
    })
    .filter((scene): scene is SceneItem => scene !== null);
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
  project.updatedAt = new Date().toISOString();

  await writeProject(project);
  return c.json({ project });
});

app.post("/api/ai/generate", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const userPrompt = typeof body.prompt === "string" ? body.prompt : "";

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

Respond with ONLY a JSON object: {"scenes": [...]}
`;

  const fullPrompt = systemPrompt + "\n\nUser request: " + userPrompt;

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

      const claudePath = process.env.CLAUDE_PATH || "/Users/kojira/.local/bin/claude";
      const child = spawn(claudePath, ["-p", fullPrompt, "--output-format", "json"], {
        timeout: 120_000,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        send({ chunk });
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code !== 0) {
          send({ error: stderr || `claude exited with code ${code}`, done: true });
          closeController();
          return;
        }

        try {
          let parsed: { result?: string };
          try {
            parsed = JSON.parse(stdout);
          } catch {
            parsed = { result: stdout };
          }

          const text = typeof parsed.result === "string" ? parsed.result : stdout;

          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            send({ error: "Failed to parse AI response", done: true });
            closeController();
            return;
          }

          const generated = JSON.parse(jsonMatch[0]) as { scenes?: unknown[] };
          send({ scenes: generated.scenes ?? [], done: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          send({ error: message, done: true });
        }
        closeController();
      });

      child.on("error", (err) => {
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

  const scenes = deserializeServerScenes(project.scenes);
  if (scenes.length === 0) {
    return c.json({ error: "No scenes to render" }, 400);
  }

  const ranges = getSceneFrameRanges(scenes, fps);
  const totalFrames = ranges[ranges.length - 1]?.endFrame ?? 0;
  if (totalFrames <= 0) {
    return c.json({ error: "No frames to render" }, 400);
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "vkoma-render-"));

  try {
    const outputPath = path.join(tmpDir, "output.mp4");
    const { frameCaptureMs, ffmpegMs } = await renderVideo(scenes, project.scenes, fps, totalFrames, outputPath);

    console.log(`[GET render] frame capture (${totalFrames} frames): ${frameCaptureMs}ms, ffmpeg encode: ${ffmpegMs}ms, total: ${frameCaptureMs + ffmpegMs}ms`);

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

app.get("/api/render/:projectId/stream", async (c) => {
  const projectId = c.req.param("projectId");
  const fps = Number(c.req.query("fps") || "30") || 30;

  let project: Project;
  try {
    project = await readProject(projectId);
  } catch {
    return c.json({ error: "Project not found" }, 404);
  }

  const scenes = deserializeServerScenes(project.scenes);
  if (scenes.length === 0) {
    return c.json({ error: "No scenes to render" }, 400);
  }

  const ranges = getSceneFrameRanges(scenes, fps);
  const totalFrames = ranges[ranges.length - 1]?.endFrame ?? 0;
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
          const { frameCaptureMs, ffmpegMs } = await renderVideo(
            scenes,
            project.scenes,
            fps,
            totalFrames,
            outputPath,
            undefined,
            undefined,
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

  const scenes = deserializeServerScenes(project.scenes);
  if (scenes.length === 0) {
    return c.json({ error: "No scenes to render" }, 400);
  }

  const ranges = getSceneFrameRanges(scenes, fps);
  const totalFrames = ranges[ranges.length - 1]?.endFrame ?? 0;
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

    const { frameCaptureMs, ffmpegMs } = await renderVideo(scenes, project.scenes, fps, totalFrames, outputPath, bgmPath, beatTimings);

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

const port = 3001;

serve(
  {
    fetch: app.fetch,
    port,
  },
  () => {
    console.log(`vKoma server listening on http://localhost:${port}`);
  },
);
