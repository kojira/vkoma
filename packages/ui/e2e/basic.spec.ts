import { test, expect } from "@playwright/test";

test.describe("vkoma UI", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("app loads with main UI elements", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "vKoma" })).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.getByText("Describe the scene")).toBeVisible();
  });

  test("TitleScene is shown in timeline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Intro").first()).toBeVisible();
  });

  test("play button toggles playback", async ({ page }) => {
    await page.goto("/");
    const playButton = page.getByRole("button", { name: "Play" });
    await playButton.click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("can change text parameter", async ({ page }) => {
    await page.goto("/");
    const titleInput = page.locator("input[type=\"text\"]").first();
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveValue("vKoma");
    await titleInput.clear();
    await titleInput.fill("Hello World");
    await expect(titleInput).toHaveValue("Hello World");
  });

  test("can add a scene", async ({ page }) => {
    await page.goto("/");
    const timelineButtons = page.locator(".flex.h-full.w-full > button");
    const beforeCount = await timelineButtons.count();
    await page.getByRole("button", { name: "Add Scene" }).click();
    await expect(timelineButtons).toHaveCount(beforeCount + 1);
  });

  test("export button exists and can be clicked", async ({ page }) => {
    await page.goto("/");
    const exportButton = page.getByRole("button", { name: "Export" });
    await expect(exportButton).toBeVisible();
    page.on("dialog", async (dialog) => { await dialog.dismiss(); });
    await exportButton.click();
    await expect(exportButton).toBeVisible();
  });
});
