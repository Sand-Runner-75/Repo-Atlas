/* Compare: the loaded account side by side with another one, scored row by row */
(() => {
"use strict";
const RA = window.RA, { esc, fmt, I } = RA;
const $ = (id) => document.getElementById(id);
const C = { a: null, b: null, loading: null };
const FAMOUS = [
  { login: "torvalds", note: "Linus Torvalds · Linux" }, { login: "gaearon", note: "Dan Abramov · React" },
  { login: "sindresorhus", note: "Sindre Sorhus · 1,000+ packages" }, { login: "yyx990803", note: "Evan You · Vue" },
  { login: "karpathy", note: "Andrej Karpathy · AI" }, { login: "microsoft", note: "organization" },
];

async function fetchAccount(login) {
  const { data: user } = await RA.gh(`/users/${encodeURIComponent(login)}`);
  const path = user.type === "Organization" ? `/orgs/${user.login}/repos?type=all&sort=pushed` : `/users/${user.login}/repos?type=owner&sort=pushed`;
  const repos = await RA.paged(path, (p, n) => RA.busy(`Loading @${esc(user.login)}… ${n} repositories`));
  let days = null, source = "events";
  if (RA.S.token && user.type === "User") { try { days = await RA.contributionCalendar(user.login); source = "calendar"; } catch {} }
  if (!days) {
    const events = [];
    for (let p = 1; p <= 3; p++) { try { const { data } = await RA.gh(`/users/${user.login}/events/public?per_page=100&page=${p}`); events.push(...data); if (data.length < 100) break; } catch { break; } }
    days = RA.eventsToDays(events);
  }
  return AtlasBadge.atlasStats(user, repos, days, source);
}
function snapshotA() { const S = RA.S; return AtlasBadge.atlasStats(S.user, S.repos, S.days, S.daysSource); }

async function compareWith(login) {
  const S = RA.S;
  if (!S.user || S.sample) { RA.toast("info", "Load an account first (Ctrl+O), then compare it with another."); return; }
  if (login.toLowerCase() === S.user.login.toLowerCase()) { RA.toast("info", "Pick a different account to compare with."); return; }
  C.a = snapshotA(); C.b = null; C.loading = login;
  RA.openCompare();
  RA.busyStart(`Loading @${esc(login)}…`);
  try { C.b = await fetchAccount(login); }
  catch (e) { C.loading = null; RA.toast("error", RA.explain(e, login)); RA.busyEnd(); render(); return; }
  C.loading = null; RA.busyEnd();
  RA.renderTabs(); render(); RA.syncUrl();
}
function ask() {
  if (!RA.S.user || RA.S.sample) { RA.toast("info", "Load an account first (Ctrl+O), then compare it with another."); return; }
  RA.palette("ask", "", { placeholder: `Compare @${RA.S.user.login} with… (a username or organization)`, msg: "Press Enter to compare. Or pick a famous account:", verb: "Compare with", suggest: FAMOUS, go: compareWith });
}

function who(s, side) {
  return `<div class="vs-who ${side}">${s.avatar ? `<img class="avatar" src="${esc(s.avatar)}${s.avatar.includes("?") ? "&" : "?"}s=112" alt="">` : `<div class="avatar">${esc(s.name[0].toUpperCase())}</div>`}
    <div style="min-width:0"><h2>${esc(s.name)}</h2><div class="t">${esc(s.title)}</div><div class="login"><a href="https://github.com/${esc(s.login)}">@${esc(s.login)}</a></div></div></div>`;
}
function render() {
  const page = $("comparePage"); if (!page) return;
  const { a, b } = C;
  if (!a) { page.innerHTML = `<div class="empty">Load an account, then choose <b>Compare</b> to put it side by side with another.</div>`; return; }
  if (!b) {
    page.innerHTML = `<div class="vs-head">${who(a, "a")}<div class="vs-mid"><div class="vs">vs</div></div><div class="empty">${C.loading ? `Loading @${esc(C.loading)}…` : "Pick someone to compare with."}</div></div>
      ${C.loading ? "" : `<div class="vs-acts"><button type="button" class="btn primary" data-cmd="compare">${I.versus}Choose an account</button></div>`}`;
    return;
  }
  const rows = AtlasShare.duelRows(a, b), sa = rows.filter((r) => r.win === "a").length, sb = rows.filter((r) => r.win === "b").length;
  const verdict = sa === sb ? "It's a tie." : `${esc((sa > sb ? a : b).name)} wins ${Math.max(sa, sb)} of ${rows.length} rounds.`;
  const shared = a.langs.filter((l) => b.langs.some((m) => m.name === l.name)).map((l) => l.name);
  const langList = (s) => s.langs.map((l) => `<span><i class="dot" style="background:${l.color}"></i>${shared.includes(l.name) ? `<b>${esc(l.name)}</b>` : esc(l.name)} ${Math.round(l.share * 100)}%</span>`).join("");
  page.innerHTML = `<div class="vs-head">${who(a, "a")}<div class="vs-mid"><div class="score">${sa} – ${sb}</div><div class="vs">vs</div></div>${who(b, "b")}</div>
    <p style="margin:0;text-align:center;color:var(--muted)">${verdict}${a.contribLabel !== b.contribLabel ? " Activity is measured differently for the two accounts, so read that row loosely." : ""}</p>
    <section class="panel"><div class="duel">${rows.map((r) => {
      const max = Math.max(r.a, r.b) || 1;
      return `<div class="dr"><span class="v a${r.win === "a" ? " win" : ""}">${r.fmt(r.a)}</span><span class="trk a"><i class="${r.win === "a" ? "win" : ""}" style="width:${r.a / max * 100}%"></i></span>
        <span class="lbl">${esc(r.label)}</span><span class="trk"><i class="${r.win === "b" ? "win" : ""}" style="width:${r.b / max * 100}%"></i></span><span class="v${r.win === "b" ? " win" : ""}">${r.fmt(r.b)}</span></div>`;
    }).join("")}</div></section>
    <div class="grid">
      <section class="panel c6"><div class="ph"><h2>${esc(a.name)}'s languages</h2></div><div class="legend">${langList(a) || "None"}</div>${a.top ? `<div class="sub" style="color:var(--muted)">Most starred: <b>${esc(a.top.name)}</b> ★ ${fmt(a.top.stars)}</div>` : ""}</section>
      <section class="panel c6"><div class="ph"><h2>${esc(b.name)}'s languages</h2></div><div class="legend">${langList(b) || "None"}</div>${b.top ? `<div class="sub" style="color:var(--muted)">Most starred: <b>${esc(b.top.name)}</b> ★ ${fmt(b.top.stars)}</div>` : ""}</section>
    </div>
    ${shared.length ? `<p style="margin:0;text-align:center;color:var(--muted)">Both write <b>${shared.map(esc).join(", ")}</b>.</p>` : ""}
    <div class="vs-acts"><button type="button" class="btn primary" id="vsShare">${I.share}Share this matchup</button>
      <button type="button" class="btn" data-cmd="compare">${I.versus}Compare with someone else</button>
      <button type="button" class="btn" data-load="${esc(b.login)}">Open @${esc(b.login)}</button></div>`;
  $("vsShare").onclick = shareMatchup;
}
async function shareMatchup() {
  const { a, b } = C; if (!a || !b) return;
  const link = RA.linkFor({ user: a.login, vs: b.login });
  RA.busyStart("Drawing the matchup…");
  let canvas; try { canvas = await AtlasShare.compareCard(a, b, link); } finally { RA.busyEnd(); }
  const blob = await AtlasShare.toBlob(canvas);
  const rows = AtlasShare.duelRows(a, b), sa = rows.filter((r) => r.win === "a").length, sb = rows.filter((r) => r.win === "b").length;
  AtlasShare.openShareModal("Share this matchup", canvas, blob, `repo-atlas-${a.login}-vs-${b.login}.png`,
    `@${a.login} vs @${b.login} on GitHub: ${sa}–${sb}. Who would win against you?`, link);
}

RA.addCommands([{ id: "compare", label: "Account: Compare With Another Account…", run: ask }]);
window.AtlasCompare = {
  render, open: compareWith,
  other: () => C.b?.login || null,
  label: () => C.a && (C.b || C.loading) ? `@${C.a.login} vs @${C.b?.login || C.loading}` : "Compare",
};
})();
