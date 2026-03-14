import { serve } from "@hono/node-server";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";

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
- params: object with scene parameters (text, fontSize, color, bgColor, etc.)
- code: the scene type id, one of: "title-scene", "subtitle-scene", "color-scene", "bouncing-text-scene", "outro-scene"

Respond with ONLY a JSON object: {"scenes": [...]}
`;

  const fullPrompt = systemPrompt + "\n\nUser request: " + userPrompt;

  try {
    const result = await new Promise<string>((resolve, reject) => {
      execFile(
        "claude",
        ["-p", fullPrompt, "--output-format", "json"],
        { timeout: 60_000 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            resolve(stdout);
          }
        },
      );
    });

    // Claude with --output-format json wraps result in a JSON object with a "result" field
    let parsed: { result?: string };
    try {
      parsed = JSON.parse(result);
    } catch {
      parsed = { result };
    }

    const text = typeof parsed.result === "string" ? parsed.result : result;

    // Extract JSON from the text (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return c.json({ error: "Failed to parse AI response" }, 500);
    }

    const generated = JSON.parse(jsonMatch[0]) as { scenes?: unknown[] };
    return c.json({ scenes: generated.scenes ?? [], bgmUrl: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
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
