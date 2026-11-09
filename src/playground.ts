// The Methodox Wiki's Dhole playground opens the text in its address, #text= and the text in UTF-8 as base64url - the link its own
// Copy link writes.

export const PlaygroundUrl = "https://wiki.methodox.io/Libraries/Dhole/Playground/index.html";

export function playgroundLink(text: string): string {
  const base64 = Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${PlaygroundUrl}#text=${base64}`;
}
