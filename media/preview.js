/*
 * Dhole in Markdown: the preview's half, run in VS Code's Markdown preview (and in a .dhole file's preview) after dhole.min.js,
 * Dhole's public build (MethodoxTech/MethodoxDhole), which sets window.Dhole.
 *
 * Each ```dhole block arrives as <div class="dhole-diagram"> holding its text in a <pre class="dhole-source"> (src/markdownIt.ts)
 * and the settings on data attributes. This draws each one into the div, the text kept but hidden, so a block whose text draws
 * nothing still shows its text with its problems. The preview's content is replaced as the document is edited - VS Code then
 * fires vscode.markdown.updateContent - so every drawing is made again from its text; what was drawn is kept by its text and
 * settings, so a block that did not change is not laid out again.
 *
 * Text is measured by the preview's own canvas in the faces the picture is drawn in, so a box fits its words in this editor's fonts.
 *
 * VS Code loads a preview's scripts with `async`, so this one can run before dhole.min.js has: it waits for window.Dhole rather than
 * finding it missing.
 */
(function () {
  "use strict";

  var drawn = new Map();

  // "auto" follows the editor's theme: VS Code marks the preview's body with the kind of theme it is in.
  function themeFor(asked) {
    if (asked && asked !== "auto") return asked;
    var body = document.body.classList;
    if (body.contains("vscode-high-contrast-light")) return "high contrast";
    if (body.contains("vscode-high-contrast") || body.contains("vscode-dark")) return "dark";
    return "light";
  }

  function dholeReady() {
    return !!(window.Dhole && typeof window.Dhole.read === "function");
  }

  // Calls back once Dhole's build has loaded, and its faces; marks every block when it never does.
  var waiting = [];
  var waited = 0;
  function whenReady(callback) {
    if (dholeReady()) {
      whenFontsAreReady(callback);
      return;
    }
    waiting.push(callback);
    if (waiting.length > 1) return;
    var timer = setInterval(function () {
      waited += 50;
      if (dholeReady() || waited >= 15000) {
        clearInterval(timer);
        var callbacks = waiting;
        waiting = [];
        callbacks.forEach(function (c) { whenFontsAreReady(c); });
      }
    }, 50);
  }

  function draw(element, text, settings) {
    if (!dholeReady()) {
      element.classList.add("dhole-diagram--unavailable");
      return;
    }
    element.classList.remove("dhole-diagram--unavailable");
    var theme = themeFor(settings.theme);
    var key = [theme, settings.language, settings.showProblems, text].join("\u0000");
    var html = drawn.get(key);
    if (html === undefined) {
      var result = window.Dhole.read(text, { defaultTheme: window.Dhole.findTheme(theme) || undefined });
      var picture = result.figure ? window.Dhole.toSvg(result.figure, { measurer: result.measurer, description: result.summary }) : "";
      var problems = settings.showProblems ? window.Dhole.problemsHtml(result, settings.language) : "";
      html = (picture ? '<div class="dhole-picture">' + picture + "</div>" : "") + problems;
      if (drawn.size > 200) drawn.clear();
      drawn.set(key, { html: html, hasPicture: picture.length > 0 });
      html = drawn.get(key);
    }
    var output = element.querySelector(":scope > .dhole-rendered");
    if (!output) {
      output = document.createElement("div");
      output.className = "dhole-rendered";
      element.appendChild(output);
    }
    output.innerHTML = html.html;
    element.classList.toggle("dhole-diagram--drawn", html.hasPicture);
  }

  function settingsOf(element) {
    return {
      theme: element.getAttribute("data-dhole-theme") || "auto",
      showProblems: element.getAttribute("data-dhole-problems") !== "false",
      language: element.getAttribute("data-dhole-language") || "English",
    };
  }

  function drawAll() {
    document.querySelectorAll(".dhole-diagram").forEach(function (element) {
      var source = element.querySelector(".dhole-source");
      if (source) draw(element, source.textContent.replace(/\n$/, ""), settingsOf(element));
    });
  }

  function whenFontsAreReady(callback) {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(callback, callback);
    else callback();
  }

  // A .dhole file's own preview: its text comes in messages from the extension, as the file is edited.
  if (document.body.classList.contains("dhole-file-preview") && typeof acquireVsCodeApi === "function") {
    var vscode = acquireVsCodeApi();
    window.addEventListener("message", function (event) {
      var message = event.data;
      if (!message || message.type !== "dhole") return;
      var element = document.getElementById("diagram");
      element.querySelector(".dhole-source code").textContent = message.text;
      whenReady(function () {
        draw(element, message.text, { theme: message.theme, showProblems: message.showProblems, language: message.language });
      });
    });
    vscode.postMessage({ type: "ready" });
    return;
  }

  // The Markdown preview.
  window.addEventListener("vscode.markdown.updateContent", function () { whenReady(drawAll); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { whenReady(drawAll); });
  else whenReady(drawAll);
  // The editor's theme can change while the preview is open; "auto" follows it.
  new MutationObserver(function () { whenReady(drawAll); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
})();
