import { serve } from "@hono/node-server";
import { Hono } from "hono";

interface Project {
  id: string;
  name: string;
  scenes: unknown[];
  createdAt: string;
  updatedAt: string;
}

const app = new Hono();
const projects: Project[] = [];

app.get("/api/projects", (c) => {
  return c.json({ projects });
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

  projects.push(project);
  return c.json({ project }, 201);
});

app.get("/api/projects/:id", (c) => {
  const project = projects.find((entry) => entry.id === c.req.param("id"));
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  return c.json({ project });
});

app.put("/api/projects/:id", async (c) => {
  const project = projects.find((entry) => entry.id === c.req.param("id"));
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  project.name = body.name ?? project.name;
  project.scenes = Array.isArray(body.scenes) ? body.scenes : project.scenes;
  project.updatedAt = new Date().toISOString();

  return c.json({ project });
});

app.post("/api/ai/generate", (c) => {
  return c.json({
    result: "AI generation mock - implement with Claude Code CLI",
  });
});

const port = 3000;

serve(
  {
    fetch: app.fetch,
    port,
  },
  () => {
    console.log(`vKoma server listening on http://localhost:${port}`);
  },
);
