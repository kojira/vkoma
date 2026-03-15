import { execSync } from "node:child_process";
import { copyFileSync, statSync, writeFileSync } from "node:fs";
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
  writeFileSync(mp4Path, Buffer.from(mp4Buffer));

  // 4. Extract a frame with ffmpeg
  const framePath = "/tmp/emoji-frame.png";
  execSync(`ffmpeg -ss 1 -i ${mp4Path} -frames:v 1 ${framePath} -y`, {
    timeout: 30_000,
  });

  // Save a copy for visual inspection
  const inspectPath = "/Volumes/2TB/openclaw/workspace/emoji-frame-verify.png";
  copyFileSync(framePath, inspectPath);

  // 5. Assert the frame is a valid PNG with meaningful content
  const frameStats = statSync(framePath);
  expect(frameStats.size).toBeGreaterThan(5000);

  const fileInfo = execSync(`file ${framePath}`).toString();
  expect(fileInfo).toContain("PNG");

  // 6. Pixel-level emoji verification using @napi-rs/canvas
  const { loadImage, createCanvas } = await import(
    "/Volumes/2TB/openclaw/workspace/projects/vkoma/node_modules/.pnpm/@napi-rs+canvas@0.1.96/node_modules/@napi-rs/canvas"
  );

  const image = await loadImage(framePath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);

  // Sample center region where emoji text is rendered (for 1920x1080 frame)
  const sampleX = 400;
  const sampleY = 430;
  const sampleW = 500;
  const sampleH = 200;
  const imageData = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
  const pixels = imageData.data;

  let colorfulPixelCount = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;

    // Skip near-white pixels
    if (r > 200 && g > 200 && b > 200) continue;
    // Skip near-black pixels
    if (r < 50 && g < 50 && b < 50) continue;
    // Skip background color #111827 (r≈17, g≈24, b≈39) with ±20 tolerance
    if (Math.abs(r - 17) < 20 && Math.abs(g - 24) < 20 && Math.abs(b - 39) < 20) continue;

    colorfulPixelCount++;
  }

  // Emoji characters (⚡🎬) contain bright yellow, orange, and colored pixels.
  // Tofu boxes are just gray rectangular outlines with no colorful pixels.
  expect(colorfulPixelCount).toBeGreaterThan(100);
});
