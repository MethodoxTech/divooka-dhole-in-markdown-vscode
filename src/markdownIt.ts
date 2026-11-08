// The Markdown preview's half that runs in the extension: a markdown-it plugin that writes each ```dhole block as an element the
// preview's script (media/preview.js) draws into - the block's text kept inside it, so the source still shows if the script cannot
// run, and the settings the drawing needs on it as data attributes.

import type MarkdownIt from "markdown-it";
import { isDholeInfo } from "./fences";

/** What the preview draws with: the settings of the `dhole.preview` section. */
export interface PreviewSettings {
  readonly theme: string;
  readonly showProblems: boolean;
  readonly language: string;
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * Teaches markdown-it to write ```dhole blocks for the preview's script. Every other fence is left to the renderer before it, so
 * code highlighting and other extensions' fences (Mermaid's) are unchanged.
 */
export function dholePlugin(md: MarkdownIt, settings: () => PreviewSettings): MarkdownIt {
  const previous = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (!isDholeInfo(token.info)) return previous ? previous(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
    const s = settings();
    // VS Code keeps the preview's scrolling in step with the editor by the source line of each element marked code-line.
    const line = token.map ? ` data-line="${token.map[0]}"` : "";
    return (
      `<div class="dhole-diagram code-line"${line} data-dhole-theme="${escapeHtml(s.theme)}" data-dhole-problems="${s.showProblems}" data-dhole-language="${escapeHtml(s.language)}">` +
      `<pre class="dhole-source"><code>${escapeHtml(token.content)}</code></pre>` +
      `</div>\n`
    );
  };
  return md;
}
