// Takes a release of Dhole's public build (MethodoxTech/MethodoxDhole) into the extension: dist/dhole.min.js for the preview
// (media/), dist/dhole.esm.js and its types for the extension's own reading (vendor/). Fetched from jsDelivr, which serves the
// repository's tags.
//
//   npm run update-dhole            # the newest 0.2 release
//   npm run update-dhole -- 0.3.0   # a release by its version
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2] ?? "0.2";
const base = `https://cdn.jsdelivr.net/gh/MethodoxTech/MethodoxDhole@${version}`;

async function take(from, to) {
  const response = await fetch(`${base}/${from}`);
  if (!response.ok) throw new Error(`${base}/${from}: ${response.status} ${response.statusText}`);
  await mkdir(dirname(join(root, to)), { recursive: true });
  await writeFile(join(root, to), Buffer.from(await response.arrayBuffer()));
  console.log(`${from} -> ${to}`);
}

await take("dist/dhole.min.js", "media/dhole.min.js");
await take("dist/dhole.esm.js", "vendor/dhole.esm.js");
await take("LICENSE", "vendor/DHOLE-LICENSE");
const listing = await (await fetch(`https://data.jsdelivr.com/v1/packages/gh/MethodoxTech/MethodoxDhole@${version}?structure=flat`)).json();
for (const file of listing.files ?? []) if (file.name.startsWith("/dist/types/")) await take(file.name.slice(1), `vendor/types/${file.name.slice("/dist/types/".length)}`);
