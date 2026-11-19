// Run: node tests/flights.test.mjs
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = "file://" + path.resolve(here, "..", "flights.html");

let failed = 0;
const ok = (name, cond, extra = "") => {
  console.log((cond ? "PASS " : "FAIL ") + name + (extra && !cond ? "\n     got: " + extra : ""));
  if (!cond) failed++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(pageUrl);
const loaded = await page.evaluate(() => !!window.Flights).catch(() => false);
ok("Flights loaded", loaded);
if (!loaded) { await browser.close(); process.exit(1); }

// ---------- links: round trip, business, 2 adults + 1 child, direct ----------
const rt = await page.evaluate(() => window.Flights.buildLinks({
  from: "RUH", to: "DXB", depart: "2026-12-10", ret: "2026-12-15",
  adults: 2, children: 1, cabin: "business", direct: true,
}));
const byId = Object.fromEntries(rt.map((l) => [l.id, l]));
ok("five sites", rt.length === 5 && ["google", "skyscanner", "kayak", "momondo", "expedia"].every((k) => byId[k]), JSON.stringify(rt.map((l) => l.id)));

const g = new URL(byId.google.url);
ok("google base", g.origin + g.pathname === "https://www.google.com/travel/flights", byId.google.url);
ok("google query", g.searchParams.get("q") === "Flights from RUH to DXB on 2026-12-10 returning 2026-12-15 nonstop business class 2 adults 1 child", g.searchParams.get("q"));
ok("google arabic + SAR", g.searchParams.get("hl") === "ar" && g.searchParams.get("curr") === "SAR");
ok("google direct applied", byId.google.direct === true);

ok("skyscanner url",
  byId.skyscanner.url === "https://www.skyscanner.com.sa/transport/flights/ruh/dxb/261210/261215/?adultsv2=2&childrenv2=8&cabinclass=business&preferdirects=true&rtn=1",
  byId.skyscanner.url);
ok("kayak url",
  byId.kayak.url === "https://www.kayak.com/flights/RUH-DXB/2026-12-10/2026-12-15/business/2adults/children-8?sort=price_a&fs=stops=0",
  byId.kayak.url);
ok("momondo url",
  byId.momondo.url === "https://www.momondo.com/flight-search/RUH-DXB/2026-12-10/2026-12-15/business/2adults/children-8?sort=price_a&fs=stops=0",
  byId.momondo.url);
ok("expedia url",
  byId.expedia.url === "https://www.expedia.com/Flights-Search?mode=search&trip=roundtrip&leg1=from:RUH,to:DXB,departure:12/10/2026TANYT&leg2=from:DXB,to:RUH,departure:12/15/2026TANYT&passengers=adults:2,children:1[8]&options=cabinclass:business",
  byId.expedia.url);
ok("expedia direct not applied", byId.expedia.direct === false);

// ---------- links: one way, economy, 1 adult, any stops ----------
const ow = await page.evaluate(() => window.Flights.buildLinks({
  from: "JED", to: "CAI", depart: "2027-01-05", ret: "", adults: 1, children: 0, cabin: "economy", direct: false,
}));
const o = Object.fromEntries(ow.map((l) => [l.id, l]));
ok("google one way", new URL(o.google.url).searchParams.get("q") === "Flights from JED to CAI on 2027-01-05 one way economy class 1 adult", new URL(o.google.url).searchParams.get("q"));
ok("skyscanner one way", o.skyscanner.url === "https://www.skyscanner.com.sa/transport/flights/jed/cai/270105/?adultsv2=1&cabinclass=economy&preferdirects=false&rtn=0", o.skyscanner.url);
ok("kayak one way economy", o.kayak.url === "https://www.kayak.com/flights/JED-CAI/2027-01-05/1adults?sort=price_a", o.kayak.url);
ok("expedia one way", o.expedia.url === "https://www.expedia.com/Flights-Search?mode=search&trip=oneway&leg1=from:JED,to:CAI,departure:1/5/2027TANYT&passengers=adults:1&options=cabinclass:economy", o.expedia.url);

// ---------- airports ----------
const A = await page.evaluate(() => {
  const F = window.Flights;
  return {
    riyadh: F.findAirports("الرياض")[0]?.c,
    noHamza: F.findAirports("ابها")[0]?.c,
    code: F.findAirports("dxb")[0]?.c,
    english: F.findAirports("istanbul").map((a) => a.c),
    max: F.findAirports("ا").length,
    none: F.findAirports("zzzzqq").length,
  };
});
ok("find Arabic name", A.riyadh === "RUH", A.riyadh);
ok("find ignores hamza", A.noHamza === "AHB", A.noHamza);
ok("find by code", A.code === "DXB", A.code);
ok("find English city", A.english.includes("IST") && A.english.includes("SAW"), JSON.stringify(A.english));
ok("max 8 suggestions", A.max <= 8 && A.max > 0, String(A.max));
ok("no match", A.none === 0);

// ---------- validation ----------
const V = await page.evaluate(() => {
  const F = window.Flights, today = F.todayISO();
  const base = { from: "RUH", to: "DXB", depart: "2099-01-10", ret: "2099-01-12", adults: 1, children: 0, cabin: "economy", direct: true };
  return {
    good: F.validate(base),
    noFrom: F.validate({ ...base, from: "" }),
    same: F.validate({ ...base, to: "RUH" }),
    past: F.validate({ ...base, depart: "2000-01-01", ret: "" }),
    backwards: F.validate({ ...base, ret: "2099-01-05" }),
    oneway: F.validate({ ...base, ret: "" }),
    todayOk: F.validate({ ...base, depart: today, ret: "" }),
  };
});
ok("valid search", V.good === "", V.good);
ok("missing origin", V.noFrom !== "");
ok("same city", V.same !== "");
ok("past date", V.past !== "");
ok("return before depart", V.backwards !== "");
ok("one way valid", V.oneway === "", V.oneway);
ok("today is valid", V.todayOk === "", V.todayOk);

// ---------- UI flow ----------
await page.fill("#from", "الرياض");
await page.click("#from-list .opt");
await page.fill("#to", "دبي");
await page.click("#to-list .opt");
await page.fill("#depart", "2099-03-10");
await page.fill("#ret", "2099-03-14");
await page.click("#search");
const R = await page.evaluate(() => ({
  hrefs: [...document.querySelectorAll("#results a.site")].map((a) => a.href),
  targets: [...document.querySelectorAll("#results a.site")].map((a) => a.target + "|" + a.rel),
  summary: document.querySelector("#summary")?.textContent || "",
}));
ok("results show 5 sites", R.hrefs.length === 5, String(R.hrefs.length));
ok("results use chosen route", R.hrefs.every((h) => /RUH|ruh/.test(h) && /DXB|dxb/.test(h)), JSON.stringify(R.hrefs));
ok("links open in new tab without referrer", R.targets.every((t) => t === "_blank|noopener noreferrer"), JSON.stringify(R.targets));
ok("summary mentions cities", R.summary.includes("الرياض") && R.summary.includes("دبي"), R.summary);

// swap
await page.click("#swap");
const sw = await page.evaluate(() => [document.querySelector("#from").dataset.code, document.querySelector("#to").dataset.code]);
ok("swap", sw[0] === "DXB" && sw[1] === "RUH", JSON.stringify(sw));

// typed code not in list is accepted
await page.fill("#to", "xyz");
await page.click("#search");
const typed = await page.evaluate(() => [...document.querySelectorAll("#results a.site")].length);
ok("unknown 3-letter code accepted", typed === 5, String(typed));

// recent search saved and survives reload
await page.reload();
const recent = await page.evaluate(() => document.querySelectorAll("#recent .chip").length);
ok("recent searches saved", recent >= 1, String(recent));

// error shown for missing destination
await page.fill("#to", "");
await page.click("#search");
const err = await page.evaluate(() => document.querySelector("#error")?.textContent || "");
ok("error for missing destination", err.length > 0, err);

ok("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
