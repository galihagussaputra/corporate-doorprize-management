import { expect, test } from "@playwright/test";

const DEMO_SLUG = "local-demo-display-5f3a9c2e7b1d4806ba47e91c2d6f8305";

test("login page is reachable", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Event control/i })).toBeVisible();
});

test("public display is read-only and shows standby state after db reset", async ({ page }) => {
  await page.goto(`/display/${DEMO_SLUG}`);
  await expect(page.getByText(/GET READY|CONNECTING TO THE STAGE|Corporate doorprize/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /start draw|complete draw|void/i })).toHaveCount(0);
});
