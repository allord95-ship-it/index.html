// Run: node tests/snap.test.mjs
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = "file://" + path.resolve(here, "..", "snap.html");

let failed = 0;
const ok = (name, cond, extra = "") => {
  console.log((cond ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : ""));
  if (!cond) failed++;
};

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForFunction(() => !!window.SnapHD, null, { timeout: 5000 }).catch(() => {});
ok("SnapHD loaded", await page.evaluate(() => !!window.SnapHD));
if (!(await page.evaluate(() => !!window.SnapHD))) { await browser.close(); process.exit(1); }

// ---------- Task 1: layout ----------
const L = await page.evaluate(() => {
  const S = window.SnapHD;
  return {
    t: S.TARGET,
    a1: S.autoMode(1080, 1920), a2: S.autoMode(4000, 6000), a3: S.autoMode(4000, 5000), a4: S.autoMode(6000, 4000),
    fill: S.planLayout(6000, 4000, "fill"),
    fit: S.planLayout(6000, 4000, "fit"),
    fs: S.firstStepSize(6000, 4000, 1080, 720),
    fsFill: S.firstStepSize(2250, 4000, 1080, 1920),
  };
});
ok("TARGET 1080x1920", L.t.w === 1080 && L.t.h === 1920);
ok("autoMode 9:16 fill", L.a1 === "fill");
ok("autoMode 2:3 portrait fill", L.a2 === "fill");
ok("autoMode 4:5 fit", L.a3 === "fit");
ok("autoMode landscape fit", L.a4 === "fit");
ok("fill crop ratio 9:16", Math.abs(L.fill.sw / L.fill.sh - 0.5625) < 0.002 && L.fill.dw === 1080 && L.fill.dh === 1920, JSON.stringify(L.fill));
ok("fit contained", L.fit.dw === 1080 && L.fit.dh === 720 && L.fit.dy === 600 && L.fit.dx === 0, JSON.stringify(L.fit));
ok("firstStep under iOS canvas limit", L.fs.w * L.fs.h <= 16777216 && L.fs.w >= 1080, JSON.stringify(L.fs));
ok("firstStep fill", L.fsFill.w * L.fsFill.h <= 16777216 && L.fsFill.w >= 1080 && L.fsFill.w <= 2250, JSON.stringify(L.fsFill));

// ---------- Task 1: image pipeline ----------
const img = await page.evaluate(async () => {
  const S = window.SnapHD;
  const c = document.createElement("canvas");
  c.width = 6000; c.height = 4000;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 6000, 4000);
  g.addColorStop(0, "#d33"); g.addColorStop(1, "#33d");
  x.fillStyle = g; x.fillRect(0, 0, 6000, 4000);
  x.fillStyle = "#fff"; for (let i = 0; i < 6000; i += 40) x.fillRect(i, 0, 4, 4000);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const file = new File([blob], "big.png", { type: "image/png" });
  const dims = async (b) => { const bm = await createImageBitmap(b); return [bm.width, bm.height, b.type, b.size]; };
  const out = {};
  for (const m of ["fill", "fit"]) out[m] = await dims(await S.processImage(file, m));
  try { await S.processImage(new File(["not an image"], "bad.jpg", { type: "image/jpeg" }), "fill"); out.bad = "resolved"; }
  catch (e) { out.bad = "rejected"; }
  return out;
});
ok("processImage fill 1080x1920 jpeg", img.fill[0] === 1080 && img.fill[1] === 1920 && img.fill[2] === "image/jpeg", JSON.stringify(img.fill));
ok("processImage fit 1080x1920 jpeg", img.fit[0] === 1080 && img.fit[1] === 1920 && img.fit[2] === "image/jpeg", JSON.stringify(img.fit));
ok("corrupt image rejects", img.bad === "rejected");

// ---------- Task 2: video ----------
const V = await page.evaluate(async () => {
  const S = window.SnapHD;
  const res = { n61: S.needsSplitNote(61), n60: S.needsSplitNote(60), mime: S.pickMime() };
  // build a 2s 640x360 test clip with a tone
  const c = document.createElement("canvas"); c.width = 640; c.height = 360;
  const x = c.getContext("2d");
  const ac = new AudioContext();
  const osc = ac.createOscillator(); const dst = ac.createMediaStreamDestination();
  osc.connect(dst); osc.start();
  const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dst.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
  const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let f = 0; const iv = setInterval(() => { x.fillStyle = `hsl(${f++ * 10},80%,50%)`; x.fillRect(0, 0, 640, 360); }, 33);
  rec.start(); await new Promise((r) => setTimeout(r, 2000)); rec.stop();
  await new Promise((r) => (rec.onstop = r)); clearInterval(iv); osc.stop();
  const clip = new File([new Blob(chunks, { type: "video/webm" })], "clip.webm", { type: "video/webm" });

  const v = document.createElement("video");
  const actx = new AudioContext();
  S.unlock(v, actx);
  let lastP = 0;
  const out = await S.processVideo(clip, "fit", (p) => (lastP = p), v, actx);
  const pv = document.createElement("video"); pv.muted = true; pv.src = URL.createObjectURL(out);
  await new Promise((r, j) => { pv.onloadedmetadata = r; pv.onerror = j; });
  if (!isFinite(pv.duration)) { pv.currentTime = 1e9; await new Promise((r) => (pv.ontimeupdate = r)); }
  res.w = pv.videoWidth; res.h = pv.videoHeight; res.dur = pv.duration; res.type = out.type; res.lastP = lastP;
  try {
    const buf = await actx.decodeAudioData(await out.arrayBuffer());
    let peak = 0; for (const q of buf.getChannelData(0)) peak = Math.max(peak, Math.abs(q));
    res.peak = peak;
  } catch (e) { res.peak = -1; }
  return res;
});
ok("needsSplitNote", V.n61 === true && V.n60 === false);
ok("pickMime returns supported type", typeof V.mime === "string" && V.mime.length > 0, V.mime);
ok("processVideo 1080x1920", V.w === 1080 && V.h === 1920, JSON.stringify(V));
ok("processVideo duration kept", V.dur >= 1.5, String(V.dur));
ok("processVideo keeps audio", V.peak > 0.1, String(V.peak));
ok("progress reached end", V.lastP >= 0.95, String(V.lastP));

// ---------- Task 3: UI & sharing ----------
const U = await page.evaluate(async () => {
  const S = window.SnapHD;
  const saved = navigator.share;
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  const r = await S.shareFiles([new File(["x"], "a.jpg", { type: "image/jpeg" })]);
  return { r };
});
ok("share falls back to download", U.r === "downloaded", U.r);

// batch with one corrupt file: only that card errors
await page.reload();
await page.waitForFunction(() => !!window.SnapHD);
const pngBuf = await page.evaluate(async () => {
  const c = document.createElement("canvas"); c.width = 1200; c.height = 1600;
  const x = c.getContext("2d"); x.fillStyle = "#4a8"; x.fillRect(0, 0, 1200, 1600);
  const b = await new Promise((r) => c.toBlob(r, "image/png"));
  return Array.from(new Uint8Array(await b.arrayBuffer()));
});
await page.setInputFiles("#picker", [
  { name: "good.png", mimeType: "image/png", buffer: Buffer.from(pngBuf) },
  { name: "bad.jpg", mimeType: "image/jpeg", buffer: Buffer.from("nope") },
]);
await page.waitForFunction(() => document.querySelectorAll(".item:not(.busy)").length === 2, null, { timeout: 15000 }).catch(() => {});
const B = await page.evaluate(() => [...document.querySelectorAll(".item")].map((e) => e.dataset.state));
ok("batch: good ready, bad error", B.length === 2 && B.includes("ready") && B.includes("error"), JSON.stringify(B));

// video through the UI: pending -> tap "جهّز الفيديوهات" -> ready
await page.reload();
await page.waitForFunction(() => !!window.SnapHD);
const clipBuf = await page.evaluate(async () => {
  const c = document.createElement("canvas"); c.width = 480; c.height = 270; const x = c.getContext("2d");
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: "video/webm" });
  const ch = []; rec.ondataavailable = (e) => ch.push(e.data);
  let f = 0; const iv = setInterval(() => { x.fillStyle = `hsl(${f++ * 12},70%,50%)`; x.fillRect(0, 0, 480, 270); }, 33);
  rec.start(); await new Promise((r) => setTimeout(r, 1200)); rec.stop(); await new Promise((r) => (rec.onstop = r)); clearInterval(iv);
  return Array.from(new Uint8Array(await new Blob(ch).arrayBuffer()));
});
await page.setInputFiles("#picker", [{ name: "clip.webm", mimeType: "video/webm", buffer: Buffer.from(clipBuf) }]);
await page.waitForFunction(() => document.querySelector(".item")?.dataset.state === "pending", null, { timeout: 10000 }).catch(() => {});
const btnText = await page.textContent("#mainBtn");
ok("video waits for tap", btnText.includes("جهّز الفيديوهات"), btnText.trim());
await page.click("#mainBtn");
await page.waitForFunction(() => document.querySelector(".item")?.dataset.state === "ready", null, { timeout: 20000 }).catch(() => {});
ok("video ready after tap", await page.evaluate(() => document.querySelector(".item")?.dataset.state) === "ready");

ok("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
