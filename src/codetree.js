/* Code tree: the repository's files as a living tree, played back commit by commit (in the spirit of Gource).
   Folders are joined by lines, files are dots colored by type around their folder, and each coder flies to the files
   they change. Drawn on a plain canvas, no libraries. */
(() => {
"use strict";
const RA = window.RA, { esc, I } = RA;
const $ = (id) => document.getElementById(id);
const { FONT, MONO } = window.AtlasShare;
const BG = "#0b0e14", INK = "#e6edf3", MUTED = "#8b949e";
const MAX_FILES = 4000;

/* ---------------- File colors ---------------- */
const EXT = {
  js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", jsx: "JavaScript", ts: "TypeScript", tsx: "TypeScript", py: "Python", java: "Java",
  c: "C", h: "C", cpp: "C++", cc: "C++", hpp: "C++", cs: "C#", go: "Go", rs: "Rust", rb: "Ruby", php: "PHP", swift: "Swift", kt: "Kotlin",
  dart: "Dart", html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", sh: "Shell", bash: "Shell", vue: "Vue", svelte: "Svelte", r: "R",
  scala: "Scala", hs: "Haskell", ex: "Elixir", exs: "Elixir", ps1: "PowerShell", ipynb: "Jupyter Notebook", zig: "Zig", nix: "Nix",
  tf: "HCL", tex: "TeX", sol: "Solidity", astro: "Astro", mdx: "MDX", cmake: "CMake", erl: "Erlang", ml: "OCaml", jl: "Julia", m: "Objective-C",
};
const FIXED = { md: "#e6edf3", txt: "#c9d1d9", json: "#cbcb41", yml: "#e5534b", yaml: "#e5534b", toml: "#c47e3e", lock: "#768390", xml: "#3fb950",
  png: "#a371f7", jpg: "#a371f7", jpeg: "#a371f7", gif: "#a371f7", svg: "#ffb000", ico: "#a371f7", gitignore: "#f78166", csv: "#56d4dd", sql: "#e38c00" };
const extOf = (path) => { const name = path.split("/").pop(), i = name.lastIndexOf("."); return (i > 0 ? name.slice(i + 1) : i === 0 ? name.slice(1) : name).toLowerCase().slice(0, 14); };
const colorMemo = new Map();
function colorOf(ext) {
  if (colorMemo.has(ext)) return colorMemo.get(ext);
  let c = FIXED[ext] || (EXT[ext] && RA.langColor(EXT[ext]));
  // Language colors made for white pages can vanish on black; anything too dark gets a hue of its own instead
  if (!c || /^#/.test(c) && lum(c) < 0.12) { let h = 0; for (const ch of ext) h = (h * 31 + ch.charCodeAt(0)) % 360; c = `hsl(${h} 65% 60%)`; }
  colorMemo.set(ext, c); return c;
}
function lum(hex) { const n = parseInt(hex.slice(1).padEnd(6, "0").slice(0, 6), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; }
const AUTHOR = ["#58a6ff", "#f778ba", "#3fb950", "#ffa657", "#d2a8ff", "#56d4dd", "#ff7b72", "#e3b341"];

/* ---------------- The simulation ---------------- */
// One Sim per playback: the on-screen view has one, a GIF recording makes its own. t is in seconds of playback time.
class Sim {
  constructor(data, keep) {
    this.data = data; this.keep = keep || new Map(); // folder positions survive restarts, so seeking doesn't reshuffle the picture
    this.dirs = new Map(); this.files = new Map(); this.dying = []; this.authors = new Map(); this.k = 0; this.t = 0; this.busy = -99;
    this.root = this.dir("");
    for (const p of data.initial) this.add(p, -10);
    this.date = data.commits[0]?.date;
  }
  dir(path) {
    let d = this.dirs.get(path); if (d) return d;
    const parent = path ? this.dir(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "") : null;
    const kept = this.keep.get(path), a = Math.random() * Math.PI * 2;
    d = { path, name: path.split("/").pop() || "/", parent, kids: new Set(), files: [], x: kept ? kept[0] : (parent ? parent.x + Math.cos(a) * 60 : 0), y: kept ? kept[1] : (parent ? parent.y + Math.sin(a) * 60 : 0), vx: 0, vy: 0, r: 10, hot: -99 };
    if (parent) parent.kids.add(d);
    this.dirs.set(path, d); return d;
  }
  add(path, t) {
    let f = this.files.get(path);
    if (!f) {
      if (this.files.size >= MAX_FILES) return null;
      const d = this.dir(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""), ext = extOf(path);
      f = { path, d, ext, c: colorOf(ext), born: t, hot: -99 };
      this.files.set(path, f); d.files.push(f); d.r = 8 + 4.2 * Math.sqrt(d.files.length);
    }
    return f;
  }
  remove(path, t) {
    const f = this.files.get(path); if (!f) return null;
    this.files.delete(path); const d = f.d; d.files.splice(d.files.indexOf(f), 1); d.r = 8 + 4.2 * Math.sqrt(d.files.length);
    this.dying.push({ ...f, x: f.x, y: f.y, died: t });
    // Empty folders go too, up to the first one that still holds something
    for (let e = d; e.parent && !e.files.length && !e.kids.size; e = e.parent) { e.parent.kids.delete(e); this.dirs.delete(e.path); }
    return null;
  }
  // Applies the next commit: files appear, light up or fade out, and their author flies over
  next() {
    const c = this.data.commits[this.k++]; if (!c) return;
    this.date = c.date; this.busy = this.t;
    const touched = [];
    for (const ch of c.files) {
      if (ch.s === "removed") { this.remove(ch.p, this.t); continue; }
      if (ch.s === "renamed" && ch.prev) this.remove(ch.prev, this.t);
      const f = this.add(ch.p, this.t); if (f) { f.hot = this.t; f.d.hot = this.t; touched.push(f); }
    }
    let a = this.authors.get(c.author);
    if (!a) {
      const anchor = touched[0]?.d || this.root, n = this.authors.size;
      a = { name: c.author, img: this.data.avatars?.get(c.author), c: AUTHOR[n % AUTHOR.length], x: anchor.x + 160, y: anchor.y - 120, vx: 0, vy: 0 };
      this.authors.set(c.author, a);
    }
    a.last = this.t; a.targets = touched; a.msg = c.msg;
  }
  // Moves everything one step: folders push apart and pull towards their parent, coders glide to their files
  step(dt) {
    this.t += dt;
    const dirs = [...this.dirs.values()], n = dirs.length;
    for (let i = 0; i < n; i++) {
      const a = dirs[i];
      for (let j = i + 1; j < n; j++) {
        const b = dirs[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r + 26, d2 = dx * dx + dy * dy;
        if (d2 > min * min * 2.2) continue;
        const d = Math.sqrt(d2) || 0.1, push = (min * 1.48 - d) / d * 0.06;
        if (push > 0) { a.vx -= dx * push; a.vy -= dy * push; b.vx += dx * push; b.vy += dy * push; }
      }
      const p = a.parent; if (!p) continue;
      const dx = a.x - p.x, dy = a.y - p.y, d = Math.hypot(dx, dy) || 0.1, want = p.r + a.r + 34, pull = (d - want) / d * 0.08;
      a.vx -= dx * pull; a.vy -= dy * pull; p.vx += dx * pull * 0.3; p.vy += dy * pull * 0.3;
      // Away from the grandparent, so branches grow outwards like a tree
      if (p.parent) { const gx = p.x - p.parent.x, gy = p.y - p.parent.y, g = Math.hypot(gx, gy) || 1; a.vx += gx / g * 0.35; a.vy += gy / g * 0.35; }
    }
    for (const d of dirs) {
      if (!d.parent) { d.x *= 0.9; d.y *= 0.9; d.vx = d.vy = 0; continue; }
      d.vx *= 0.82; d.vy *= 0.82; d.x += d.vx; d.y += d.vy;
      this.keep.set(d.path, [d.x, d.y]);
    }
    // Files sit in a sunflower around their folder
    for (const d of dirs) d.files.forEach((f, i) => { const a = i * 2.39996, r = 4.2 * Math.sqrt(i + 0.6); f.x = d.x + Math.cos(a) * r; f.y = d.y + Math.sin(a) * r; });
    for (const a of this.authors.values()) {
      if (!a.targets?.length) continue;
      let cx = 0, cy = 0; for (const f of a.targets) { cx += f.x; cy += f.y; } cx /= a.targets.length; cy /= a.targets.length;
      const tx = cx + 70, ty = cy - 60;
      a.vx = (a.vx + (tx - a.x) * 0.02) * 0.8; a.vy = (a.vy + (ty - a.y) * 0.02) * 0.8; a.x += a.vx; a.y += a.vy;
    }
    // Coders keep a little apart, so two working in one folder don't sit on top of each other
    const people = [...this.authors.values()];
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
      const a = people[i], b = people[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.1;
      if (d < 60) { const k = (60 - d) / d * 0.1; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
    }
    this.dying = this.dying.filter((f) => this.t - f.died < 1.5);
  }
  bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of this.dirs.values()) { x0 = Math.min(x0, d.x - d.r); y0 = Math.min(y0, d.y - d.r); x1 = Math.max(x1, d.x + d.r); y1 = Math.max(y1, d.y + d.r); }
    return x0 === Infinity ? [-100, -100, 100, 100] : [x0, y0, x1, y1];
  }
}

/* ---------------- Drawing ---------------- */
// cam: { x, y, s } is the world point at the center and the zoom. Returns what was drawn where, for hovering.
function draw(ctx, W, H, sim, cam, opt = {}) {
  const t = sim.t, X = (x) => W / 2 + (x - cam.x) * cam.s, Y = (y) => H / 2 + (y - cam.y) * cam.s, hits = [];
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  const glow = (age, span) => Math.max(0, 1 - age / span);
  // Folder lines
  ctx.lineCap = "round";
  for (const d of sim.dirs.values()) {
    if (!d.parent) continue;
    const g = glow(t - d.hot, 2);
    ctx.strokeStyle = `rgba(220,230,245,${0.22 + g * 0.5})`; ctx.lineWidth = Math.max(1, (1.6 + g * 1.5) * Math.min(1.4, cam.s));
    ctx.beginPath(); ctx.moveTo(X(d.parent.x), Y(d.parent.y)); ctx.lineTo(X(d.x), Y(d.y)); ctx.stroke();
  }
  // Files: new ones grow in, changed ones flare, deleted ones fade away
  const fr = Math.max(1.2, 2.1 * cam.s);
  for (const f of sim.files.values()) {
    const g = glow(t - f.hot, 1.2), grow = Math.min(1, (t - f.born) / 0.4 + 0.15), x = X(f.x), y = Y(f.y);
    if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
    ctx.fillStyle = f.c; ctx.globalAlpha = 0.85 + g * 0.15;
    if (g > 0) { ctx.shadowColor = f.c; ctx.shadowBlur = 14 * g; }
    ctx.beginPath(); ctx.arc(x, y, fr * grow * (1 + g * 0.8), 0, Math.PI * 2); ctx.fill();
    if (g > 0) ctx.shadowBlur = 0;
    hits.push({ x, y, r: fr + 2, tip: `${f.path}` });
  }
  for (const f of sim.dying) { ctx.globalAlpha = Math.max(0, 1 - (t - f.died) / 1.5) * 0.7; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(X(f.x), Y(f.y), fr, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  // Names of folders that are busy right now
  ctx.font = `12px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const d of sim.dirs.values()) {
    const g = glow(t - d.hot, 3); if (g <= 0 || !d.parent) continue;
    ctx.globalAlpha = g; ctx.fillStyle = INK; ctx.fillText(d.name, X(d.x), Y(d.y) - (d.r * cam.s) - 8);
  }
  // Coders, with beams to the files they just changed
  for (const a of sim.authors.values()) {
    const idle = t - a.last, fade = idle < 4 ? 1 : Math.max(0, 1 - (idle - 4) / 2); if (fade <= 0) continue;
    const ax = X(a.x), ay = Y(a.y), beam = glow(idle, 1.4);
    if (beam > 0) for (const f of a.targets) {
      const gr = ctx.createLinearGradient(ax, ay, X(f.x), Y(f.y)); gr.addColorStop(0, a.c); gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = beam * 0.75 * fade; ctx.strokeStyle = gr; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(X(f.x), Y(f.y)); ctx.stroke();
    }
    ctx.globalAlpha = fade;
    const R = 13;
    ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, R, 0, Math.PI * 2); ctx.clip();
    if (a.img) ctx.drawImage(a.img, ax - R, ay - R, R * 2, R * 2);
    else { ctx.fillStyle = a.c; ctx.fillRect(ax - R, ay - R, R * 2, R * 2); ctx.fillStyle = BG; ctx.font = `700 13px ${FONT}`; ctx.fillText((a.name[0] || "?").toUpperCase(), ax, ay + 1); }
    ctx.restore();
    ctx.strokeStyle = a.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ax, ay, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = a.c; ctx.font = `600 12px ${FONT}`; ctx.fillText(a.name, ax, ay + R + 11);
    hits.push({ x: ax, y: ay, r: R + 2, tip: `${a.name}\n${a.msg || ""}` });
  }
  ctx.globalAlpha = 1;
  // File types and how many of each, top left
  const counts = new Map(); for (const f of sim.files.values()) counts.set(f.ext, (counts.get(f.ext) || 0) + 1);
  const rows = [...counts].sort((a, b) => b[1] - a[1]).slice(0, opt.legend ?? Math.max(4, Math.floor((H - 40) / 19)));
  ctx.textAlign = "left"; ctx.font = `12px ${MONO}`;
  rows.forEach(([ext, n], i) => {
    const y = 14 + i * 19, w = 86;
    const gr = ctx.createLinearGradient(10, 0, 10 + w, 0); gr.addColorStop(0, colorOf(ext)); gr.addColorStop(1, "rgba(255,255,255,.08)");
    ctx.fillStyle = gr; ctx.fillRect(10, y, w, 16);
    ctx.fillStyle = "#fff"; ctx.fillText(ext.length > 11 ? ext.slice(0, 10) + "…" : ext, 14, y + 8.5);
    ctx.fillStyle = INK; ctx.fillText(RA.fmt(n), 10 + w + 7, y + 8.5);
  });
  // The date at the top, the repository name and progress in the corners
  ctx.textAlign = "center"; ctx.fillStyle = "#79c0ff"; ctx.font = `15px ${FONT}`;
  if (sim.date) ctx.fillText(new Date(sim.date).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }), W / 2, 22);
  if (opt.title) { ctx.textAlign = "right"; ctx.fillStyle = INK; ctx.font = `600 14px ${FONT}`; ctx.fillText(opt.title, W - 14, 22); }
  if (opt.footer) { ctx.textAlign = "right"; ctx.fillStyle = MUTED; ctx.font = `600 12px ${FONT}`; ctx.fillText(opt.footer, W - 14, H - 14); }
  return hits;
}
// A camera that keeps the whole tree in view
function fit(sim, W, H, cam, ease = 1) {
  const [x0, y0, x1, y1] = sim.bounds(), pad = 70;
  const s = Math.min(2.2, (W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0));
  cam.x += ((x0 + x1) / 2 - cam.x) * ease; cam.y += ((y0 + y1) / 2 - cam.y) * ease; cam.s += (s - cam.s) * ease;
  return cam;
}

/* ---------------- Data ---------------- */
// The newest commits of the default branch with the files each one changed. Merges are skipped, since their changes
// already came with the commits they merged. Each commit costs one request, so the window depends on the rate limit left.
async function loadData(r, onStep) {
  const S = RA.S, want = Math.max(5, Math.min(S.token ? 150 : 30, (RA.rateLeft() ?? 60) - 15));
  const enc = encodeURIComponent(r.default_branch);
  let list = [];
  for (let page = 1; list.length < want; page++) {
    const { data } = await RA.gh(`/repos/${r.full_name}/commits?sha=${enc}&per_page=100&page=${page}`);
    list.push(...data); if (data.length < 100) break;
  }
  const whole = list.length <= want; list = list.slice(0, want).reverse();
  let initial = [];
  // Unless this is the whole history, start from the files as they were just before the window
  const before = !whole && list[0]?.parents[0]?.sha;
  if (before) { try { initial = (await RA.gh(`/repos/${r.full_name}/git/trees/${before}?recursive=1`)).data.tree.filter((e) => e.type === "blob").map((e) => e.path); } catch {} }
  const commits = list.filter((c) => c.parents.length < 2).map((c) => ({ sha: c.sha, date: c.commit.author?.date || c.commit.committer?.date, msg: c.commit.message.split("\n")[0], author: c.author?.login || c.commit.author?.name || "someone", avatar: c.author?.avatar_url, files: [] }));
  let done = 0;
  await RA.pool(commits, 6, async (c) => {
    try { const { data } = await RA.gh(`/repos/${r.full_name}/commits/${c.sha}`); c.files = (data.files || []).map((f) => ({ p: f.filename, s: f.status, prev: f.previous_filename })); } catch {}
    onStep?.(++done, commits.length);
  });
  return finish({ initial, commits, whole });
}
// Avatars are loaded for the picture and GIF too, so they must allow being drawn into a canvas (GitHub's do)
async function finish(data) {
  data.avatars = new Map();
  await Promise.all([...new Map(data.commits.filter((c) => c.avatar).map((c) => [c.author, c.avatar]))].map(([who, url]) => new Promise((ok) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => { data.avatars.set(who, img); ok(); }; img.onerror = () => ok();
    img.src = url + (url.includes("?") ? "&" : "?") + "s=64"; setTimeout(ok, 4000);
  })));
  return data;
}
function sampleData() {
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const dirs = ["src", "src/ui", "src/ui/widgets", "src/core", "src/core/net", "src/core/store", "tests", "tests/ui", "docs", "docs/images", "scripts", "assets/icons"];
  const exts = { src: ["js", "js", "ts", "css"], tests: ["js", "json"], docs: ["md", "md", "png"], scripts: ["sh", "py"], assets: ["svg", "png"] };
  const initial = ["README.md", "package.json", ".gitignore", "LICENSE"];
  for (let i = 0; i < 60; i++) { const d = pick(dirs); initial.push(`${d}/${pick(["app", "view", "util", "store", "net", "list", "card", "page", "api", "cache"])}${i}.${pick(exts[d.split("/")[0]])}`); }
  const people = ["sample-dev", "octo-cat", "mona", "hubber"], commits = [];
  let t = Date.now() - 50 * 864e5;
  for (let k = 0; k < 70; k++) {
    t += rnd() * 1.4 * 864e5; const files = [];
    for (let j = 0, m = 1 + Math.floor(rnd() * 5); j < m; j++) {
      if (rnd() < 0.35) { const d = pick(dirs); files.push({ p: `${d}/new-${k}-${j}.${pick(exts[d.split("/")[0]])}`, s: "added" }); }
      else files.push({ p: pick(initial), s: "modified" });
    }
    commits.push({ sha: String(k), date: new Date(t).toISOString(), msg: "Sample change " + (k + 1), author: pick(people), files });
  }
  return { initial, commits, whole: false, avatars: new Map() };
}

/* ---------------- The panel ---------------- */
const V = { settle: 0, data: null, sim: null, keep: new Map(), cam: { x: 0, y: 0, s: 1 }, free: false, playing: false, speed: 1, raf: 0, last: 0, hits: [], acc: 0, full: null };
const RATE = 3; // commits per second at 1×
function panelHtml() {
  return `<section class="panel" id="ctPanel"><div class="ph"><h2>Code tree</h2><span class="sub" id="ctSub">Every file as a dot, every coder flying to the files they change</span>
    <span class="phacts"><button type="button" class="btn" id="ctPlay" data-ct="play">${I.play}Play</button>
      <div class="seg" role="group" aria-label="Speed">${[1, 2, 4].map((s) => `<button type="button" data-ctspeed="${s}" aria-pressed="${s === 1}">${s}×</button>`).join("")}</div>
      <button type="button" class="btn" data-ct="gif" title="Save the playback as an animated GIF">${I.film}Save as GIF</button>
      <button type="button" class="btn" data-ct="picture" title="Make a picture of the tree to post">${I.share}Share picture</button></span></div>
    <div class="ctwrap"><canvas id="ctCanvas" role="img" aria-label="The repository's files as a tree, played back commit by commit"></canvas>
      <div class="ctover" id="ctOver"><button type="button" class="btn primary" data-ct="play">${I.play}Play the code tree</button><span id="ctNote"></span></div></div>
    <div class="ctbar"><input type="range" id="ctTime" min="0" max="0" value="0" step="1" aria-label="Commit"><span class="mono" id="ctWhere"></span>
      <button type="button" class="btn" data-ct="fit" title="Fit the whole tree in view">Fit</button></div>
    <div class="cthint">Scroll to zoom · Drag to look around · Hover a dot to see the file</div></section>`;
}
function mount(r) {
  const graph = $("dGraph")?.closest("section"); if (!graph || $("ctPanel")) return;
  graph.insertAdjacentHTML("afterend", panelHtml());
  Object.assign(V, { data: null, sim: null, keep: new Map(), playing: false, free: false, full: r.full_name });
  const calls = RA.S.sample ? 0 : Math.max(5, Math.min(RA.S.token ? 150 : 30, (RA.rateLeft() ?? 60) - 15));
  $("ctNote").textContent = RA.S.sample ? "Sample data" : `Reads the newest ${calls} commits of ${r.default_branch} (about ${calls + 3} GitHub requests)${RA.S.token ? "" : ". Add a token to read more"}`;
  const cv = $("ctCanvas");
  let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => {
    if (drag) { V.cam.x -= (e.clientX - drag.x) / V.cam.s; V.cam.y -= (e.clientY - drag.y) / V.cam.s; drag.x = e.clientX; drag.y = e.clientY; V.free = true; paint(); return; }
    const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    const h = [...V.hits].reverse().find((q) => (q.x - x) ** 2 + (q.y - y) ** 2 <= q.r * q.r);
    if (h) cv.setAttribute("data-tip", h.tip); else cv.removeAttribute("data-tip");
  });
  cv.addEventListener("pointerup", () => { drag = null; });
  cv.addEventListener("wheel", (e) => { e.preventDefault(); V.cam.s = Math.max(0.05, Math.min(8, V.cam.s * Math.exp(-e.deltaY * 0.0015))); V.free = true; paint(); }, { passive: false });
  $("ctTime").addEventListener("input", (e) => seek(+e.target.value));
  new ResizeObserver(() => paint()).observe(cv);
  paint();
}
async function start() {
  if (V.data) return toggle();
  const r = RA.curRepo(); if (!r) return;
  const full = r.full_name;
  $("ctOver").innerHTML = `<span>Reading commits…</span>`;
  try {
    V.data = RA.S.sample ? sampleData() : await loadData(r, (n, of) => { if ($("ctOver")) $("ctOver").innerHTML = `<span>Reading the files each commit changed… ${n}/${of}</span>`; });
  } catch (e) {
    if ($("ctOver")) $("ctOver").innerHTML = `<span>Couldn't read the commits. ${esc(RA.explain(e).replace(/<[^>]+>/g, ""))}</span>`; return;
  }
  if (RA.curRepo()?.full_name !== full || !$("ctPanel")) return;
  if (!V.data.commits.length) { $("ctOver").innerHTML = `<span>No commits to play.</span>`; V.data = null; return; }
  $("ctOver").hidden = true;
  const n = V.data.commits.length;
  $("ctTime").max = n; $("ctSub").textContent = `${n} commit${n === 1 ? "" : "s"}${V.data.whole ? " (whole history)" : ""} · ${V.data.initial.length ? RA.fmt(V.data.initial.length) + " files to start with" : "growing from the first commit"}`;
  seek(0); toggle(true);
}
function reset() { const s = new Sim(V.data, V.keep); for (let i = 0; i < (V.data.initial.length ? 260 : 20); i++) s.step(0); return s; }
// Jumps to just after commit k by replaying from the start (cheap: only the file lists are replayed)
function seek(k) {
  if (!V.data) return;
  const s = reset(); while (s.k < k) { s.next(); if (s.k % 4 === 0) s.step(0); }
  for (let i = 0; i < 30; i++) s.step(0);
  s.t = 10; for (const f of s.files.values()) f.hot = -99; for (const a of s.authors.values()) a.last = -99;
  V.sim = s; V.acc = 0; V.settle = 90; if (!V.free) fit(s, $("ctCanvas").clientWidth, $("ctCanvas").clientHeight, V.cam); where(); paint();
}
function where() { const s = V.sim, n = V.data.commits.length; $("ctTime").value = s.k; $("ctWhere").textContent = `${s.k}/${n}`; }
function toggle(on = !V.playing) {
  V.playing = on && !!V.data;
  if (V.playing && V.sim.k >= V.data.commits.length) seek(0);
  $("ctPlay").innerHTML = V.playing ? `${I.pause}Pause` : `${I.play}Play`;
  V.last = performance.now(); paint();
}
function paint() {
  if (V.raf) return;
  V.raf = requestAnimationFrame((now) => {
    V.raf = 0;
    const cv = $("ctCanvas"); if (!cv) { V.playing = false; return; }
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!V.sim) { ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H); return; }
    const dt = Math.min(0.1, (now - V.last) / 1000); V.last = now;
    const s = V.sim, n = V.data.commits.length;
    if (V.playing) {
      V.acc += dt * RATE * V.speed;
      while (V.acc >= 1 && s.k < n) { s.next(); V.acc -= 1; }
      if (s.k >= n && V.acc > 4) toggle(false);
      where();
    }
    s.step(dt);
    if (!V.free) fit(s, W, H, V.cam, 0.06);
    V.hits = draw(ctx, W, H, s, V.cam);
    // Keep animating while something is still moving or glowing
    if (V.playing || s.t - s.busy < 7 || V.settle-- > 0) paint();
  });
}

/* ---------------- Picture and GIF ---------------- */
const linkNow = () => { const r = RA.curRepo(); return r && !RA.S.sample ? RA.linkFor({ user: r.full_name.split("/")[0], repo: r.name }) : RA.linkFor({}); };
async function picture() {
  if (!V.sim) return RA.toast("info", "Press Play first, then make the picture at any moment you like.");
  const W = 1600, H = 900, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const r = RA.curRepo(), cam = fit(V.sim, W, H, { x: 0, y: 0, s: 1 });
  draw(cv.getContext("2d"), W, H, V.sim, cam, { title: r?.full_name, footer: "Made with Repo Atlas" });
  const blob = await AtlasShare.toBlob(cv);
  AtlasShare.openShareModal("Share the code tree", cv, blob, `${r?.name || "code"}-tree.png`, `${r?.full_name || "My repo"}, every file and every coder:`, linkNow());
}
async function gif() {
  if (!V.data) return RA.toast("info", "Press Play first, so the commits are read, then save the GIF.");
  toggle(false);
  const n = V.data.commits.length, W = 640, H = 420, FPS = 12, frames = [], per = Math.max(1, Math.min(5, Math.round(150 / n)));
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true }), r = RA.curRepo();
  const s = reset(), cam = fit(s, W, H, { x: 0, y: 0, s: 1 });
  RA.busyStart("Making the GIF…");
  try {
    // Each commit gets a few frames; then a short pause on the finished tree. Long windows play two commits a frame.
    const step = Math.max(1, Math.ceil(n / 150)), total = Math.ceil(n / step) * per + 24;
    for (let f = 0; f < total; f++) {
      if (f % per === 0) for (let j = 0; j < step; j++) s.next();
      s.step(1 / FPS); fit(s, W, H, cam, 0.15);
      draw(ctx, W, H, s, cam, { title: r?.full_name, footer: "Made with Repo Atlas", legend: 14 });
      frames.push({ data: ctx.getImageData(0, 0, W, H).data, delay: f === total - 1 ? 2500 : Math.round(1000 / FPS) });
      if (f % 10 === 0) await new Promise((ok) => setTimeout(ok));
    }
  } finally { RA.busyEnd(); }
  const blob = new Blob([encodeGif(W, H, frames)], { type: "image/gif" }), url = URL.createObjectURL(blob);
  AtlasShare.modal(`${AtlasShare.head("Code tree")}<img class="preview" src="${url}" alt="The code tree playing back">
    <div class="acts"><button type="button" class="btn primary" id="ctDl">${I.download}Download GIF</button>
      <button type="button" class="btn" id="ctX">Post on X</button><button type="button" class="btn" id="ctLink">${I.link}Copy link</button></div>
    <p>${n} commits, ${(blob.size / 1048576).toFixed(1)} MB.</p>`);
  $("ctDl").onclick = () => AtlasShare.saveBlob(blob, `${r?.name || "code"}-tree.gif`);
  $("ctX").onclick = () => RA.openExternal(`https://x.com/intent/post?text=${encodeURIComponent(`${r?.full_name || "My repo"} growing, commit by commit:`)}&url=${encodeURIComponent(linkNow())}`);
  $("ctLink").onclick = () => RA.copyText(linkNow());
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ct]");
  if (b) {
    const what = b.dataset.ct;
    if (what === "play") start(); else if (what === "gif") gif(); else if (what === "picture") picture();
    else if (what === "fit") { V.free = false; V.settle = 60; paint(); }
    return;
  }
  const sp = e.target.closest("[data-ctspeed]");
  if (sp) { V.speed = +sp.dataset.ctspeed; document.querySelectorAll("[data-ctspeed]").forEach((x) => x.setAttribute("aria-pressed", x === sp)); }
});
RA.onRepo((r) => { V.playing = false; mount(r); });
RA.addCommands([
  { id: "codeTree", label: "Repository: Play the Code Tree", when: RA.isRepo, run: () => { $("ctPanel")?.scrollIntoView({ behavior: "smooth", block: "center" }); start(); } },
]);
})();
