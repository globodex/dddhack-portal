import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "playwright-core";
test(
  "compact four-field filter popover stages changes, counts active fields and supports focus, Escape, Back, Clear and short mobile screens",
  { skip: !existsSync("/usr/bin/chromium") },
  async () => {
    const built = await build({
      stdin: {
        contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Filters from'./app/admin-demographic-filters';
 function App(){const[value,setValue]=useState({}),[pending,setPending]=useState(false);return React.createElement(Filters,{value,pending,participants:true,onChange:next=>{window.changes.push(next);setValue(next);setPending(true);window.finish=()=>setPending(false);}});}window.changes=[];window.fetch=()=>{throw Error('Popover must not fetch without Apply');};createRoot(document.getElementById('root')).render(React.createElement(App));`,
        resolveDir: process.cwd(),
        loader: "tsx",
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
        { width: 320, height: 480 },
        { width: 768, height: 900 },
      ]) {
        const p = await browser.newPage({
          viewport,
          hasTouch: viewport.width < 600,
        });
        const errors: string[] = [];
        p.on("pageerror", (e) => errors.push(e.message));
        await p.setContent(
          '<div class="app-shell"><div style="display:flex;justify-content:flex-end;padding:24px" id="root"></div></div>',
        );
        for (const css of [
          "app/style.css",
          "app/admin-demographic-filters.css",
        ])
          await p.addStyleTag({ content: readFileSync(css, "utf8") });
        await p.addScriptTag({ content: built.outputFiles[0].text });
        const trigger = p.getByRole("button", { name: "Filters", exact: true });
        await p.waitForFunction(
          () =>
            !!document.querySelector<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
        );
        const before = await p.evaluate(() => ({
          root: document.documentElement.style.overflow,
          body: document.body.style.overflow,
        }));
        await trigger.click();
        const dialog = p.getByRole("dialog", { name: "Filters", exact: true });
        await dialog.waitFor();
        assert.equal(await dialog.getByRole("combobox").count(), 4);
        assert.equal(await p.getByLabel("Gender", { exact: true }).count(), 0);
        const bounds = await dialog.boundingBox();
        assert.ok(
          bounds &&
            bounds.x >= 7 &&
            bounds.x + bounds.width <= viewport.width - 7 &&
            bounds.y >= 7 &&
            bounds.y + bounds.height <= viewport.height - 7,
          JSON.stringify({ viewport, bounds }),
        );
        await p
          .getByLabel("Participant status", { exact: true })
          .selectOption("Going");
        await p
          .getByLabel("Team status", { exact: true })
          .selectOption("Submitted");
        await p.getByLabel("Sex", { exact: true }).selectOption("man");
        await p
          .getByLabel("Profession", { exact: true })
          .selectOption("Independent Developer");
        assert.equal(await p.evaluate(() => (window as any).changes.length), 0);
        await p.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.deepEqual(
          await p.evaluate(() => ({
            root: document.documentElement.style.overflow,
            body: document.body.style.overflow,
          })),
          before,
        );
        await trigger.click();
        assert.equal(
          await p.getByLabel("Sex", { exact: true }).inputValue(),
          "",
        );
        await p
          .getByLabel("Participant status", { exact: true })
          .selectOption("Going");
        await p
          .getByLabel("Team status", { exact: true })
          .selectOption("Submitted");
        await p.getByLabel("Sex", { exact: true }).selectOption("man");
        await p
          .getByLabel("Profession", { exact: true })
          .selectOption("Independent Developer");
        const close = dialog.getByRole("button", { name: "Close filters" }),
          apply = dialog.getByRole("button", { name: "Apply", exact: true });
        await apply.focus();
        await p.keyboard.press("Tab");
        assert.equal(
          await close.evaluate((el) => el === document.activeElement),
          true,
        );
        await p.keyboard.press("Shift+Tab");
        assert.equal(
          await apply.evaluate((el) => el === document.activeElement),
          true,
        );
        await apply.click();
        await dialog.waitFor({ state: "hidden" });
        const active = p.getByRole("button", {
          name: "Filters (4 active)",
          exact: true,
        });
        assert.equal(await active.isDisabled(), true);
        assert.deepEqual(await p.evaluate(() => (window as any).changes), [
          {
            participantStatus: "Going",
            teamStatus: "Submitted",
            gender: "man",
            profession: "Independent Developer",
          },
        ]);
        await active.evaluate((el: HTMLButtonElement) => el.click());
        assert.equal(await p.evaluate(() => (window as any).changes.length), 1);
        await p.evaluate(() => (window as any).finish());
        await p.waitForFunction(
          () =>
            document.activeElement?.getAttribute("aria-label") ===
            "Filters (4 active)",
        );
        await active.click();
        await p.waitForFunction(() => !!history.state?.portalDialog);
        await p.goBack();
        await dialog.waitFor({ state: "hidden" });
        await active.click();
        await p.mouse.click(1, 1);
        await dialog.waitFor({ state: "hidden" });
        await active.click();
        await dialog
          .getByRole("button", { name: "Clear", exact: true })
          .click();
        await p.evaluate(() => (window as any).finish());
        await trigger.waitFor();
        assert.deepEqual(await p.evaluate(() => (window as any).changes[1]), {
          participantStatus: "",
          teamStatus: "",
          gender: "",
          profession: "",
        });
        assert.ok(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert.deepEqual(errors, []);
        await p.close();
      }
    } finally {
      await browser.close();
    }
  },
);
