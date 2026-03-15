import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:3001";

async function getOrCreateProjectId(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/projects`);
  const data = (await res.json()) as { projects: Array<{ id: string }> };
  if (data.projects.length > 0) return data.projects[0].id;

  const createRes = await fetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Project" }),
  });
  const created = (await createRes.json()) as { project: { id: string } };
  return created.project.id;
}

test.describe("vkoma UI", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  let projectUrl: string;

  test.beforeAll(async () => {
    const projectId = await getOrCreateProjectId();
    projectUrl = `/?projectId=${projectId}`;
  });

  test("app loads with main UI elements", async ({ page }) => {
    await page.goto(projectUrl);
    await expect(page.getByRole("heading", { name: "vKoma" })).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.getByText("Describe the scene")).toBeVisible();
  });

  test("TitleScene is shown in timeline", async ({ page }) => {
    await page.goto(projectUrl);
    await expect(page.getByText("Intro").first()).toBeVisible();
  });

  test("play button toggles playback", async ({ page }) => {
    await page.goto(projectUrl);
    const playButton = page.getByRole("button", { name: "Play" });
    await playButton.waitFor({ timeout: 15000 });
    await playButton.click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("can change text parameter", async ({ page }) => {
    await page.goto(projectUrl);
    const titleInput = page.locator('input[type="text"]').first();
    await expect(titleInput).toBeVisible({ timeout: 15000 });
    await expect(titleInput).toHaveValue("vKoma");
    await titleInput.clear();
    await titleInput.fill("Hello World");
    await expect(titleInput).toHaveValue("Hello World");
  });

  test("can add a scene", async ({ page }) => {
    await page.goto(projectUrl);
    const timelineButtons = page.locator(".flex.h-full.w-full > button");
    await timelineButtons.first().waitFor({ timeout: 15000 });
    const beforeCount = await timelineButtons.count();
    await page.getByRole("button", { name: "Add Scene" }).click();
    await expect(timelineButtons).toHaveCount(beforeCount + 1);
  });

  test("export button exists and can be clicked", async ({ page }) => {
    await page.goto(projectUrl);
    const exportButton = page.getByRole("button", { name: "Export" });
    await expect(exportButton).toBeVisible({ timeout: 15000 });
    page.on("dialog", async (dialog) => {
      await dialog.dismiss();
    });
    await exportButton.click();
    await expect(exportButton).toBeVisible();
  });
});
