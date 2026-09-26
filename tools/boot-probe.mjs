// tools/boot-probe.mjs — why is the dev page still on the loader?
//
// A REVIEW tool. It adds nothing to the bundle and the game exposes nothing for
// it: everything below is read off the DOM the player already sees, plus the
// network log the browser keeps anyway. It exists because `tools/shoot.mjs` was
// coming back with three identical screenshots of the title loader, and a
// screenshot cannot tell "still downloading" from "wedged" from "the page
// reloaded under me".
//
//   node tools/boot-probe.mjs [--seconds 180] [--url ...]
//
// Prints, once a second: the loader's own caption and bar width, whether the
// DROP IN button exists yet, and every page load / failed request seen so far.

import { chromium } from "playwright-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const URL_ = arg("url", "http://localhost:5173/?genex_local_test=1");
const SECONDS = Number(arg("seconds", 180));

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

let loads = 0;
const failed = [];
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) loads++;
});
page.on("requestfailed", (r) => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 120)}`));
page.on("pageerror", (e) => failed.push(`[pageerror] ${e.message}`));

await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 120000 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let t = 0; t < SECONDS; t++) {
  const state = await page
    .evaluate(() => {
      const play = document.querySelector('[data-act="play"]');
      const bar = [...document.querySelectorAll("div,span")]
        .map((e) => e.style && e.style.width)
        .filter((w) => w && w.endsWith("%"));
      const text = (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 120);
      return { play: !!play, playText: play ? play.textContent.trim() : null, bar, text };
    })
    .catch((e) => ({ err: String(e).slice(0, 80) }));
  console.log(
    `t=${String(t).padStart(3)}s loads=${loads} play=${state.play ? `YES "${state.playText}"` : "no"} ` +
      `bar=${(state.bar || []).join(",") || "—"} | ${state.text ?? state.err}`,
  );
  if (state.play) break;
  await sleep(1000);
}
if (failed.length) console.log(`\nfailed requests / page errors (${failed.length}):\n  ${failed.slice(0, 20).join("\n  ")}`);
await browser.close();
