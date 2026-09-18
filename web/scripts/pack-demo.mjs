/**
 * Repack `out/` (from `npm run demo`) into `outpub/`, which is what a static host that
 * reserves leading-underscore names will accept. Used to publish the demo build as a
 * claude.ai artifact; harmless anywhere else, and a no-op for Vercel, which serves
 * `_next/` itself and never needs this.
 *
 * Three transforms, all on the copy — `out/` is left exactly as Next wrote it:
 *   1. `_next/` -> `n/`, and every `/_next/` reference rewritten to match. Every
 *      reference Next emits carries a leading slash, which the check below enforces.
 *   2. Root-level `__next.*.txt` dropped. These are router prefetch payloads; the
 *      per-route ones live under a route directory and are kept, so only the landing
 *      page falls back to a full navigation.
 *   3. A literal U+FFFD inside a double-quoted string escaped to `�`. Next ships
 *      three of these in a percent-decoding helper, where the character is the intended
 *      value rather than mojibake, and a host that rejects U+FFFD cannot tell them apart.
 *
 * Run: node scripts/pack-demo.mjs   (or `npm run demo:pack`)
 */
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "out");
const DEST = join(ROOT, "outpub");

const TEXT = /\.(html|js|css|txt|json|ico|map)$/i;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function main() {
  if (!(await stat(SRC).catch(() => null))) {
    throw new Error(`no ${relative(ROOT, SRC)}/ — run \`npm run demo\` first`);
  }
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });
  await cp(SRC, DEST, { recursive: true });

  await rename(join(DEST, "_next"), join(DEST, "n"));
  // The 404 route's own directory is also underscore-led; the root 404.html covers it.
  await rm(join(DEST, "_not-found"), { recursive: true, force: true });

  let droppedPrefetch = 0;
  for (const name of await readdir(DEST)) {
    if (name.startsWith("__next.")) {
      await rm(join(DEST, name));
      droppedPrefetch++;
    }
  }

  let rewritten = 0;
  let escaped = 0;
  for (const file of await walk(DEST)) {
    if (!TEXT.test(file)) continue;
    let body;
    try {
      body = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const before = body;
    body = body.replaceAll("/_next/", "/n/");
    if (body.includes('"�"')) {
      escaped += body.split('"�"').length - 1;
      body = body.replaceAll('"�"', '"\\uFFFD"');
    }
    if (body !== before) {
      await writeFile(file, body, "utf8");
      rewritten++;
    }
  }

  // Anything still leading with "_" would be rejected at publish time, and a surviving
  // "_next/" means a reference Next wrote without the leading slash this assumes.
  const bad = [];
  for (const file of await walk(DEST)) {
    const rel = relative(DEST, file);
    if (rel.split("/")[0].startsWith("_")) bad.push(rel);
  }
  if (bad.length) throw new Error(`still underscore-led: ${bad.slice(0, 5).join(", ")}`);

  let stragglers = 0;
  for (const file of await walk(DEST)) {
    if (!TEXT.test(file)) continue;
    const body = await readFile(file, "utf8").catch(() => "");
    if (body.includes("_next/")) stragglers++;
  }
  if (stragglers) throw new Error(`${stragglers} file(s) still reference _next/`);

  const files = await walk(DEST);
  console.log(
    `packed ${files.length} files into ${relative(ROOT, DEST)}/ ` +
      `(${rewritten} rewritten, ${droppedPrefetch} root prefetch payloads dropped, ${escaped} U+FFFD escaped)`,
  );
}

await main();
