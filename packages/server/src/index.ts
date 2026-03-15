import { serve } from "@hono/node-server";
import { spawn, execSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { createCanvas } from "@napi-rs/canvas";
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

async function renderFramesToDisk(
  scenes: SceneItem[],
  fps: number,
  totalFrames: number,
  tmpDir: string,
) {
  const WIDTH = 1920;
  const HEIGHT = 1080;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const writePromises: Promise<void>[] = [];

  for (let frame = 0; frame < totalFrames; frame++) {
    const hit = getSceneAtFrame(scenes, fps, frame);
    if (!hit) continue;

    const localFrame = frame - hit.startFrame;
    const localTime = localFrame / fps;

    renderScene(hit.scene, ctx as any, WIDTH, HEIGHT, localTime);

    const pngBuffer = canvas.toBuffer("image/png");
    const framePath = path.join(tmpDir, `frame_${String(frame).padStart(6, "0")}.png`);
    writePromises.push(writeFile(framePath, pngBuffer));
  }

  await Promise.all(writePromises);
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
    const t0 = Date.now();
    await renderFramesToDisk(scenes, fps, totalFrames, tmpDir);
    const t1 = Date.now();

    const outputPath = path.join(tmpDir, "output.mp4");
    execSync(
      `ffmpeg -framerate ${fps} -i "${path.join(tmpDir, "frame_%06d.png")}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -preset ultrafast -threads 0 -pix_fmt yuv420p "${outputPath}"`,
      { timeout: 120_000 },
    );
    const t2 = Date.now();

    console.log(`[GET render] frame capture (${totalFrames} frames): ${t1 - t0}ms, ffmpeg encode: ${t2 - t1}ms, total: ${t2 - t0}ms`);

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
    const t0 = Date.now();
    await renderFramesToDisk(scenes, fps, totalFrames, tmpDir);
    const t1 = Date.now();

    const outputPath = path.join(tmpDir, "output.mp4");
    if (bgmData) {
      const bgmPath = path.join(tmpDir, bgmFilename);
      await writeFile(bgmPath, Buffer.from(bgmData));
      execSync(
        `ffmpeg -framerate ${fps} -i "${path.join(tmpDir, "frame_%06d.png")}" -i "${bgmPath}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -preset ultrafast -threads 0 -c:a aac -shortest -pix_fmt yuv420p "${outputPath}"`,
        { timeout: 120_000 },
      );
    } else {
      execSync(
        `ffmpeg -framerate ${fps} -i "${path.join(tmpDir, "frame_%06d.png")}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -preset ultrafast -threads 0 -pix_fmt yuv420p "${outputPath}"`,
        { timeout: 120_000 },
      );
    }
    const t2 = Date.now();

    console.log(`[POST render] frame capture (${totalFrames} frames): ${t1 - t0}ms, ffmpeg encode: ${t2 - t1}ms, total: ${t2 - t0}ms`);

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
