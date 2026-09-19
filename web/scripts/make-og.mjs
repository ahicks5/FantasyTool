/**
 * Render public/og.png, the card that shows when the landing page is pasted anywhere.
 *
 * It is generated rather than hand-made so it stays in step with the design system: the
 * colours and type below are the same tokens globals.css defines. Next's ImageResponse
 * would be the usual route, but it needs a runtime and this app also ships as a static
 * export, so a build-time screenshot is the thing that works everywhere.
 *
 * Run: node scripts/make-og.mjs   (or `npm run og`)
 * Needs a Chromium. Set CHROME to point at one; the default is the Playwright location.
 */
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "public", "og.png");

const CHROME =
  process.env.CHROME ||
  process.env.EDGE_CHROMIUM ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// 1200x630 is what every unfurler crops to.
const HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800;900&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --hero: #0e1116; --hero-2: #191d24; --start: #22a468; --paper: #f4f3f0; --muted: #9a9892;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  /* The gradient goes on html as well: anything the body does not cover would otherwise
     screenshot as white, and an unfurler crops to the full 1200x630. */
  html { width: 1200px; height: 630px; overflow: hidden;
         background: linear-gradient(145deg, var(--hero) 0%, var(--hero-2) 100%); }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: transparent;
    color: var(--paper);
    font-family: Inter, system-ui, sans-serif;
    padding: 62px 80px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .mark { font-family: Archivo, sans-serif; font-weight: 900; font-size: 46px; letter-spacing: -0.045em; display: flex; align-items: baseline; }
  .dot { width: 0.26em; height: 0.26em; border-radius: 99px; background: var(--start); margin-left: 4px; }
  h1 { font-family: Archivo, sans-serif; font-weight: 900; font-size: 84px; line-height: 0.96; letter-spacing: -0.035em; }
  p { font-size: 28px; line-height: 1.42; color: #c9c7c1; max-width: 880px; margin-top: 22px; }
  .row { display: flex; gap: 14px; align-items: center; }
  .chip {
    border: 1px solid rgba(255,255,255,0.22); border-radius: 999px;
    padding: 9px 19px; font-size: 20px; font-weight: 700; color: #e8e6e1;
  }
  .chip.on { background: var(--start); border-color: var(--start); color: #fff; }
</style></head>
<body>
  <div class="mark">edge<span class="dot"></span></div>
  <div>
    <h1>Your league.<br>This week&rsquo;s moves.</h1>
    <p>Start/sit calls, waiver claims with a bid, and trade verdicts &mdash; ranked, with one sentence of why.</p>
  </div>
  <div class="row">
    <span class="chip on">Start/sit</span>
    <span class="chip">Waivers + FAAB</span>
    <span class="chip">Trade Lab</span>
  </div>
</body></html>`;

const work = join(tmpdir(), `edge-og-${process.pid}`);
await mkdir(work, { recursive: true });
await mkdir(join(ROOT, "public"), { recursive: true });
const page = join(work, "og.html");
await writeFile(page, HTML, "utf8");

/**
 * Driven over the DevTools protocol rather than `--screenshot`, because that flag does
 * not set the emulated viewport: it renders at some other height and pads the rest of
 * the frame white, which on a 1200x630 card is a white stripe across the bottom.
 * setDeviceMetricsOverride gives exactly the frame asked for.
 */
const PORT = 9333;
const chrome = spawn(
  CHROME,
  ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
   `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, "profile")}`, "about:blank"],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    } catch {
      await sleep(250);
    }
  }
  const target = targets?.find((t) => t.type === "page");
  if (!target) throw new Error("chromium did not come up");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => {
    const n = ++id;
    ws.send(JSON.stringify({ id: n, method, params }));
    return new Promise((resolve) => pending.set(n, resolve));
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `file://${page}` });
  // Webfonts come off the network; a shot taken too early renders in a fallback face.
  await sleep(4000);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(OUT, Buffer.from(shot.data, "base64"));
  ws.close();
} finally {
  chrome.kill();
  // Chromium keeps writing to its profile for a moment after the signal, and a failed
  // tidy-up of a temp directory is not a reason to fail the build.
  await sleep(500);
  await rm(work, { recursive: true, force: true }).catch(() => {});
}

console.log(`wrote ${OUT}`);
