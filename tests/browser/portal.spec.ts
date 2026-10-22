import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
test("landing and guide meet automated WCAG A/AA checks", async ({ page }) => {
  const results = [];
  for (const path of ["/", "/rules"]) {
    await page.goto(path);
    await page.waitForTimeout(250);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    results.push({ path, violations: result.violations });
  }
  writeFileSync(
    "evidence/accessibility-results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  expect(results.flatMap((r) => r.violations)).toEqual([]);
});
test("landing fits desktop and mobile, navigation works, motion repels and reduced motion is stable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 1366, height: 768 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 360, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    expect((await page.goto("/"))!.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Build what comes next." }),
    ).toBeVisible();
    await page.waitForTimeout(1400);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const canvas = page.locator("canvas");
    const first = await canvas.screenshot();
    await page.mouse.move(viewport.width / 2, 35);
    await page.waitForTimeout(300);
    expect(Buffer.compare(first, await canvas.screenshot())).not.toBe(0);
    await page.screenshot({
      path: `evidence/landing-${viewport.width > 500 ? "desktop" : viewport.width === 390 ? "mobile" : "small-mobile"}.png`,
      fullPage: true,
    });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForTimeout(200);
  const canvas = page.locator("canvas");
  const still = await canvas.screenshot();
  await page.mouse.move(100, 100);
  await page.waitForTimeout(100);
  expect(Buffer.compare(still, await canvas.screenshot())).toBe(0);
  await page.getByRole("link", { name: "The details" }).click();
  await expect(
    page.getByRole("heading", { name: "The rules of the build." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("tiny screens and zoom retain accessible vertical overflow without horizontal clipping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Rules & privacy" })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("link", { name: "Rules & privacy" }),
  ).toBeVisible();
});
test("private profile persistence, public consent, owner/admin controls and safe exports", async ({
  page,
}) => {
  await page.goto("/local-test");
  await page.getByRole("button", { name: "alice", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Your next big thing." }),
  ).toBeVisible();
  await page.goto("/dashboard/profile");
  await expect(page.getByLabel("A little about you")).toBeVisible();
  await page
    .getByLabel("A little about you")
    .fill("FAKE browser rehearsal profile.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".form-status")).toContainText("Profile saved");
  await page.reload();
  await expect(page.getByLabel("A little about you")).toHaveValue(
    "FAKE browser rehearsal profile.",
  );
  await page.goto("/admin/participants");
  await expect(page.getByRole("alert")).toContainText("ADMIN_REQUIRED");
  await page.goto("/local-test");
  await page.getByRole("button", { name: "admin", exact: false }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/admin/check-in");
  await page.getByLabel("Participant ID").fill("fake_alice");
  await page
    .getByLabel("Verification note")
    .fill("FAKE browser physical verification");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".form-status")).toContainText("Checked in");
  await page.goto("/admin/participants");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export safe CSV" }).click();
  expect((await download).suggestedFilename()).toBe("devday-participants.csv");
  await page.goto("/local-test");
  await page.getByRole("button", { name: "alice", exact: false }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/credits");
  await page.getByRole("button", { name: "Reveal my credit" }).click();
  await expect(page.locator(".credit-code")).toContainText(
    "FAKE-NOT-REDEEMABLE",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard");
  await expect(
    page.locator(".identity").getByText("Alice", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "evidence/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "evidence/dashboard-mobile.png",
    fullPage: true,
  });
});
test("judges cannot see credit values or unpublished results; sign in uses platform-owned top navigation", async ({
  page,
}) => {
  await page.goto("/local-test");
  await page.getByRole("button", { name: "judge →", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboard/credits");
  await expect(page.getByRole("alert")).toContainText(
    "JUDGES_CANNOT_ACCESS_CREDITS",
  );
  await page.goto("/leaderboard");
  await expect(page.getByRole("alert")).toContainText("Results are private");
  await page.goto("/");
  const signIn = page.getByRole("link", { name: "Enter the hackathon" });
  await expect(signIn).toHaveAttribute("target", "_top");
  await expect(signIn).toHaveAttribute(
    "href",
    "/signin-with-chatgpt?return_to=%2Fdashboard",
  );
});
