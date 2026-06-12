import { expect, test } from "@playwright/test";

import { expectAccessible } from "./helpers";

test("the demo opens with one click and the settle-up plan works", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("note")).toContainText("Demo mode");
  await expectAccessible(page);

  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page.getByRole("heading", { name: "Hi Alex, here are your groups" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Lisbon long weekend/ })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("link", { name: /Friday board games/ }).click();
  await expect(page.getByRole("heading", { name: "Friday board games", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Expenses" }).getByRole("listitem")).toHaveCount(3);
  await expectAccessible(page);

  const steps = page.getByRole("button", { name: /^Record .* paying / });
  const before = await steps.count();
  expect(before).toBeGreaterThan(0);
  await steps.first().click();
  await expect(steps).toHaveCount(before - 1);
  await expect(page.getByRole("heading", { name: "Recorded payments" })).toBeVisible();

  // Pay off the rest: the group is square.
  while ((await steps.count()) > 0) {
    const n = await steps.count();
    await steps.first().click();
    await expect(steps).toHaveCount(n - 1);
  }
  await expect(page.getByText("Everyone is square in GBP.")).toBeVisible();

  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByText(/recorded .* paying/).first()).toBeVisible();
});

test("multi-currency groups keep a ledger per currency", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page.getByRole("link", { name: /Lisbon long weekend/ }).click();
  const currency = page.getByRole("group", { name: "Currency" });
  await expect(currency.getByRole("button", { name: "EUR" })).toHaveAttribute("aria-pressed", "true");
  await currency.getByRole("button", { name: "USD" }).click();
  await expect(page.getByRole("list", { name: "Balances in USD" })).toBeVisible();
  await expect(page.getByText("settle everything in USD")).toBeVisible();
});
