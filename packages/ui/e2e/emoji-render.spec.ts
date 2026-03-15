import { execSync } from "node:child_process";
import { statSync } from "node:fs";
import { expect, test } from "@playwright/test";

const API_BASE = "http://localhost:3001";

test("Emoji text renders correctly in exported video frames", async () => {
  // 1. Create a new project via API
  const createRes = await fetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Emoji Render Test" }),
  });
  expect(createRes.status).toBe(201);
  const { project: { id: projectId } } = (await createRes.json()) as { project: { id: string } };

  // 2. Update project with a single scene containing emoji text
  const updateRes = await fetch(`${API_BASE}/api/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Emoji Render Test",
      scenes: [
        {
          id: "scene-emoji-1",
          name: "Emoji Title",
          duration: 2,
          sceneConfigId: "title-scene",
          params: {
            text: "⚡🎬 Emoji Test",
            fontSize: 72,
            color: "#ffffff",
            bgColor: "#111827",
          },
        },
      ],
    }),
  });
  expect(updateRes.status).toBe(200);

  // 3. Render the video
  const renderRes = await fetch(`${API_BASE}/api/render/${projectId}?fps=30`);
  expect(renderRes.status).toBe(200);

  const mp4Buffer = await renderRes.arrayBuffer();
  expect(mp4Buffer.byteLength).toBeGreaterThan(1000);

  // Write MP4 to temp file
  const mp4Path = "/tmp/emoji-render-test.mp4";
  const { writeFileSync } = await import("node:fs");
  writeFileSync(mp4Path, Buffer.from(mp4Buffer));

  // 4. Extract a frame with ffmpeg
  const framePath = "/tmp/emoji-frame.png";
  execSync(`ffmpeg -ss 1 -i ${mp4Path} -frames:v 1 ${framePath} -y`, {
    timeout: 30_000,
  });

  // 5. Assert the frame is a valid PNG with meaningful content
  const frameStats = statSync(framePath);
  expect(frameStats.size).toBeGreaterThan(5000);

  const fileInfo = execSync(`file ${framePath}`).toString();
  expect(fileInfo).toContain("PNG");
});
