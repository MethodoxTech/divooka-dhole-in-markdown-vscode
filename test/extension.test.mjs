// The extension as VS Code runs it - dist/extension.js, the built file - against a stand-in for the `vscode` module: it activates,
// hands the preview its markdown-it plugin, reports a ```dhole block's problems at the document's own line and column, offers the
// playground above each block, and reads a .dhole file's problems too.
import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const handlers = {};
const commands = {};
const lensProviders = [];
const reported = new Map();
const settings = {};

class Range {
  constructor(sl, sc, el, ec) {
    Object.assign(this, { start: { line: sl, character: sc }, end: { line: el, character: ec } });
  }
}
const on = (name) => (handler) => ((handlers[name] = handler), { dispose() {} });
const vscode = {
  Range,
  Diagnostic: class {
    constructor(range, message, severity) {
      Object.assign(this, { range, message, severity });
    }
  },
  DiagnosticSeverity: { Error: 0, Warning: 1 },
  CodeLens: class {
    constructor(range, command) {
      Object.assign(this, { range, command });
    }
  },
  ViewColumn: { Beside: -2 },
  Uri: { parse: (s) => ({ toString: () => s }), joinPath: (...parts) => parts.join("/") },
  env: { openExternal: async (uri) => (commands.opened = uri.toString()) },
  window: { activeTextEditor: undefined, showInformationMessage: async () => {} },
  commands: { registerCommand: (name, fn) => ((commands[name] = fn), { dispose() {} }), executeCommand: async () => {} },
  languages: {
    createDiagnosticCollection: () => ({ set: (uri, list) => reported.set(uri.toString(), list), delete: (uri) => reported.delete(uri.toString()), dispose() {} }),
    registerCodeLensProvider: (_, provider) => (lensProviders.push(provider), { dispose() {} }),
  },
  workspace: {
    textDocuments: [],
    getConfiguration: (section) => ({ get: (key, fallback) => settings[`${section}.${key}`] ?? fallback }),
    onDidOpenTextDocument: on("open"),
    onDidChangeTextDocument: on("change"),
    onDidCloseTextDocument: on("close"),
    onDidChangeConfiguration: on("configuration"),
  },
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === "vscode" ? "vscode" : resolve.call(this, request, ...rest);
};
require.cache.vscode = { id: "vscode", filename: "vscode", loaded: true, exports: vscode };

function documentOf(uri, languageId, text) {
  const lines = text.split("\n");
  return { uri: { toString: () => uri }, languageId, getText: () => text, lineCount: lines.length, lineAt: (i) => ({ text: lines[i] }) };
}
const settle = () => new Promise((r) => setTimeout(r, 400));

const extension = require("../dist/extension.js");
const api = extension.activate({ subscriptions: [], extensionUri: "ext" });

test("it hands the Markdown preview a markdown-it plugin that writes dhole blocks", async () => {
  const MarkdownIt = (await import("markdown-it")).default;
  const html = api.extendMarkdownIt(new MarkdownIt()).render("```dhole\npie\nA: 1\n```\n");
  assert.match(html, /class="dhole-diagram code-line"/);
});

test("a dhole block's problems are reported at the document's line and column, in English", async () => {
  const text = "# Notes\n\n```dhole\nflowchart\ndirection: sideways\nA [blu] -> B\n```\n";
  handlers.open(documentOf("file:///a.md", "markdown", text));
  await settle();
  const [direction, colour] = reported.get("file:///a.md");
  assert.deepEqual([direction.range.start, direction.range.end], [{ line: 4, character: 11 }, { line: 4, character: 19 }]);
  assert.equal(direction.severity, vscode.DiagnosticSeverity.Error);
  assert.equal(direction.message, "'sideways' is not a direction. Write down, right, up or left.");
  assert.equal(direction.source, "Dhole");
  assert.equal(colour.severity, vscode.DiagnosticSeverity.Warning);
  assert.equal(colour.range.start.line, 5);
});

test("in Chinese when asked, and none when turned off", async () => {
  settings["dhole.preview.language"] = "Chinese";
  handlers.change({ document: documentOf("file:///a.md", "markdown", "```dhole\nflowchart\ndirection: sideways\n```") });
  await settle();
  assert.equal(reported.get("file:///a.md")[0].message, "“sideways”不是方向。请写 down、right、up 或 left。");
  settings["dhole.preview.language"] = undefined;
  settings["dhole.diagnostics.enabled"] = false;
  handlers.change({ document: documentOf("file:///a.md", "markdown", "```dhole\nflowchart\ndirection: sideways\n```") });
  await settle();
  assert.deepEqual(reported.get("file:///a.md"), []);
  settings["dhole.diagnostics.enabled"] = undefined;
});

test("a .dhole file's problems, and nothing for other languages", async () => {
  handlers.open(documentOf("file:///b.dhole", "dhole", "flowchrt\nA -> B"));
  handlers.open(documentOf("file:///c.txt", "plaintext", "```dhole\nflowchrt\n```"));
  await settle();
  assert.equal(reported.get("file:///b.dhole")[0].message.startsWith("'flowchrt' is not something Dhole draws"), true);
  assert.deepEqual(reported.get("file:///c.txt"), []);
});

test("each dhole block offers the playground, with its own text", async () => {
  const lenses = lensProviders[0].provideCodeLenses(documentOf("file:///d.md", "markdown", "Text\n```dhole\npie\nA: 1\n```\n```dhole\nbar\nB: 2\n```"));
  assert.deepEqual(lenses.map((l) => l.range.start.line), [1, 5]);
  assert.deepEqual(lenses.map((l) => l.command.arguments[0]), ["pie\nA: 1", "bar\nB: 2"]);
  await commands["dhole.openInPlayground"]("pie\nA: 1");
  assert.ok(commands.opened.startsWith("https://wiki.methodox.io/Libraries/Dhole/Playground/index.html#text="));
});
