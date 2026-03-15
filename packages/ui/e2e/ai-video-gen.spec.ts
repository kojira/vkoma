import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("AI generates scenes with unique marker, exports video, posts to Discord", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Click create button and handle the prompt dialog
  const createButton = page.getByText("+ 新規プロジェクト");
  await createButton.waitFor({ state: "visible", timeout: 10_000 });

  // Handle prompt dialog - must be registered before click
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
  await page.waitForTimeout(2000);

  // Export video - server returns MP4 directly
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  const downloadPromise = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId("export-button").click();

  const download = await downloadPromise;
  const mp4Path = "/Volumes/2TB/openclaw/workspace/projects/vkoma/test-output.mp4";
  await download.saveAs(mp4Path);

  expect(existsSync(mp4Path)).toBe(true);
  expect(statSync(mp4Path).size).toBeGreaterThan(10000);

  // Post MP4 to Discord
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  if (discordToken) {
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

test("Export video with BGM audio track", async ({ page }) => {
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
  const testBgmPath = new URL("./fixtures/test-bgm.wav", import.meta.url).pathname;
  await bgmInput.setInputFiles(testBgmPath);

  // Save project
  await page.locator("text=💾 保存").click();
  await page.waitForTimeout(2000);

  // Export
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  const downloadPromise = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId("export-button").click();

  const download = await downloadPromise;
  const mp4Path = "/Volumes/2TB/openclaw/workspace/projects/vkoma/test-output-bgm.mp4";
  await download.saveAs(mp4Path);

  expect(existsSync(mp4Path)).toBe(true);
  expect(statSync(mp4Path).size).toBeGreaterThan(10000);

  // Verify audio track exists
  const probeOutput = execSync(`ffprobe -i "${mp4Path}" 2>&1 || true`).toString();
  expect(probeOutput).toContain("Audio");
});
