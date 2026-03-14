import { expect, test } from '@playwright/test';
import { existsSync, statSync } from 'node:fs';

test('exports a non-empty webm file', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2_000);

  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByTestId('export-button').click();

  const download = await downloadPromise;
  const outputPath = '/tmp/vkoma-output.webm';
  await download.saveAs(outputPath);

  expect(existsSync(outputPath)).toBe(true);
  expect(statSync(outputPath).size).toBeGreaterThan(0);
});
