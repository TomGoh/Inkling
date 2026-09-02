import { expect, test } from "@playwright/test";
import { MOD, openFile, openMockWorkspace } from "./helpers";

test("链接对话框在浅色和深色主题下使用应用主题样式", async ({ page }) => {
  await openMockWorkspace(page);
  await openFile(page, "readme.md");

  await page.locator(".ProseMirror").click();
  await page.keyboard.press(`${MOD}+KeyK`);

  const dialog = page.locator(".link-dialog-modal");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(dialog.locator("h3")).toHaveCSS("color", "rgb(31, 35, 40)");
  await expect(page.getByRole("button", { name: "取消" })).toHaveCSS(
    "background-color",
    "rgb(246, 248, 250)",
  );
  await page.getByRole("button", { name: "取消" }).click();

  await page.locator('.topbar-btn[title="主题"]').click();
  await page.locator(".export-item", { hasText: "深色" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.locator(".ProseMirror").click();
  await page.keyboard.press(`${MOD}+KeyK`);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("background-color", "rgb(28, 33, 40)");
  await expect(dialog.locator("h3")).toHaveCSS("color", "rgb(230, 237, 243)");
  await expect(page.getByRole("button", { name: "取消" })).toHaveCSS(
    "background-color",
    "rgb(33, 38, 45)",
  );

  await page.addStyleTag({
    content: `[data-theme="dark"] {
      --accent: #ffffff;
      --accent-fg: #000000;
      --ring: 0 0 0 3px rgb(255, 0, 0);
    }`,
  });
  const confirm = page.getByRole("button", { name: "确认插入" });
  await expect(confirm).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(confirm).toHaveCSS("color", "rgb(0, 0, 0)");

  const urlInput = page.getByLabel("链接地址 (URL)");
  await urlInput.focus();
  await expect(urlInput).toHaveCSS("box-shadow", "rgb(255, 0, 0) 0px 0px 0px 3px");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
