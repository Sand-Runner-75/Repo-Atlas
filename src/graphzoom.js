/* Branch graph zoom and hover: scroll to zoom, drag to look around, and hover a dot to see the commit and the files it
   changed. Zooming sizes the SVG through CSS only, so its width/height attributes (used by the replay GIF and share
   picture) keep meaning the unzoomed graph. */
(() => {
"use strict";
const RA = window.RA;
const $ = (id) => document.getElementById(id);
const ZMIN = 0.2, ZMAX = 3, WAIT = 350, SHOW = 8;

// Called by fillGraph each time it draws. keep: loading older commits, so stay at the same zoom
function apply(box, keep) {
  const svg = box.querySelector("svg"); if (!svg) return;
  if (!keep) box.zoom = 1;
  size(box, svg);
  if (!box.zoomReady) setup(box);
  hint(box);
}
function size(box, svg = box.querySelector("svg")) {
  if (!svg) return;
  const z = box.zoom || 1;
  svg.style.width = svg.getAttribute("width") * z + "px";
  svg.style.height = svg.getAttribute("height") * z + "px";
  const r = $("gzReset"); if (r) r.hidden = Math.abs(z - 1) < 0.01;
}
// Zoom to z, keeping the graph point under (cx, cy) where it is
function zoomTo(box, z, cx, cy) {
  // Zooming out stops once the whole graph fits (or at ZMIN for a long history)
  const W = +box.querySelector("svg").getAttribute("width"), fit = Math.min(1, box.clientWidth / W);
  const z0 = box.zoom || 1; z = Math.max(Math.max(ZMIN, fit), Math.min(ZMAX, z));
  if (Math.abs(z - z0) < 0.001) return;
  const b = box.getBoundingClientRect();
  if (cx == null) { cx = b.left + box.clientWidth / 2; cy = b.top + box.clientHeight / 2; }
  const gx = (box.scrollLeft + cx - b.left) / z0, gy = (box.scrollTop + cy - b.top) / z0;
  box.zoom = z; size(box);
  box.scrollLeft = gx * z - (cx - b.left); box.scrollTop = gy * z - (cy - b.top);
}
function hint(box) {
  if ($("gzHint")) return size(box);
  box.insertAdjacentHTML("afterend", `<div class="cthint" id="gzHint">Scroll to zoom · Drag to look around · Hover a dot to see the commit and its files <button type="button" class="link" id="gzReset" hidden>Reset zoom</button></div>`);
  $("gzReset").onclick = () => { const z = box.zoom || 1, fromRight = box.scrollWidth - box.scrollLeft; zoomTo(box, 1); if (z !== 1) box.scrollLeft = box.scrollWidth - fromRight / z; };
  size(box);
}
function setup(box) {
  box.zoomReady = true;
  box.addEventListener("wheel", (e) => {
    if (!box.querySelector("svg") || e.ctrlKey && !e.deltaY) return;
    // Sideways scrolling (a touchpad, or Shift + wheel) still moves along the history
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    zoomTo(box, (box.zoom || 1) * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });
  // Dragging moves the view; a press that barely moves is still a click that opens the commit
  let drag = null, moved = false;
  box.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !box.querySelector("svg")) return;
    drag = { x: e.clientX, y: e.clientY, l: box.scrollLeft, t: box.scrollTop, id: e.pointerId }; moved = false;
  });
  box.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && dx * dx + dy * dy < 25) return;
    if (!moved) { moved = true; box.classList.add("dragging"); try { box.setPointerCapture(drag.id); } catch {} }
    box.scrollLeft = drag.l - dx; box.scrollTop = drag.t - dy;
  });
  const end = () => { drag = null; box.classList.remove("dragging"); };
  box.addEventListener("pointerup", end); box.addEventListener("pointercancel", end);
  box.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  box.addEventListener("dragstart", (e) => e.preventDefault());
  // Files are fetched only after the pointer rests on a dot, once per commit, then remembered
  let timer = null;
  box.addEventListener("pointerover", (e) => {
    const dot = e.target.closest?.(".gn[data-sha]"); clearTimeout(timer);
    if (!dot || drag) return;
    timer = setTimeout(() => filesFor(dot), WAIT);
  });
  box.addEventListener("pointerleave", () => clearTimeout(timer));
}

/* ---------------- Files a commit changed ---------------- */
const cache = new Map();
async function filesFor(dot) {
  const full = RA.repoShown(), sha = dot.dataset.sha; if (!full || !sha || dot.dataset.files) return;
  const key = full + "@" + sha;
  if (!cache.has(key)) {
    if ((RA.rateLeft() ?? 60) < 10) return;
    show(dot, "Loading files…");
    cache.set(key, RA.gh(`/repos/${full}/commits/${sha}`).then(({ data }) => data, () => (cache.delete(key), null)));
  }
  const data = await cache.get(key);
  if (!dot.isConnected) return;
  if (!data) return show(dot, "Couldn't load the files");
  const files = data.files || [];
  const line = (f) => `${f.status === "added" ? "+" : f.status === "removed" ? "−" : f.status === "renamed" ? "→" : "•"} ${short(f.filename)}  +${f.additions} −${f.deletions}`;
  const head = files.length ? `${files.length}${files.length >= 300 ? "+" : ""} file${files.length === 1 ? "" : "s"} changed` : "No files changed";
  show(dot, [head, ...files.slice(0, SHOW).map(line), ...(files.length > SHOW ? [`and ${files.length - SHOW} more`] : [])].join("\n"), true);
}
const short = (p) => p.length > 36 ? "…" + p.slice(-35) : p;
// Adds the files under the commit's own lines, and refreshes the tooltip if it's showing this dot
function show(dot, text, done) {
  dot.dataset.base ??= dot.getAttribute("data-tip");
  dot.setAttribute("data-tip", dot.dataset.base + "\n\n" + text);
  if (done) dot.dataset.files = "1";
  const tip = $("tip");
  if (!tip.hidden && dot.matches(":hover")) tip.textContent = dot.getAttribute("data-tip");
}

window.AtlasGraphZoom = { apply };
})();
