// Finding ```dhole blocks in Markdown, and placing Dhole's problems in the document.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// The sources are TypeScript; bundle what the tests call into a module they can import.
const bundled = await build({ entryPoints: ["test/entry.ts"], bundle: true, format: "esm", platform: "node", write: false });
const { findDholeFences, isDholeInfo, dholePlugin, playgroundLink, check } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
const MarkdownIt = (await import("markdown-it")).default;

test("a dhole fence is found, with where its text starts", () => {
  const md = "# Title\n\n```dhole\nflowchart Tea\nA -> B\n```\n\nText.\n";
  const [fence] = findDholeFences(md);
  assert.equal(fence.fenceLine, 2);
  assert.equal(fence.firstLine, 3);
  assert.equal(fence.closeLine, 5);
  assert.equal(fence.text, "flowchart Tea\nA -> B");
});

test("only dhole fences are found: other languages, a longer closing fence, tildes and info words after the language", () => {
  const md = ["```js", "```dhole", "```", "````dhole", "pie", "```", "````", "~~~ Dhole title=x", "bar", "~~~", "```dhole", "never closed"].join("\n");
  const fences = findDholeFences(md);
  assert.deepEqual(fences.map((f) => f.text), ["pie\n```", "bar", "never closed"]);
  assert.equal(fences[2].closeLine, 11);
  assert.ok(isDholeInfo(" DHOLE  extra"));
  assert.ok(!isDholeInfo("dholes"));
});

test("an indented fence takes its indentation off its lines, as CommonMark does", () => {
  const [fence] = findDholeFences("  ```dhole\n  flowchart\n    A -> B\n  ```\n");
  assert.equal(fence.indent, 2);
  assert.equal(fence.text, "flowchart\n  A -> B");
});

test("a problem's line and column in a block are the document's", () => {
  const md = "Intro\n\n```dhole\nflowchart\ndirection: sideways\nA -> B\n```\n";
  const [fence] = findDholeFences(md);
  const [problem] = check(fence.text);
  assert.equal(problem.line, 2);
  assert.equal(problem.column, 12);
  // The extension places it at the block's first line plus the problem's line, less one.
  assert.equal(fence.firstLine + problem.line - 1, 4);
  assert.equal(md.split("\n")[4].slice(problem.column - 1, problem.column - 1 + problem.length), "sideways");
});

test("the markdown-it plugin writes a dhole block for the preview's script, and leaves every other fence alone", () => {
  const md = dholePlugin(new MarkdownIt(), () => ({ theme: "auto", showProblems: true, language: "Chinese" }));
  const html = md.render("```dhole\nflowchart <Tea> & \"Milk\"\nA -> B\n```\n\n```js\nlet a = 1;\n```\n");
  assert.match(html, /<div class="dhole-diagram code-line" data-line="0" data-dhole-theme="auto" data-dhole-problems="true" data-dhole-language="Chinese">/);
  assert.match(html, /<pre class="dhole-source"><code>flowchart &lt;Tea&gt; &amp; &quot;Milk&quot;\nA -&gt; B\n<\/code><\/pre>/);
  assert.match(html, /<pre><code class="language-js">let a = 1;/);
});

test("the playground link carries the text as the playground's own Copy link writes it", () => {
  const link = playgroundLink("pie 中文\nA: 1");
  assert.ok(link.startsWith("https://wiki.methodox.io/Libraries/Dhole/Playground/index.html#text="));
  const encoded = link.split("#text=")[1];
  assert.ok(!/[+/=]/.test(encoded));
  assert.equal(Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"), "pie 中文\nA: 1");
});
