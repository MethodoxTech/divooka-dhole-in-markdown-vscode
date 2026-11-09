// Dhole in Markdown: the extension's half that runs in VS Code itself.
//
//  - The Markdown preview: `extendMarkdownIt` hands VS Code's preview the markdown-it plugin that writes each ```dhole block for the
//    preview's script, which draws it (media/preview.js, with Dhole's public build, media/dhole.min.js).
//  - Problems: every ```dhole block of an open Markdown document, and every .dhole file, is read by Dhole as it is edited, and what
//    Dhole says about it is in the Problems panel and under the text, at its line and column, in English or Chinese.
//  - The playground: a link above each block, and a command, open the text in the Methodox Wiki's Dhole playground.
//  - A .dhole file has its own preview beside it, redrawn as it is typed.

import * as vscode from "vscode";
import type MarkdownIt from "markdown-it";
import { check, type DholeProblem } from "../vendor/dhole.esm.js";
import { findDholeFences, type DholeFence } from "./fences";
import { dholePlugin, type PreviewSettings } from "./markdownIt";
import { playgroundLink } from "./playground";

function previewSettings(): PreviewSettings {
  const config = vscode.workspace.getConfiguration("dhole.preview");
  return {
    theme: config.get<string>("theme", "auto"),
    showProblems: config.get<boolean>("showProblems", true),
    language: config.get<string>("language", "English"),
  };
}

export function activate(context: vscode.ExtensionContext) {
  const diagnostics = vscode.languages.createDiagnosticCollection("dhole");
  context.subscriptions.push(diagnostics);

  // ---------------------------------------------------------------- problems
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const refresh = (document: vscode.TextDocument) => {
    const key = document.uri.toString();
    clearTimeout(pending.get(key));
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        diagnostics.set(document.uri, problemsOf(document));
      }, 250),
    );
  };
  const forget = (document: vscode.TextDocument) => diagnostics.delete(document.uri);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
    vscode.workspace.onDidCloseTextDocument(forget),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("dhole")) vscode.workspace.textDocuments.forEach(refresh);
      if (event.affectsConfiguration("dhole.preview")) void vscode.commands.executeCommand("markdown.preview.refresh");
    }),
  );
  vscode.workspace.textDocuments.forEach(refresh);

  // ---------------------------------------------------------------- the playground
  context.subscriptions.push(
    vscode.commands.registerCommand("dhole.openInPlayground", (text?: string) => {
      const source = typeof text === "string" ? text : textAtCursor(vscode.window.activeTextEditor);
      if (source === null) {
        void vscode.window.showInformationMessage("Put the cursor in a ```dhole block, or open a .dhole file, to open it in the Dhole playground.");
        return;
      }
      void vscode.env.openExternal(vscode.Uri.parse(playgroundLink(source), true));
    }),
    vscode.languages.registerCodeLensProvider({ language: "markdown" }, new PlaygroundLenses()),
  );

  // ---------------------------------------------------------------- a .dhole file's preview
  context.subscriptions.push(
    vscode.commands.registerCommand("dhole.previewFile", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor?.document.languageId === "dhole") FilePreview.show(context, editor.document);
    }),
  );

  return {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      return dholePlugin(md, previewSettings);
    },
  };
}

export function deactivate() {}

/** What Dhole says about a document: a .dhole file's text, or each ```dhole block of a Markdown document, placed in the document. */
function problemsOf(document: vscode.TextDocument): vscode.Diagnostic[] {
  if (!vscode.workspace.getConfiguration("dhole.diagnostics").get<boolean>("enabled", true)) return [];
  const language = vscode.workspace.getConfiguration("dhole.preview").get<string>("language", "English");
  if (document.languageId === "dhole") return check(document.getText()).map((p) => diagnosticOf(document, p, 0, 0, language));
  if (document.languageId !== "markdown") return [];
  return findDholeFences(document.getText()).flatMap((fence) => check(fence.text).map((p) => diagnosticOf(document, p, fence.firstLine, fence.indent, language)));
}

function diagnosticOf(document: vscode.TextDocument, problem: DholeProblem, firstLine: number, indent: number, language: string): vscode.Diagnostic {
  const line = Math.min(document.lineCount - 1, firstLine + problem.line - 1);
  const start = Math.min(document.lineAt(line).text.length, indent + problem.column - 1);
  const end = Math.min(document.lineAt(line).text.length, start + problem.length);
  const hint = problem.hintIn(language);
  const gap = /^zh|chinese/i.test(language) ? "" : " ";
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(line, start, line, Math.max(end, start + 1)),
    hint ? `${problem.messageIn(language)}${gap}${hint}` : problem.messageIn(language),
    problem.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
  );
  diagnostic.source = "Dhole";
  diagnostic.code = problem.code;
  return diagnostic;
}

/** The Dhole text the cursor is in: a .dhole file's, or the ```dhole block's of a Markdown document; null when it is in neither. */
function textAtCursor(editor: vscode.TextEditor | undefined): string | null {
  if (!editor) return null;
  const document = editor.document;
  if (document.languageId === "dhole") return document.getText();
  if (document.languageId !== "markdown") return null;
  const line = editor.selection.active.line;
  const fence = findDholeFences(document.getText()).find((f) => line >= f.fenceLine && line <= f.closeLine);
  return fence ? fence.text : null;
}

/** "Open in the Dhole Playground" above each ```dhole block. */
class PlaygroundLenses implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!vscode.workspace.getConfiguration("dhole.codeLens").get<boolean>("enabled", true)) return [];
    return findDholeFences(document.getText()).map(
      (fence: DholeFence) =>
        new vscode.CodeLens(new vscode.Range(fence.fenceLine, 0, fence.fenceLine, 0), {
          title: "Open in the Dhole Playground",
          command: "dhole.openInPlayground",
          arguments: [fence.text],
        }),
    );
  }
}

/** A .dhole file's picture beside it, drawn by the same build as the Markdown preview and redrawn as the file changes. */
class FilePreview {
  private static readonly open = new Map<string, FilePreview>();

  static show(context: vscode.ExtensionContext, document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const existing = FilePreview.open.get(key);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }
    FilePreview.open.set(key, new FilePreview(context, document));
  }

  private readonly panel: vscode.WebviewPanel;

  private constructor(context: vscode.ExtensionContext, private readonly document: vscode.TextDocument) {
    const media = vscode.Uri.joinPath(context.extensionUri, "media");
    this.panel = vscode.window.createWebviewPanel("dholePreview", `Preview ${document.uri.path.split("/").pop()}`, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
      enableScripts: true,
      localResourceRoots: [media],
    });
    const webview = this.panel.webview;
    const nonce = Array.from({ length: 24 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
    const script = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(media, file));
    webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${script("preview.css")}">
</head><body class="dhole-file-preview">
<div class="dhole-diagram" id="diagram"><pre class="dhole-source"><code></code></pre></div>
<script nonce="${nonce}" src="${script("dhole.min.js")}"></script>
<script nonce="${nonce}" src="${script("preview.js")}"></script>
</body></html>`;
    const send = () => {
      const s = previewSettings();
      void webview.postMessage({ type: "dhole", text: this.document.getText(), theme: s.theme, showProblems: s.showProblems, language: s.language });
    };
    const subscriptions = [
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === this.document) send();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("dhole.preview")) send();
      }),
      webview.onDidReceiveMessage((message) => {
        if (message?.type === "ready") send();
      }),
    ];
    this.panel.onDidDispose(() => {
      subscriptions.forEach((s) => s.dispose());
      FilePreview.open.delete(this.document.uri.toString());
    });
    send();
  }
}
