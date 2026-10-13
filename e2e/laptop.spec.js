import { test, expect } from "@playwright/test";
import { DEFAULT_PROFILE } from "../src/state.js";

async function openLaptop(page) {
  await page.addInitScript(
    (profile) =>
      localStorage.setItem(
        "Fella.v1",
        JSON.stringify({
          profile,
          floor: 1,
          admitted: true,
          chats: {},
          lessons: [],
        }),
      ),
    DEFAULT_PROFILE,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Enter your campus" }).click();
  await page.getByRole("button", { name: "Your toolkit", exact: true }).click();
  await page.getByRole("button", { name: /Open your laptop/ }).click();
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`screen-only desktop and browser fit ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openLaptop(page);
    const laptop = page.getByRole("region", {
      name: "Your laptop",
      exact: true,
    });
    const box = await laptop.boundingBox();
    expect(box.x).toBeCloseTo(viewport.width * 0.05, 0);
    expect(box.y).toBeCloseTo(viewport.height * 0.05, 0);
    expect(box.width).toBeCloseTo(viewport.width * 0.9, 0);
    expect(box.height).toBeCloseTo(viewport.height * 0.9, 0);
    await expect(
      page.locator(".laptop-keyboard, .laptop-base, .laptop-trackpad"),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation", { name: "Desktop applications" })
        .getByRole("button"),
    ).toHaveCount(3);
    await page.getByRole("button", { name: "Browser", exact: true }).click();
    await expect(page.getByLabel("Website address")).toHaveValue(
      "Fella://home",
    );
    await page.getByLabel("Website address").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Go to website" }).click();
    await expect(page.getByRole("alert")).toContainText("valid HTTPS");
    await page.getByRole("button", { name: "Browser home" }).click();
    await page.route("https://example.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Test website</h1>",
      }),
    );
    await page.getByLabel("Website address").fill("https://example.com/");
    await page.getByRole("button", { name: "Go to website" }).click();
    await expect(page.frameLocator("iframe").getByRole("heading")).toHaveText(
      "Test website",
    );
    await expect(
      page.getByRole("link", { name: /Open in a new tab/ }),
    ).toHaveAttribute("href", "https://example.com/");
    await page.getByRole("button", { name: "Browser home" }).click();
    await page.getByRole("button", { name: /Learn something little/ }).click();
    await expect(
      page.getByRole("button", { name: /Make yourself at home/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("Monaco loads locally, edits code, switches languages and persists across reopening", async ({
  page,
}) => {
  const errors = [];
  const externalRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:5173") &&
      !request.url().startsWith("data:")
    )
      externalRequests.push(request.url());
  });
  await openLaptop(page);
  await page.getByRole("button", { name: "Code editor", exact: true }).click();
  const editor = page.getByRole("textbox", {
    name: "Code editor",
    exact: true,
  });
  await expect(editor).toBeVisible({ timeout: 30000 });
  await editor.fill("<h1>Hello from Monaco</h1>");
  await page.getByLabel("Code language").selectOption("javascript");
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("Fella.laptop.code.v1")),
      ),
    )
    .toEqual({ code: "<h1>Hello from Monaco</h1>", language: "javascript" });
  await page.getByRole("button", { name: "Close Code editor window" }).click();
  await page.getByRole("button", { name: "Code editor", exact: true }).click();
  await expect(page.getByLabel("Code language")).toHaveValue("javascript");
  await expect(page.locator(".view-lines")).toContainText("Hello from Monaco");
  await page.getByRole("button", { name: "Close popup" }).click();
  await page.getByRole("button", { name: "Your toolkit", exact: true }).click();
  await page.getByRole("button", { name: /Open your laptop/ }).click();
  await page.getByRole("button", { name: "Code editor", exact: true }).click();
  await expect(page.locator(".view-lines")).toContainText("Hello from Monaco");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage blocked");
    };
  });
  await page
    .getByRole("textbox", { name: "Code editor", exact: true })
    .fill("const answer = 42;");
  await expect(page.locator(".editor-status")).toContainText("Not saved");
  await expect(page.locator(".view-lines")).toContainText("const answer = 42;");
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
