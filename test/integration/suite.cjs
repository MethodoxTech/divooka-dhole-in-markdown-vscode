// Inside VS Code: the extension activates for Markdown, VS Code's own Markdown renderer (the one the preview uses) writes ```dhole
// blocks through the extension's plugin, the preview carries the extension's scripts, and problems reach the Problems panel at the
// right places - for a Markdown document and for a .dhole file.
const assert = require("node:assert/strict");
const path = require("node:path");
const vscode = require("vscode");

async function waitFor(what, test, ms = 15000) {
  const until = Date.now() + ms;
  for (;;) {
    const value = await test();
    if (value) return value;
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

exports.run = async function () {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const markdown = await vscode.workspace.openTextDocument(path.join(folder, "sample.md"));
  await vscode.window.showTextDocument(markdown);
  const extension = vscode.extensions.getExtension("methodox.divooka-dhole-in-markdown");
  assert.ok(extension, "the extension is installed");
  await waitFor("the extension to activate", () => extension.isActive);

  const html = await vscode.commands.executeCommand("markdown.api.render", markdown.getText());
  assert.match(html, /<div class="dhole-diagram code-line" data-line="\d+" data-dhole-theme="auto"/, "VS Code's Markdown renderer writes dhole blocks through the plugin");
  assert.equal((html.match(/class="dhole-diagram/g) || []).length, 4);
  console.log("    ok  VS Code's Markdown renderer writes ```dhole blocks for the preview");

  const problems = await waitFor("the Markdown document's problems", () => {
    const list = vscode.languages.getDiagnostics(markdown.uri).filter((d) => d.source === "Dhole");
    return list.length >= 3 ? list : null;
  });
  const sideways = problems.find((d) => d.message.startsWith("'sideways' is not a direction"));
  assert.ok(sideways, problems.map((d) => d.message).join("\n"));
  const line = markdown.lineAt(sideways.range.start.line).text;
  assert.equal(line.slice(sideways.range.start.character, sideways.range.end.character), "sideways");
  assert.equal(sideways.severity, vscode.DiagnosticSeverity.Error);
  console.log("    ok  a block's problems are in the Problems panel at the document's line and column");

  const lenses = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", markdown.uri);
  assert.equal(lenses.filter((l) => l.command && l.command.command === "dhole.openInPlayground").length, 4);
  console.log("    ok  each block offers the Dhole playground");

  const dhole = await vscode.workspace.openTextDocument(path.join(folder, "tea.dhole"));
  assert.equal(dhole.languageId, "dhole");
  await vscode.window.showTextDocument(dhole);
  const fileProblems = await waitFor("the .dhole file's problems", () => {
    const list = vscode.languages.getDiagnostics(dhole.uri);
    return list.length > 0 ? list : null;
  });
  assert.ok(fileProblems[0].message.startsWith("'flowchrt' is not something Dhole draws"));
  console.log("    ok  a .dhole file is Dhole, and its problems are reported");

  await vscode.commands.executeCommand("dhole.previewFile");
  await waitFor("the .dhole file's preview", () => vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => t.label.startsWith("Preview tea.dhole"))));
  console.log("    ok  a .dhole file opens its preview beside it");
};
