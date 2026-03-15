import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_BASE = "http://localhost:3001";

/** Get the most recently created project ID from the API */
async function getLatestProjectId(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/projects`);
  const data = (await res.json()) as { projects: Array<{ id: string; updatedAt?: string; createdAt?: string }> };
  const projects = data.projects;
  expect(projects.length).toBeGreaterThan(0);
  // Sort by createdAt descending and return the newest
  projects.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return projects[0].id;
}

test("AI generates scenes with unique marker, exports video via API", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Click create button and handle the prompt dialog
  const createButton = page.getByText("+ 新規プロジェクト");
  await createButton.waitFor({ state: "visible", timeout: 10_000 });

  page.once("dialog", (dialog) => dialog.accept("Test Project"));
  await createButton.click();

  // Wait for main editor to load after project creation
  await page.getByTestId("chat-input").waitFor({ state: "visible", timeout: 30_000 });

  // Fill chat input with a prompt
  const chatInput = page.getByTestId("chat-input");
  await chatInput.fill("赤い丸が動くシーン・青い四角が回転するシーン・テキストアニメのシーン・パーティクルエフェクトのシーン・グラデーション背景のシーン、合計5つのシーンを作って");

  const chatSend = page.getByTestId("chat-send");
  await chatSend.click();

  // Wait for SSE response to complete - scene buttons appear in the timeline
  await page.waitForFunction(
    () => {
      const buttons = document.querySelectorAll("button");
      let sceneCount = 0;
      buttons.forEach((b) => {
        if (b.textContent && /\d+\.\d+s/.test(b.textContent) && b.textContent !== "Title Scene 4.0s")
          sceneCount++;
      });
      return sceneCount >= 3;
    },
    { timeout: 180_000 },
  );

  await page.waitForTimeout(2000);

  // Save the project first (required for server-side export)
  await page.locator("text=💾 保存").click();
  await page.waitForTimeout(3000);

  // Get project ID from API
  const projectId = await getLatestProjectId();

  // Call render API directly with fps=1 for speed
  const renderRes = await fetch(`${API_BASE}/api/render/${projectId}?fps=30`);
  expect(renderRes.status).toBe(200);

  const mp4Buffer = await renderRes.arrayBuffer();
  expect(mp4Buffer.byteLength).toBeGreaterThan(1000);

  // RTF計測・記録
  const renderMs = Number(renderRes.headers.get('X-Render-Total-Ms'));
  const rtf = Number(renderRes.headers.get('X-Render-RTF'));
  const rtfHistory = {
    timestamp: new Date().toISOString(),
    commit: execSync('git -C /Volumes/2TB/openclaw/workspace/projects/vkoma rev-parse --short HEAD').toString().trim(),
    frames: Number(renderRes.headers.get('X-Render-Frames')),
    frameCaptureMs: Number(renderRes.headers.get('X-Render-Frame-Capture-Ms')),
    ffmpegMs: Number(renderRes.headers.get('X-Render-Ffmpeg-Ms')),
    totalMs: renderMs,
    rtf: rtf,
  };
  const historyPath = path.join(__dirname, '..', 'test-results', 'rtf-history.json');
  const existing = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, 'utf-8')) : [];
  writeFileSync(historyPath, JSON.stringify([...existing, rtfHistory], null, 2));
  console.log(`RTF: ${rtf.toFixed(2)}x (${renderMs}ms for ${Number(renderRes.headers.get('X-Render-Frames'))} frames)`);
  expect(rtf).toBeGreaterThan(2.0);

  // Post MP4 to Discord if token available
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  if (discordToken) {
    const mp4Path = path.join(__dirname, "..", "test-output.mp4");
    writeFileSync(mp4Path, Buffer.from(mp4Buffer));
    const channelId = "1479115942293409942";
    execSync(
      `curl -s -X POST "https://discord.com/api/v10/channels/${channelId}/messages" ` +
        `-H "Authorization: Bot ${discordToken}" ` +
        `-F 'content=vKoma AI生成動画 E2Eテスト結果' ` +
        `-F 'files[0]=@${mp4Path};type=video/mp4'`,
      { timeout: 30_000 },
    );
  }
});

test("Export video with BGM audio track via API", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const createButton = page.getByText("+ 新規プロジェクト");
  await createButton.waitFor({ state: "visible", timeout: 10_000 });
  page.once("dialog", (dialog) => dialog.accept("BGM Test Project"));
  await createButton.click();

  await page.getByTestId("chat-input").waitFor({ state: "visible", timeout: 30_000 });

  const chatInput = page.getByTestId("chat-input");
  await chatInput.fill("赤い丸が動くシーン1つだけ作って");
  const chatSend = page.getByTestId("chat-send");
  await chatSend.click();

  await page.waitForFunction(
    () => {
      const buttons = document.querySelectorAll("button");
      let sceneCount = 0;
      buttons.forEach((b) => {
        if (b.textContent && /\d+\.\d+s/.test(b.textContent) && b.textContent !== "Title Scene 4.0s")
          sceneCount++;
      });
      return sceneCount >= 1;
    },
    { timeout: 180_000 },
  );

  await page.waitForTimeout(2000);

  // Set BGM file
  const bgmInput = page.getByTestId("bgm-input");
  const testBgmPath = path.resolve(__dirname, "fixtures", "test-bgm.wav");
  await bgmInput.setInputFiles(testBgmPath);

  // Save project
  await page.locator("text=💾 保存").click();
  await page.waitForTimeout(3000);

  // Get project ID
  const projectId = await getLatestProjectId();

  // Export with BGM via POST /api/render (FormData with Node.js native fetch)
  const bgmBytes = readFileSync(testBgmPath);
  const bgmBlob = new Blob([bgmBytes], { type: "audio/wav" });
  const formData = new FormData();
  formData.append("projectId", projectId);
  formData.append("fps", "30");
  formData.append("bgm", bgmBlob, "test-bgm.wav");

  const renderRes = await fetch(`${API_BASE}/api/render`, {
    method: "POST",
    body: formData,
  });
  expect(renderRes.status).toBe(200);

  const mp4Buffer = await renderRes.arrayBuffer();
  expect(mp4Buffer.byteLength).toBeGreaterThan(1000);

  // Write to file and verify audio track
  const mp4Path = path.join(__dirname, "..", "test-output-bgm.mp4");
  writeFileSync(mp4Path, Buffer.from(mp4Buffer));

  const probeOutput = execSync(`ffprobe -i "${mp4Path}" 2>&1 || true`).toString();
  expect(probeOutput).toContain("Audio");
});
