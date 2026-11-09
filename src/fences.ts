// Finding the Dhole in a Markdown document: every fenced code block whose info string's first word is `dhole`, where its text is,
// so a problem Dhole reports at a line and column of the block's text lands on the document's own line and column.
//
// The rules are CommonMark's for fenced code: an opening fence of three or more backticks or tildes, indented by at most three
// spaces, closed by a fence of the same character at least as long, or by the end of the document; an info string after backticks
// holds no backtick. A block inside a list item or a quote is not followed into: those are rare for diagrams, and their text's
// columns would not be the document's.

/** One ```dhole block of a Markdown document. */
export interface DholeFence {
  /** The line of the opening fence, from 0. */
  readonly fenceLine: number;
  /** The line of the block's first line of text, from 0. */
  readonly firstLine: number;
  /** The line of the closing fence, from 0, or the document's last line when the block is never closed. */
  readonly closeLine: number;
  /** How many columns of indentation the fence had, which CommonMark takes off each of the block's lines. */
  readonly indent: number;
  /** The block's text, as Dhole reads it. */
  readonly text: string;
}

const opening = /^( {0,3})(`{3,}|~{3,})(.*)$/;

/** Whether an info string names Dhole: its first word is `dhole`, in any case. */
export function isDholeInfo(info: string): boolean {
  return info.trim().split(/\s+/)[0]?.toLowerCase() === "dhole";
}

/** Every ```dhole block of a Markdown document, in order. */
export function findDholeFences(markdown: string): DholeFence[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const fences: DholeFence[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = opening.exec(lines[i]);
    if (!open) continue;
    const [, indentText, marker, info] = open;
    if (marker[0] === "`" && info.includes("`")) continue;
    const closing = new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`);
    let close = i + 1;
    while (close < lines.length && !closing.test(lines[close])) close++;
    if (isDholeInfo(info)) {
      const indent = indentText.length;
      const body = lines.slice(i + 1, close).map((line) => stripIndent(line, indent));
      fences.push({ fenceLine: i, firstLine: i + 1, closeLine: Math.min(close, lines.length - 1), indent, text: body.join("\n") });
    }
    i = close;
  }
  return fences;
}

/** A line with up to `indent` leading spaces taken off, as CommonMark takes a fence's indentation off its content. */
function stripIndent(line: string, indent: number): string {
  let n = 0;
  while (n < indent && line[n] === " ") n++;
  return line.slice(n);
}
