import { serve } from "@hono/node-server";
import { spawn, execSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { chromium } from "playwright-core";

interface Project {
  id: string;
  name: string;
  scenes: unknown[];
  createdAt: string;
  updatedAt: string;
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
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
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
          controller.close();
          return;
        }

        try {
          // Claude with --output-format json wraps result in a JSON object with a "result" field
          let parsed: { result?: string };
          try {
            parsed = JSON.parse(stdout);
          } catch {
            parsed = { result: stdout };
          }

          const text = typeof parsed.result === "string" ? parsed.result : stdout;

          // Extract JSON from the text (may be wrapped in markdown code blocks)
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            send({ error: "Failed to parse AI response", done: true });
            controller.close();
            return;
          }

          const generated = JSON.parse(jsonMatch[0]) as { scenes?: unknown[] };
          send({ scenes: generated.scenes ?? [], done: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          send({ error: message, done: true });
        }
        controller.close();
      });

      child.on("error", (err) => {
        send({ error: err.message, done: true });
        controller.close();
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

  const scenes = project.scenes as Array<{ duration?: number }>;
  const totalFrames = scenes.reduce((sum, scene) => {
    const duration = typeof scene.duration === "number" ? scene.duration : 1;
    return sum + Math.max(1, Math.round(duration * fps));
  }, 0);

  if (totalFrames <= 0) {
    return c.json({ error: "No frames to render" }, 400);
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "vkoma-render-"));

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    await page.goto(`http://localhost:5174/?projectId=${projectId}`, { waitUntil: "networkidle" });

    // Wait for __vkoma_seekToFrame to be defined
    await page.waitForFunction(() => typeof (window as any).__vkoma_seekToFrame === "function", null, { timeout: 30_000 });

    for (let frame = 0; frame < totalFrames; frame++) {
      await page.evaluate(([f, r]) => (window as any).__vkoma_seekToFrame(f, r), [frame, fps] as const);
      await page.waitForTimeout(100);
      const canvas = page.locator("canvas");
      await canvas.screenshot({ path: path.join(tmpDir, `frame_${String(frame).padStart(6, "0")}.png`) });
    }

    await browser.close();

    const outputPath = path.join(tmpDir, "output.mp4");
    if (bgmData) {
      const bgmPath = path.join(tmpDir, bgmFilename);
      await writeFile(bgmPath, Buffer.from(bgmData));
      execSync(
        `ffmpeg -framerate ${fps} -i "${path.join(tmpDir, "frame_%06d.png")}" -i "${bgmPath}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -c:a aac -shortest -pix_fmt yuv420p "${outputPath}"`,
        { timeout: 120_000 },
      );
    } else {
      execSync(
        `ffmpeg -framerate ${fps} -i "${path.join(tmpDir, "frame_%06d.png")}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`,
        { timeout: 120_000 },
      );
    }

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
