/* Repository tab: pull requests that never made it into the code, split into open ones (still waiting) and
   closed ones that were never merged (nothing left to do) */
(() => {
"use strict";
const RA = window.RA, { esc, I } = RA;
const $ = (id) => document.getElementById(id);
const SHOW = 6;
const P = { full: null, list: [], page: 0, more: false, all: { open: false, closed: false } };

const opened = () => P.list.filter((p) => p.state === "open");
const closed = () => P.list.filter((p) => p.state === "closed" && !p.merged_at);

function row(p) {
  const open = p.state === "open", head = p.head?.label || p.head?.ref || "", base = p.base?.ref || "";
  const fork = p.head?.repo && p.head.repo.full_name !== P.full;
  return `<div class="run"><span class="st ${open ? (p.draft ? "neutral" : "success") : "failure"}" title="${open ? (p.draft ? "Draft" : "Open") : "Closed without merging"}">${I.pr}</span>
    <div class="rb"><div class="t1" title="${esc(p.title)}"><span class="mono prn">#${p.number}</span> <b>${esc(p.title)}</b>${p.draft ? ' <span class="flag">draft</span>' : ""}${fork ? ' <span class="flag">fork</span>' : ""}</div>
      <div class="t2"><span class="chip tag" title="${esc(head)} into ${esc(base)}">${esc((fork ? head : p.head?.ref) || "?")} → ${esc(base)}</span><span>${p.user ? `@${esc(p.user.login)} · ` : ""}${open ? `opened ${RA.ago(p.created_at)}` : `closed ${RA.ago(p.closed_at)}`}</span></div></div>
    <div class="ra">${p.html_url && p.html_url !== "#" ? `<button type="button" class="ib" data-open="${esc(p.html_url)}" title="Open on GitHub">${I.ext}</button>` : ""}</div></div>`;
}
function column(kind, items, empty) {
  const showAll = P.all[kind], shown = showAll ? items : items.slice(0, SHOW);
  const head = kind === "open"
    ? `<span class="prbadge open">${I.pr}Open</span><span>Still waiting: review, merge or close them</span>`
    : `<span class="prbadge closed">${I.pr}Closed, not merged</span><span>Nothing to do: turned down or replaced</span>`;
  return `<div class="prcol ${kind}"><div class="prhead">${head}<b>${items.length}</b></div>
    <div class="runs">${shown.length ? shown.map(row).join("") : `<div class="empty">${empty}</div>`}</div>
    ${items.length > SHOW ? `<button type="button" class="link prall" data-prall="${kind}">${showAll ? "Show fewer" : `Show all ${items.length}`}</button>` : ""}</div>`;
}
function draw() {
  const box = $("dPrs"); if (!box) return;
  const o = opened(), c = closed(), merged = P.list.length - o.length - c.length;
  $("dPrSub").innerHTML = P.list.length
    ? `${P.more ? "from the newest " : ""}${P.list.length} pull request${P.list.length === 1 ? "" : "s"} · ${merged} merged${RA.S.sample ? "" : ` · <a href="https://github.com/${esc(P.full)}/pulls">all on GitHub</a>`}`
    : "";
  box.innerHTML = P.list.length
    ? `<div class="prsplit">${column("open", o, "No open pull requests. Everything was merged or closed.")}${column("closed", c, "Every closed pull request was merged.")}</div>
      ${P.more ? `<div class="prmore"><button type="button" class="btn" data-cmd="prsOlder">Load older pull requests</button></div>` : ""}`
    : `<div class="empty">No pull requests yet.</div>`;
}
// The first page is the same request the branch graph makes for its labels, so it usually comes from the cache
async function loadPage(full) {
  const page = P.page + 1;
  const { data } = await RA.gh(`/repos/${full}/pulls?state=all&per_page=100${page > 1 ? `&page=${page}` : ""}`);
  if (P.full !== full) return;
  P.page = page; P.list.push(...data); P.more = data.length === 100;
}
async function load(full) {
  if (RA.S.sample) { P.list = sample(); draw(); return; }
  try { await loadPage(full); if (RA.repoShown() === full) draw(); }
  catch (e) { if (RA.repoShown() === full && $("dPrs")) $("dPrs").innerHTML = `<div class="empty">Couldn't load pull requests. ${esc(RA.explain(e).replace(/<[^>]+>/g, ""))}</div>`; }
}
async function older() {
  const full = P.full; if (!full || !P.more) return;
  const b = document.querySelector('[data-cmd="prsOlder"]'); if (b) { b.disabled = true; b.textContent = "Loading…"; }
  try { await loadPage(full); } catch (e) { RA.toast("error", RA.explain(e)); }
  if (RA.repoShown() === full) draw();
}
function sample() {
  const d = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const pr = (number, title, ref, state, age, o = {}) => ({ number, title, state, draft: false, merged_at: null, created_at: d(age + 3), closed_at: state === "closed" ? d(age) : null,
    head: { ref, label: ref }, base: { ref: "main" }, user: { login: "sample-dev" }, html_url: "#", ...o });
  return [
    pr(14, "Dark mode for the settings page", "feature/dark-mode", "open", 1),
    pr(13, "Try a faster parser", "experiment/new-parser", "open", 4, { draft: true }),
    pr(12, "Fix the login timeout", "fix/login-timeout", "closed", 6, { merged_at: d(6) }),
    pr(11, "Rename the API helpers", "refactor-api", "closed", 9),
    pr(10, "Docs update", "docs-update", "open", 12, { user: { login: "helper-bot" } }),
    pr(9, "Old approach to caching", "cache-v1", "closed", 20),
    pr(8, "Release 1.2", "release/1.2", "closed", 25, { merged_at: d(25) }),
  ];
}

RA.onRepo((r) => {
  P.full = r.full_name; P.list = []; P.page = 0; P.more = false; P.all = { open: false, closed: false };
  const at = $("dReleases"); if (!at) return;
  at.insertAdjacentHTML("afterend", `<section class="panel" id="dPulls"><div class="ph"><h2>Unmerged pull requests</h2><span class="sub" id="dPrSub"></span></div>
    <div id="dPrs"><div class="empty">Loading…</div></div></section>`);
  load(r.full_name);
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-prall]"); if (!b) return;
  P.all[b.dataset.prall] = !P.all[b.dataset.prall]; draw();
});
RA.addCommands([{ id: "prsOlder", label: "Repository: Load Older Pull Requests", when: () => RA.isRepo() && P.more, run: older }]);
})();
