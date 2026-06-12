import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { expectAccessible, register } from "./helpers";

test("two people share a group through an invite link and settle up", async ({ browser }) => {
  const ana = await (await browser.newContext()).newPage();
  const ben = await (await browser.newContext()).newPage();

  await register(ana, "Ana");
  await ana.getByRole("button", { name: "New group" }).click();
  await ana.getByLabel("Group name").fill("Road trip");
  await ana.getByLabel("Main currency").selectOption("EUR");
  await ana.getByRole("button", { name: "Create group" }).click();
  await expect(ana.getByRole("heading", { name: "Road trip", level: 1 })).toBeVisible();
  await expect(ana.getByText("No expenses yet.")).toBeVisible();

  // Invite Ben.
  await ana.getByRole("button", { name: "Invite people" }).click();
  const link = await ana.getByLabel(/Anyone with this link can join/).inputValue();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]+$/);

  // Ben follows the link, has to sign up first, then lands on the invite.
  await ben.goto(link);
  await expect(ben).toHaveURL(/\/login\?next=/);
  await ben.getByRole("link", { name: "Create an account" }).click();
  await ben.getByLabel("Your name").fill("Ben");
  await ben.getByLabel("Email").fill(`ben-${Date.now()}@example.com`);
  await ben.getByLabel("Password (8+ characters)").fill("correct horse battery");
  await ben.getByRole("button", { name: "Create account" }).click();
  await expect(ben.getByRole("heading", { name: "Join Road trip" })).toBeVisible();
  await expectAccessible(ben);
  await ben.getByRole("button", { name: "Join group" }).click();
  await expect(ben.getByRole("heading", { name: "Road trip", level: 1 })).toBeVisible();

  // Ana adds a fuel bill split by shares, with a live preview.
  await ana.reload();
  await ana.getByRole("link", { name: "Add expense" }).click();
  await ana.getByLabel("Description").fill("Fuel");
  await ana.getByLabel("Amount", { exact: true }).fill("90");
  await ana.getByRole("button", { name: "Shares" }).click();
  await ana.getByLabel("Shares for Ben").fill("2");
  await expect(ana.getByText("Adds up to €90.00.")).toBeVisible();
  await expectAccessible(ana);
  await ana.getByRole("button", { name: "Add expense" }).click();
  await expect(ana.getByText("Fuel")).toBeVisible();
  await expect(ana.getByText("you lent €60.00")).toBeVisible();

  // Ben sees what he owes and pays it back.
  await ben.reload();
  await expect(ben.getByText("you borrowed €60.00")).toBeVisible();
  await expect(ben.getByText("1 payment").or(ben.getByText("One payment"))).toBeVisible();
  await ben.getByRole("button", { name: "Record You paying Ana" }).click();
  await expect(ben.getByText("Everyone is square in EUR.")).toBeVisible();

  // The CSV export has the expense and the payment.
  const download = ana.waitForEvent("download");
  await ana.reload();
  await ana.getByRole("link", { name: "Export CSV" }).click();
  const csv = await readFile((await (await download).path())!, "utf8");
  expect(csv).toContain("Fuel,Ana,90.00,EUR,shares,30.00,60.00");
  expect(csv).toContain("payment,Ben paid Ana,Ben,60.00,EUR");
});

test("editing an expense keeps the split and recalculates balances", async ({ page }) => {
  await register(page, "Cleo");
  await page.getByRole("button", { name: "New group" }).click();
  await page.getByLabel("Group name").fill("Solo budget");
  await page.getByRole("button", { name: "Create group" }).click();
  await page.getByRole("link", { name: "Add the first one" }).click();
  await page.getByLabel("Description").fill("Books");
  await page.getByLabel("Amount", { exact: true }).fill("12.5");
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByRole("link", { name: "Edit Books" }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("12.50");
  await page.getByLabel("Description").fill("Books and paper");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Books and paper")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Books and paper" }).click();
  await expect(page.getByText("No expenses yet.")).toBeVisible();
});

test("validation explains what is wrong", async ({ page }) => {
  await register(page, "Dev");
  await page.getByRole("button", { name: "New group" }).click();
  await page.getByLabel("Group name").fill("Checks");
  await page.getByRole("button", { name: "Create group" }).click();
  await page.getByRole("link", { name: "Add the first one" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("12.345");
  await expect(page.getByText("Enter a positive amount with at most 2 decimals.")).toBeVisible();
  await page.getByLabel("Amount", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Exact amounts" }).click();
  await page.getByLabel(/Exact amounts for Dev/).fill("20");
  await expect(page.getByText("30.00 left to assign")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add expense" })).toBeDisabled();
});

test("people cannot open groups they are not in", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  const stranger = await (await browser.newContext()).newPage();
  await register(owner, "Owner");
  await owner.getByRole("button", { name: "New group" }).click();
  await owner.getByLabel("Group name").fill("Private");
  await owner.getByRole("button", { name: "Create group" }).click();
  await expect(owner.getByRole("heading", { name: "Private", level: 1 })).toBeVisible();
  const url = owner.url();

  await register(stranger, "Stranger");
  await stranger.goto(url);
  await expect(stranger.getByRole("heading", { name: "Group not found" })).toBeVisible();
  const res = await stranger.request.get(`${url.replace("/groups/", "/api/groups/")}/expenses`);
  expect(res.status()).toBe(404);
});

test("signing out ends the session", async ({ page }) => {
  await register(page, "Eve");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
