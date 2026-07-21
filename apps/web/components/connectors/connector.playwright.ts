// @ts-nocheck -- Browser acceptance scenario; @playwright/test is supplied by the e2e harness.
import { expect, test } from "@playwright/test";

test("a pinned connector hides offscreen and returns with its mention", async ({ page }) => {
  const digest = process.env.CONNECTOR_FIXTURE_DIGEST;
  test.skip(!digest, "Set CONNECTOR_FIXTURE_DIGEST to an extracted paper fixture");

  await page.goto(`/read/${digest}`);
  const mention = page.locator("[data-connector-mention]").first();
  await mention.click();

  const cardAsset = await mention.getAttribute("data-connector-asset");
  const connector = page.locator(`[data-connector-for="${cardAsset}"]`);
  await expect(connector).toBeVisible();

  const originalScrollTop = await page.locator("[data-connector-reader]").evaluate((reader) => {
    const current = reader.scrollTop;
    reader.scrollTop = reader.scrollHeight;
    return current;
  });
  await expect(connector).toBeHidden();

  await page.locator("[data-connector-reader]").evaluate(
    (reader, scrollTop) => { reader.scrollTop = scrollTop; },
    originalScrollTop,
  );
  await expect(connector).toBeVisible();
});
