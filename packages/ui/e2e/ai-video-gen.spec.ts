import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("AI generates 5 scenes, exports video, posts to Discord", async ({ page }) => {
  await page.goto("/");

  // Handle the ProjectSelector: click "+ 新規プロジェクト" and accept the prompt dialog
  page.on("dialog", (dialog) => dialog.accept("Test Project"));
  const createButton = page.getByText("+ 新規プロジェクト");
  if (await createButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await createButton.click();
  }

  // Wait for main editor to load after project creation
  await page.getByTestId("chat-input").waitFor({ state: "visible", timeout: 15_000 });

  // Fill chat input and send
  const chatInput = page.getByTestId("chat-input");
  await chatInput.fill(
    "5つのシーンを作って。タイトル、サブタイトル、カラー背景、バウンステキスト、アウトロ。各シーン3秒。",
  );

  const chatSend = page.getByTestId("chat-send");
  await chatSend.click();

  // Wait for 5 scenes to appear in timeline (timeout 90s)
  const timelineScenes = page.getByTestId("timeline-scenes");
  await expect(async () => {
    const buttons = await timelineScenes.locator("button").count();
    expect(buttons).toBeGreaterThanOrEqual(5);
  }).toPass({ timeout: 90_000 });

  // Export video
  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByTestId("export-button").click();

  const download = await downloadPromise;
  const outputPath = "/tmp/vkoma-ai-export.webm";
  await download.saveAs(outputPath);

  expect(existsSync(outputPath)).toBe(true);
  expect(statSync(outputPath).size).toBeGreaterThan(0);

  // Post to Discord
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  if (discordToken) {
    const channelId = "1479115942293409942";
    const fileContent = readFileSync(outputPath);
    const boundary = "----FormBoundary" + Date.now().toString(36);

    let body = "";
    body += `--${boundary}\r\n`;
    body += 'Content-Disposition: form-data; name="content"\r\n\r\n';
    body += "vKoma AI video generation E2E test result\r\n";
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="files[0]"; filename="vkoma-ai-export.webm"\r\n`;
    body += "Content-Type: video/webm\r\n\r\n";

    // Use curl for multipart upload
    execSync(
      `curl -s -X POST "https://discord.com/api/v10/channels/${channelId}/messages" ` +
        `-H "Authorization: Bot ${discordToken}" ` +
        `-F 'content=vKoma AI video generation E2E test result' ` +
        `-F 'files[0]=@${outputPath};type=video/webm'`,
      { timeout: 30_000 },
    );
  }
});
