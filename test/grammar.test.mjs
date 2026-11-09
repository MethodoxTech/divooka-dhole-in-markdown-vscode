// The Dhole grammar, run by VS Code's own TextMate engine (vscode-textmate with Oniguruma): the parts of a line get the scopes the
// colouring is meant to give them, in a .dhole file and in a ```dhole block of Markdown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vsctm from "vscode-textmate";
import oniguruma from "vscode-oniguruma";

const require = createRequire(import.meta.url);
await oniguruma.loadWASM(readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")).buffer);
const registry = new vsctm.Registry({
  onigLib: Promise.resolve({ createOnigScanner: (p) => new oniguruma.OnigScanner(p), createOnigString: (s) => new oniguruma.OnigString(s) }),
  loadGrammar: async (scope) => {
    if (scope === "source.dhole") return vsctm.parseRawGrammar(readFileSync("syntaxes/dhole.tmLanguage.json", "utf8"), "dhole.tmLanguage.json");
    return null;
  },
});
const grammar = await registry.loadGrammar("source.dhole");

/** Each token of each line with its innermost scope. */
function tokens(text) {
  let state = vsctm.INITIAL;
  const out = [];
  for (const line of text.split("\n")) {
    const result = grammar.tokenizeLine(line, state);
    for (const t of result.tokens) out.push([line.slice(t.startIndex, t.endIndex), t.scopes[t.scopes.length - 1]]);
    state = result.ruleStack;
  }
  return out;
}

function scopeOf(text, piece) {
  return tokens(text).find(([t]) => t === piece)?.[1];
}

test("the kind's word and the title", () => {
  assert.equal(scopeOf("flowchart Making tea", "flowchart"), "keyword.control.kind.dhole");
  assert.equal(scopeOf("flowchart Making tea", " Making tea"), "entity.name.title.dhole");
  assert.equal(scopeOf("mind map Ideas", "mind map"), "keyword.control.kind.dhole");
});

test("settings, blocks, comments and separators", () => {
  assert.equal(scopeOf("direction: right", "direction"), "variable.parameter.setting.dhole");
  assert.equal(scopeOf("  loop Every minute", "loop"), "keyword.control.dhole");
  assert.equal(scopeOf("# a comment", "# a comment"), "comment.line.number-sign.dhole");
  assert.equal(scopeOf("---", "---"), "punctuation.separator.diagram.dhole");
});

test("arrows, labels, attributes, quoted names and numbers", () => {
  const line = 'Tea or coffee? -> "Steep the tea" [round, good]: tea';
  assert.equal(scopeOf(line, "->"), "keyword.operator.arrow.dhole");
  assert.equal(scopeOf(line, '"Steep the tea"'), "string.quoted.double.dhole");
  assert.equal(scopeOf(line, "round"), "support.constant.attribute.dhole");
  assert.equal(scopeOf(line, "tea"), "string.unquoted.label.dhole");
  assert.equal(scopeOf("Customer |o--o{ Order : places", "|o--o{"), "keyword.operator.arrow.dhole");
  assert.equal(scopeOf("Shape <|-- Circle", "<|--"), "keyword.operator.arrow.dhole");
  assert.equal(scopeOf("Sleep: 8", "8"), "constant.numeric.dhole");
  assert.equal(scopeOf("Pages: after Mock-ups, 6d", "6d"), "constant.numeric.duration.dhole");
  assert.equal(scopeOf("start: 2026-11-02", "2026-11-02"), "constant.numeric.date.dhole");
});

test("a hyphen in a name is not an arrow", () => {
  assert.equal(scopeOf("Mock-ups -> Pages", "->"), "keyword.operator.arrow.dhole");
  assert.ok(!tokens("Mock-ups -> Pages").some(([t, s]) => t === "-" && s.includes("arrow")));
});
