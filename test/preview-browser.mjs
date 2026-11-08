// The preview's script in a real browser, on a page made as VS Code's Markdown preview makes one: the markdown-it plugin's output
// for a document, VS Code's theme class on the body, Dhole's build and the script after it. Checks that every block is drawn, that
// "auto" follows the editor's theme (and that the script waits for Dhole when it runs first, as VS Code's async loading lets it), that problems are listed, that a block with nothing to draw keeps its text, and that the
// drawings are made again when VS Code replaces the content; writes screenshots to test-results/.
//
//   npm run test:preview     (needs Playwright's Chromium: npx playwright install chromium)
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import MarkdownIt from "markdown-it";
import { build } from "esbuild";
import assert from "node:assert/strict";

const bundled = await build({ entryPoints: ["test/entry.ts"], bundle: true, format: "esm", platform: "node", write: false });
const { dholePlugin } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
const md = dholePlugin(new MarkdownIt(), () => ({ theme: "auto", showProblems: true, language: "English" }));
const document = readFileSync("test/sample.md", "utf8");
const css = readFileSync("media/preview.css", "utf8");
mkdirSync("test-results", { recursive: true });

const browser = await chromium.launch();
for (const kind of ["vscode-light", "vscode-dark"]) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent(`<!doctype html><html><head><style>body{font-family:system-ui;max-width:860px;margin:auto;padding:20px}
    body.vscode-dark{background:#1e1e1e;color:#ccc}${css}</style></head><body class="${kind}">${md.render(document)}</body></html>`);
  // VS Code loads a preview's scripts with async, so the script can run first; in the dark run it does.
  const order = kind === "vscode-dark" ? ["media/preview.js", "media/dhole.min.js"] : ["media/dhole.min.js", "media/preview.js"];
  for (const script of order) await page.addScriptTag({ path: script });
  await page.waitForTimeout(600);
  const state = await page.evaluate(() =>
    [...document.querySelectorAll(".dhole-diagram")].map((d) => ({
      drawn: d.classList.contains("dhole-diagram--drawn"),
      svgs: d.querySelectorAll("svg").length,
      background: d.querySelector("svg rect[fill]")?.getAttribute("fill") ?? null,
      problems: [...d.querySelectorAll(".dhole-problem")].map((p) => p.textContent),
      sourceShown: getComputedStyle(d.querySelector(".dhole-source")).display !== "none",
    })),
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.deepEqual(state.map((s) => s.drawn), [true, true, true, false]);
  assert.equal(state[0].background, kind === "vscode-dark" ? "#1a1a19" : "#ffffff", "auto follows the editor's theme");
  assert.equal(state[2].background, "#f4e8c8", "a theme the text names wins");
  assert.ok(state[1].problems.some((p) => p.includes("'sideways' is not a direction")));
  assert.ok(state[3].sourceShown && state[3].problems.length > 0, "a block with nothing to draw keeps its text and says why");
  await page.screenshot({ path: `test-results/preview-${kind}.png`, fullPage: true });

  // VS Code replaces the content as the document is edited, and says so.
  await page.evaluate((html) => {
    document.body.innerHTML = html;
    window.dispatchEvent(new CustomEvent("vscode.markdown.updateContent"));
  }, md.render("```dhole\npie Changed\nA: 1\nB: 3\n```\n"));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.querySelectorAll(".dhole-diagram--drawn svg").length), 1);
  console.log(`${kind}: ${state.length} blocks checked`);
  await page.close();
}
await browser.close();
console.log("The preview draws as it should.");
