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

  // Fill chat input with a prompt that includes a unique marker
  const chatInput = page.getByTestId("chat-input");
  await chatInput.fill("タイトルを'E2E_TEST_OK_99999'にしたシーンを1つ作って");

  const chatSend = page.getByTestId("chat-send");

  const responsePromise = page.waitForResponse(
    resp => resp.url().includes('/api/ai/generate') && resp.status() === 200,
    { timeout: 90_000 }
  );

  await chatSend.click();

  const aiResponse = await responsePromise;
  const aiData = await aiResponse.json();
  expect(aiData.scenes).toBeDefined();
  expect(aiData.scenes.length).toBeGreaterThan(0);
  await page.waitForTimeout(2000);

  // Save the project first (required for server-side export)
  await page.locator("text=💾 保存").click();
  await page.waitForTimeout(2000);

  // Export video - server returns MP4 directly
  // Handle any alert dialogs that might appear during export
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  const downloadPromise = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId("export-button").click();

  const download = await downloadPromise;
  const mp4Path = "/tmp/vkoma-ai-export.mp4";
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
