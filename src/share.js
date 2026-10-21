/* Things made to be shared: the profile picture, the branch-graph replay (and its GIF), the README badge, and a pop-up to show them in */
(() => {
"use strict";
const RA = window.RA, { esc, fmt, I } = RA;
const $ = (id) => document.getElementById(id);
const DAY = 864e5;

/* ---------------- Pop-up ---------------- */
function modal(html) {
  $("modal").innerHTML = html; $("modal").hidden = $("modalScrim").hidden = false;
  $("modal").querySelector(".primary, button")?.focus();
}
function closeModal() { $("modal").hidden = $("modalScrim").hidden = true; $("modal").innerHTML = ""; }
$("modalScrim").addEventListener("mousedown", closeModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("modal").hidden) { e.stopPropagation(); closeModal(); } }, true);
$("modal").addEventListener("click", (e) => {
  if (e.target.closest("[data-mclose]")) closeModal();
  const c = e.target.closest("[data-mcopy]"); if (c) RA.copyText(c.closest(".codebox")?.querySelector("pre")?.textContent || c.dataset.mcopy);
});
const head = (title) => `<div class="mh"><h2 id="modalTitle">${esc(title)}</h2><button type="button" class="ib" data-mclose aria-label="Close">${I.close}</button></div>`;
const codebox = (text) => `<div class="codebox"><pre>${esc(text)}</pre><button type="button" class="ib" data-mcopy title="Copy">${I.copy}</button></div>`;

/* ---------------- Files ---------------- */
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  // Not added to the page, so the app's own link handling (open links in the browser) leaves it alone
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  RA.toast("info", `Saved <span class="mono">${esc(name)}</span> to your Downloads folder.`, 4000);
}
async function copyImage(blob) {
  try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); RA.toast("info", "Picture copied. Paste it into a post.", 3000); }
  catch { RA.toast("warn", "Couldn't copy the picture here. Use Download instead."); }
}
const toBlob = (canvas) => new Promise((ok) => canvas.toBlob(ok, "image/png"));
function loadImage(src, cors) {
  return new Promise((ok) => {
    if (!src) return ok(null);
    const img = new Image(); if (cors) img.crossOrigin = "anonymous";
    img.onload = () => ok(img); img.onerror = () => ok(null); img.src = src;
  });
}
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ---------------- Canvas helpers ---------------- */
const FONT = '"Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, Ubuntu, sans-serif';
const MONO = '"Cascadia Code", Consolas, "DejaVu Sans Mono", ui-monospace, monospace';
const P = { bg: "#0d1117", bg2: "#161b22", line: "#30363d", ink: "#f0f6fc", muted: "#8d96a0", accent: "#4daafc", win: "#3fb950", heat: ["#1c2128", "#0e4429", "#006d32", "#26a641", "#39d353"] };
function fit(ctx, text, max) { if (ctx.measureText(text).width <= max) return text; while (text.length > 1 && ctx.measureText(text + "…").width > max) text = text.slice(0, -1); return text + "…"; }
function backdrop(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, P.bg); g.addColorStop(1, "#111a2b");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // A faint grid, like a map
  ctx.strokeStyle = "rgba(255,255,255,.035)"; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke(); }
}
function avatar(ctx, img, s, x, y, r) {
  ctx.save(); ctx.beginPath(); ctx.arc(x + r, y + r, r, 0, Math.PI * 2); ctx.closePath();
  if (img) { ctx.clip(); ctx.drawImage(img, x, y, r * 2, r * 2); }
  else { ctx.fillStyle = P.bg2; ctx.fill(); ctx.fillStyle = P.muted; ctx.font = `700 ${r}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s.name[0].toUpperCase(), x + r, y + r + 2); }
  ctx.restore();
  ctx.strokeStyle = P.line; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + r, y + r, r, 0, Math.PI * 2); ctx.stroke();
}
function pill(ctx, text, x, y, color) {
  ctx.font = `600 20px ${FONT}`; const w = ctx.measureText(text).width + 28;
  ctx.fillStyle = color + "26"; ctx.beginPath(); ctx.roundRect(x, y, w, 36, 18); ctx.fill();
  ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillText(text, x + 14, y + 19);
  return w;
}
function langBar(ctx, langs, x, y, w, h) {
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.clip();
  ctx.fillStyle = P.bg2; ctx.fillRect(x, y, w, h);
  let cx = x; for (const l of langs) { const lw = Math.max(3, l.share * w); ctx.fillStyle = l.color; ctx.fillRect(cx, y, lw, h); cx += lw; }
  ctx.restore();
}
function heat(ctx, days, x, y, cell) {
  const nz = days.map((d) => d.count).filter(Boolean).sort((a, b) => a - b);
  const q = [0.25, 0.5, 0.75].map((p) => nz[Math.floor(p * (nz.length - 1))] || 1);
  const lvl = (c) => c === 0 ? 0 : c <= q[0] ? 1 : c <= q[1] ? 2 : c <= q[2] ? 3 : 4;
  const pad = new Date(days[0]?.date + "T12:00:00Z").getUTCDay() || 0;
  days.forEach((d, i) => { const k = i + pad; ctx.fillStyle = P.heat[lvl(d.count)]; ctx.beginPath(); ctx.roundRect(x + Math.floor(k / 7) * (cell + 3), y + (k % 7) * (cell + 3), cell, cell, 2); ctx.fill(); });
}
function footer(ctx, W, H, link) {
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = P.ink; ctx.font = `700 22px ${FONT}`; ctx.textAlign = "left"; ctx.fillText("Repo Atlas", 64, H - 40);
  ctx.fillStyle = P.muted; ctx.font = `18px ${MONO}`; ctx.textAlign = "right"; ctx.fillText(fit(ctx, link.replace(/^https?:\/\//, ""), W - 330), W - 64, H - 40);
  ctx.fillStyle = P.accent; ctx.fillRect(64, H - 72, 46, 4);
}

/* ---------------- The share picture ---------------- */
function statsNow() { return AtlasBadge.atlasStats(RA.S.user, RA.S.repos, RA.S.days, RA.S.daysSource); }
async function profileCard(s, link) {
  const W = 1200, H = 630, c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d"); backdrop(ctx, W, H);
  const img = await loadImage(s.avatar ? s.avatar + (s.avatar.includes("?") ? "&" : "?") + "s=240" : null, true);
  avatar(ctx, img, s, 64, 64, 64);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillStyle = P.ink; ctx.font = `700 50px ${FONT}`; ctx.fillText(fit(ctx, s.name, 440), 220, 116);
  ctx.fillStyle = P.muted; ctx.font = `22px ${MONO}`; ctx.fillText(fit(ctx, `@${s.login} · on GitHub since ${s.since}`, 440), 220, 154);
  pill(ctx, s.title, 220, 172, P.accent);
  // Half a year of activity, top right
  if (s.days.length) {
    const cols = Math.ceil((s.days.length + new Date(s.days[0].date + "T12:00:00Z").getUTCDay()) / 7);
    heat(ctx, s.days, W - 64 - cols * 17 + 3, 64, 14);
    ctx.fillStyle = P.muted; ctx.font = `16px ${FONT}`; ctx.textAlign = "right"; ctx.fillText(s.days.length > 100 ? "last 6 months" : "last 90 days", W - 64, 210);
  }
  // Four big numbers
  const nums = [["stars earned", fmt(s.stars)], ["repositories", fmt(s.repos)], [s.contribLabel, fmt(s.contributions)], ["day best streak", String(s.streak)]];
  nums.forEach(([k, v], i) => {
    const x = 64 + i * 272; ctx.textAlign = "left";
    ctx.fillStyle = P.ink; ctx.font = `700 64px ${FONT}`; ctx.fillText(v, x, 330);
    ctx.fillStyle = P.muted; ctx.font = `20px ${FONT}`; ctx.fillText(fit(ctx, k, 250), x, 368);
  });
  // Languages
  langBar(ctx, s.langs, 64, 400, W - 128, 16);
  let lx = 64; ctx.font = `19px ${FONT}`; ctx.textAlign = "left";
  for (const l of s.langs) {
    const t = `${l.name} ${Math.round(l.share * 100)}%`, w = ctx.measureText(t).width;
    if (lx + w + 30 > W - 64) break;
    ctx.fillStyle = l.color; ctx.beginPath(); ctx.arc(lx + 7, 446, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.ink; ctx.fillText(t, lx + 22, 453); lx += w + 52;
  }
  // Two small facts
  const facts = [s.top ? `Most starred: ${s.top.name} (★ ${fmt(s.top.stars)})` : null, s.weekday ? `Busiest day of the week: ${s.weekday}` : null].filter(Boolean);
  ctx.fillStyle = P.muted; ctx.font = `20px ${FONT}`; ctx.fillText(fit(ctx, facts.join("   ·   "), W - 128), 64, 510);
  footer(ctx, W, H, link);
  return c;
}
async function compareCard(a, b, link) {
  const W = 1200, H = 630, c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d"); backdrop(ctx, W, H);
  const [ia, ib] = await Promise.all([a, b].map((s) => loadImage(s.avatar ? s.avatar + (s.avatar.includes("?") ? "&" : "?") + "s=200" : null, true)));
  const rows = duelRows(a, b), sa = rows.filter((r) => r.win === "a").length, sb = rows.filter((r) => r.win === "b").length;
  const side = (s, img, right) => {
    const x = right ? W - 64 - 96 : 64;
    avatar(ctx, img, s, x, 52, 48);
    ctx.textAlign = right ? "right" : "left"; ctx.textBaseline = "alphabetic";
    const tx = right ? x - 20 : x + 116;
    ctx.fillStyle = P.ink; ctx.font = `700 34px ${FONT}`; ctx.fillText(fit(ctx, s.name, 330), tx, 92);
    ctx.fillStyle = P.accent; ctx.font = `600 19px ${FONT}`; ctx.fillText(fit(ctx, `${s.title} · @${s.login}`, 330), tx, 124);
  };
  side(a, ia, false); side(b, ib, true);
  ctx.textAlign = "center"; ctx.fillStyle = P.ink; ctx.font = `800 56px ${FONT}`; ctx.fillText(`${sa} – ${sb}`, W / 2, 104);
  ctx.fillStyle = P.muted; ctx.font = `600 16px ${MONO}`; ctx.fillText("VS", W / 2, 132);
  const top = 168, rh = 46, mid = W / 2, gap = 112, half = 300;
  rows.forEach((r, i) => {
    const y = top + i * rh;
    ctx.fillStyle = P.muted; ctx.font = `17px ${FONT}`; ctx.textAlign = "center"; ctx.fillText(fit(ctx, r.label, gap * 2 - 12), mid, y + 24);
    const max = Math.max(r.a, r.b) || 1;
    const bar = (v, win, right) => {
      const w = Math.max(4, half * v / max), x = right ? mid + gap : mid - gap - w;
      ctx.fillStyle = win ? P.accent : "#3a424d"; ctx.beginPath(); ctx.roundRect(x, y + 10, w, 16, 8); ctx.fill();
      ctx.fillStyle = win ? P.win : P.ink; ctx.font = `700 24px ${MONO}`; ctx.textAlign = right ? "left" : "right";
      ctx.fillText(r.fmt(right ? r.b : r.a), right ? mid + gap + half + 22 : mid - gap - half - 22, y + 27);
    };
    bar(r.a, r.win === "a", false); bar(r.b, r.win === "b", true);
  });
  footer(ctx, W, H, link);
  return c;
}
// The rows of a head-to-head, shared with the compare view
function duelRows(a, b) {
  const yrs = (s) => new Date().getFullYear() - s.since;
  const rows = [
    { label: "Stars earned", a: a.stars, b: b.stars },
    { label: "Repositories", a: a.repos, b: b.repos },
    { label: "Followers", a: a.followers, b: b.followers },
    { label: a.contribLabel === b.contribLabel ? (a.contribLabel.startsWith("contrib") ? "Contributions, 1 yr" : "Actions, 90 days") : "Activity", a: a.contributions, b: b.contributions },
    { label: "Best streak (days)", a: a.streak, b: b.streak },
    { label: "Languages", a: a.langCount, b: b.langCount },
    { label: "Years on GitHub", a: yrs(a), b: yrs(b) },
    { label: "Active repos, 30 days", a: a.active, b: b.active },
  ];
  for (const r of rows) { r.win = r.a > r.b ? "a" : r.b > r.a ? "b" : null; r.fmt = fmt; }
  return rows;
}

async function showShare() {
  const S = RA.S;
  if (!S.user) return;
  const s = statsNow(), link = S.sample ? RA.linkFor({}) : RA.linkFor({ user: S.user.login });
  RA.busyStart("Drawing your picture…");
  let canvas; try { canvas = await profileCard(s, link); } finally { RA.busyEnd(); }
  const blob = await toBlob(canvas);
  const text = S.sample ? "Repo Atlas maps any GitHub account. Try yours:" : `My GitHub, mapped: ${fmt(s.stars)} stars across ${fmt(s.repos)} repos. Apparently I'm a "${s.title}". What are you?`;
  openShareModal("Share this profile", canvas, blob, `repo-atlas-${s.login}.png`, text, link,
    S.sample ? `<p>This is sample data. Load your own account (Ctrl+O) to make your picture.</p>` : "");
}
function openShareModal(title, canvas, blob, file, text, link, note) {
  modal(`${head(title)}${note || ""}<img class="preview" src="${canvas.toDataURL("image/png")}" alt="Preview of the picture">
    <div class="acts">
      <button type="button" class="btn primary" id="shDl">${I.download}Download picture</button>
      <button type="button" class="btn" id="shCopy">${I.copy}Copy picture</button>
      <button type="button" class="btn" id="shX">Post on X</button>
      <button type="button" class="btn" id="shIn">Share on LinkedIn</button>
      <button type="button" class="btn" id="shLink">${I.link}Copy link</button>
    </div>
    <p>Tip: download or copy the picture first, then attach it to your post. The link opens this view for anyone, no install needed.</p>`);
  $("shDl").onclick = () => saveBlob(blob, file);
  $("shCopy").onclick = () => copyImage(blob);
  $("shX").onclick = () => RA.openExternal(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`);
  $("shIn").onclick = () => RA.openExternal(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`);
  $("shLink").onclick = () => RA.copyText(link);
}

/* ---------------- Branch graph replay ---------------- */
let replay = null;
function graphParts() {
  const box = $("dGraph"), svg = box?.querySelector("svg");
  return svg && box.steps?.length ? { box, svg, steps: box.steps, key: box.key || [] } : null;
}
function showUpTo(svg, k) { for (const el of svg.querySelectorAll("[data-s]")) el.style.opacity = +el.dataset.s <= k ? "" : "0"; }
function stopReplay(finish) {
  if (!replay) return;
  clearInterval(replay.timer); replay.box.replaying = false;
  if (finish && replay.svg.isConnected) showUpTo(replay.svg, Infinity);
  replay = null;
  const b = $("replayBtn"); if (b) b.innerHTML = `${I.play}Replay history`;
}
function toggleReplay() {
  if (replay) return stopReplay(true);
  const g = graphParts(); if (!g) return RA.toast("info", "Wait for the branch graph to finish loading, then try again.");
  const { box, svg, steps } = g;
  let k = 0;
  replay = { svg, box, timer: null }; box.replaying = true;
  $("replayBtn").innerHTML = `${I.pause}Stop`;
  showUpTo(svg, 0); box.scrollLeft = 0;
  replay.timer = setInterval(() => {
    if (!svg.isConnected) return stopReplay(false);
    k++; showUpTo(svg, k);
    const x = steps[Math.min(k, steps.length - 1)].x; box.scrollLeft = Math.max(0, x - box.clientWidth * 0.7);
    if (k >= steps.length - 1) stopReplay(true);
  }, Math.max(60, Math.min(220, 6000 / steps.length)));
}
// The graph SVG as a stand-alone image: theme colors filled in, since an image can't see the page's styles
// x0 crops off everything left of it, so a long history still fits the GIF
function standaloneSvg(svg, x0 = 0) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (x0 > 0) { const w = +svg.getAttribute("width") - x0, h = svg.getAttribute("height"); clone.setAttribute("viewBox", `${x0} 0 ${w} ${h}`); clone.setAttribute("width", w); }
  for (const a of clone.querySelectorAll("a")) a.replaceWith(...a.childNodes);
  const style = `text{font:11px ${MONO};fill:var(--muted)}text.fl{fill:#fff;font:600 10px ${MONO}}.gn circle{stroke:var(--surface);stroke-width:3}`;
  clone.insertAdjacentHTML("afterbegin", `<style>${style}</style>`);
  const text = new XMLSerializer().serializeToString(clone);
  return text.replace(/var\(--([\w-]+)\)/g, (_, n) => css("--" + n) || "#888");
}
const GIF_STEPS = 60;
async function replayGif() {
  const g = graphParts(); if (!g) return RA.toast("info", "Wait for the branch graph to finish loading, then try again.");
  stopReplay(true);
  const r = RA.curRepo(), { svg, key } = g;
  // A GIF of a long history plays only its newest commits, the older ones standing still at the start
  const first = Math.max(0, g.steps.length - GIF_STEPS), steps = g.steps.slice(first), x0 = first ? Math.max(0, steps[0].x - 46) : 0;
  const W0 = +svg.getAttribute("width") - x0, H0 = +svg.getAttribute("height");
  const scale = Math.min(1.5, 1100 / W0), PAD = 24, HEAD = 64, FOOT = 34;
  const W = Math.round(Math.max(560, W0 * scale + PAD * 2));
  const canvas = document.createElement("canvas"); canvas.width = W;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // The color key under the graph, since labels only say "PR #12": entries flow left to right and wrap
  ctx.font = `12px ${MONO}`;
  let kx = PAD, ky = 0;
  const keyAt = key.map((e) => {
    const text = fit(ctx, (e.label ? e.label + "  " : "") + e.name, W - PAD * 2 - 20), w = ctx.measureText(text).width + 34;
    if (kx > PAD && kx + w > W - PAD) { kx = PAD; ky += 20; }
    const at = { ...e, text, x: kx, y: ky }; kx += w; return at;
  });
  const KEY = keyAt.length ? ky + 30 : 0, H = Math.round(H0 * scale + HEAD + KEY + FOOT); canvas.height = H;
  const bg = css("--surface") || "#181818", ink = css("--ink-strong") || "#fff", muted = css("--muted") || "#999";
  const frames = [], n = steps.length;
  RA.busyStart("Making the GIF…");
  try {
    for (let k = 0; k < n; k++) {
      showUpTo(svg, first + k);
      const img = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(standaloneSvg(svg, x0)));
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      ctx.fillStyle = ink; ctx.font = `600 18px ${FONT}`; ctx.fillText(fit(ctx, r ? r.full_name : "Branch graph", W - 200), PAD, 30);
      ctx.fillStyle = muted; ctx.font = `13px ${MONO}`;
      ctx.fillText(fit(ctx, `${RA.dateStr(steps[k].date)} · ${steps[k].msg}`, W - PAD * 2), PAD, 52);
      ctx.textAlign = "right"; ctx.fillText(`${k + 1}/${n}`, W - PAD, 30);
      if (img) ctx.drawImage(img, PAD, HEAD, W0 * scale, H0 * scale);
      ctx.textAlign = "left"; ctx.font = `12px ${MONO}`;
      for (const e of keyAt) {
        const y = HEAD + H0 * scale + 10 + e.y;
        ctx.fillStyle = e.c; ctx.beginPath(); ctx.arc(e.x + 6, y + 6, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = muted; ctx.fillText(e.text, e.x + 18, y + 10);
      }
      ctx.textAlign = "right"; ctx.fillStyle = muted; ctx.font = `600 12px ${FONT}`; ctx.fillText("Made with Repo Atlas", W - PAD, H - 12);
      frames.push({ data: ctx.getImageData(0, 0, W, H).data, delay: k === n - 1 ? 2600 : Math.max(80, Math.min(200, 7000 / n)) });
      if (k % 8 === 0) await new Promise((ok) => setTimeout(ok));
    }
  } finally { showUpTo(svg, Infinity); RA.busyEnd(); }
  const blob = new Blob([encodeGif(W, H, frames)], { type: "image/gif" });
  const name = `${(r?.name || "branch-graph")}-history.gif`;
  const link = r && !RA.S.sample ? RA.linkFor({ user: r.full_name.split("/")[0], repo: r.name }) : RA.linkFor({});
  const url = URL.createObjectURL(blob);
  modal(`${head("History replay")}<img class="preview" src="${canvas.toDataURL("image/png")}" alt="Last frame of the replay" id="gifPrev">
    <div class="acts"><button type="button" class="btn primary" id="gDl">${I.download}Download GIF</button>
      <button type="button" class="btn" id="gX">Post on X</button><button type="button" class="btn" id="gLink">${I.link}Copy link</button></div>
    <p>${first ? `The newest ${n}` : n} commits, ${(blob.size / 1048576).toFixed(1)} MB. Attach the GIF to a post or a pull request to show how the work came together.</p>`);
  // The preview plays the real GIF where the page allows it
  const prev = $("gifPrev"); const anim = new Image(); anim.onload = () => { if (prev.isConnected) prev.src = url; }; anim.src = url;
  $("gDl").onclick = () => saveBlob(blob, name);
  $("gX").onclick = () => RA.openExternal(`https://x.com/intent/post?text=${encodeURIComponent(`The history of ${r?.full_name || "this repo"}, replayed commit by commit:`)}&url=${encodeURIComponent(link)}`);
  $("gLink").onclick = () => RA.copyText(link);
}

/* ---------------- README badge ---------------- */
let badgeTheme = "dark";
function showBadge() {
  const S = RA.S; if (!S.user) return;
  const s = statsNow(), login = S.sample ? "your-username" : S.user.login;
  const svg = AtlasBadge.atlasBadgeSVG(s, badgeTheme);
  const workflow = `name: Repo Atlas badge
on:
  schedule:
    - cron: "0 3 * * *"   # every day
  workflow_dispatch:      # and whenever you press "Run workflow"
permissions:
  contents: write
jobs:
  badge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Sand-Runner-75/repo-atlas@main
        with:
          user: ${login}
          theme: ${badgeTheme}`;
  const md = `[![Repo Atlas](./repo-atlas.svg)](${RA.linkFor({ user: login })})`;
  modal(`${head("README badge")}
    <img class="preview" style="max-width:495px;background:transparent;border:0" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" alt="Badge preview">
    <div class="acts"><div class="seg" role="group" aria-label="Badge theme"><button type="button" data-bt="dark" aria-pressed="${badgeTheme === "dark"}">Dark</button><button type="button" data-bt="light" aria-pressed="${badgeTheme === "light"}">Light</button></div>
      <button type="button" class="btn" id="bDl">${I.download}Download badge</button></div>
    <p>To keep it up to date by itself on your GitHub profile:</p>
    <ol>
      <li>Open your profile repository on GitHub (the one named <span class="mono">${esc(login)}/${esc(login)}</span>).</li>
      <li>Add a file called <span class="mono">.github/workflows/repo-atlas.yml</span> with this inside:${codebox(workflow)}</li>
      <li>Open the <b>Actions</b> tab, pick <b>Repo Atlas badge</b> and press <b>Run workflow</b>. It makes <span class="mono">repo-atlas.svg</span> and refreshes it every day.</li>
      <li>Put this line in your profile's README:${codebox(md)}</li>
    </ol>`);
  $("modal").querySelectorAll("[data-bt]").forEach((b) => b.onclick = () => { badgeTheme = b.dataset.bt; showBadge(); });
  $("bDl").onclick = () => saveBlob(new Blob([svg], { type: "image/svg+xml" }), "repo-atlas.svg");
}

RA.addCommands([
  { id: "share", label: "Share: Make a Picture of This Profile", run: showShare },
  { id: "badge", label: "Share: Get a README Badge", run: showBadge },
  { id: "replay", label: "Repository: Replay Branch History", when: RA.isRepo, run: toggleReplay },
  { id: "replayGif", label: "Repository: Save Branch History as GIF", when: RA.isRepo, run: replayGif },
]);
window.AtlasShare = { modal, closeModal, head, codebox, compareCard, duelRows, openShareModal, toBlob, saveBlob, FONT, MONO };
})();
