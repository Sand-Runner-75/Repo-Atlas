/* Inbox: your GitHub notifications, your pull requests and the ones waiting for your review, issues assigned to you, gists and stars */
(() => {
"use strict";
const RA = window.RA, { esc, I, store } = RA;
const $ = (id) => document.getElementById(id);
const MIN = 6e4;
const SECTIONS = [["notes", "Notifications"], ["prs", "Pull requests"], ["issues", "Issues"], ["gists", "Gists"], ["stars", "Stars"]];
const IB = { tab: store.get("ra.inboxTab") || "notes", data: {}, err: {}, busy: {}, starQ: "" };
const fullOf = (apiUrl) => (apiUrl || "").replace("https://api.github.com/repos/", "");
const htmlOf = (n) => {
  const s = n.subject || {}, full = n.repository?.full_name || "";
  if (!s.url) return `https://github.com/${full}${s.type === "CheckSuite" ? "/actions" : ""}`;
  if (s.type === "Release") return `https://github.com/${full}/releases`;
  return s.url.replace("https://api.github.com/repos/", "https://github.com/").replace("/pulls/", "/pull/").replace("/commits/", "/commit/");
};
const REASON = { review_requested: "review requested", mention: "mentioned you", team_mention: "mentioned your team", assign: "assigned to you", author: "you opened it", comment: "new comment", ci_activity: "Actions run", state_change: "state changed", subscribed: "watching", invitation: "invitation", security_alert: "security alert", manual: "subscribed", approval_requested: "approval requested" };
const TYPEICON = { PullRequest: I.pr, Issue: I.issue, Release: I.tag, Commit: I.commit, CheckSuite: I.actions, Discussion: I.mail, RepositoryInvitation: I.mail };
const noToken = () => `<div class="empty">Your inbox needs a GitHub token.<br><button type="button" class="btn" data-cmd="tokenbox" style="margin-top:8px">${I.key}Add GitHub token</button></div>`;
const classicOnly = (what) => `${what} only work with a classic token. In Settings, follow the <b>classic token</b> link to make one with every scope Repo Atlas uses.`;

/* ---------------- Loading ---------------- */
const search = async (q) => (await RA.gh(`/search/issues?q=${encodeURIComponent(q + " archived:false")}&sort=updated&order=desc&per_page=30`, { fresh: true })).data.items || [];
const LOAD = {
  notes: async () => (await RA.gh("/notifications?per_page=50", { fresh: true })).data,
  prs: async () => { const [mine, review] = await Promise.all([search("is:open is:pr author:@me"), search("is:open is:pr review-requested:@me")]); return { mine, review }; },
  issues: () => search("is:open is:issue assignee:@me"),
  gists: async () => (await RA.gh("/gists?per_page=50", { fresh: true })).data,
  stars: async () => { const out = []; for (let p = 1; p <= 3; p++) { const { data } = await RA.gh(`/user/starred?per_page=100&page=${p}`, { fresh: true }); out.push(...data); if (data.length < 100) break; } return out; },
};
async function load(key, quiet) {
  if (!RA.S.token || IB.busy[key]) return;
  IB.busy[key] = true; if (!quiet) render();
  try { IB.data[key] = await LOAD[key](); delete IB.err[key]; }
  catch (e) {
    IB.err[key] = (e.status === 403 || e.status === 404) && !e.reset
      ? (key === "notes" ? classicOnly("GitHub notifications") : key === "gists" ? classicOnly("Gists") : "This token isn't allowed to read this.")
      : RA.explain(e);
  }
  IB.busy[key] = false;
  render(); badge();
}

/* ---------------- Page ---------------- */
function count(key) {
  const d = IB.data[key]; if (!d) return "";
  if (key === "prs") return d.mine.length + d.review.length;
  if (key === "notes") return d.filter((n) => n.unread).length;
  return d.length;
}
function render() {
  const page = $("inboxPage"); if (!page || $("v-inbox").hidden) return;
  const key = IB.tab;
  let body;
  if (!RA.S.token) body = noToken();
  else if (IB.err[key]) body = `<div class="empty">${IB.err[key]}</div>`;
  else if (!IB.data[key]) body = `<div class="empty">Loading…</div>`;
  else body = VIEW[key](IB.data[key]);
  page.innerHTML = `<div class="ihead"><h1 class="vtitle">Inbox</h1>
      <div class="seg" role="tablist" aria-label="Inbox sections">${SECTIONS.map(([k, l]) => `<button type="button" data-ibtab="${k}" aria-pressed="${k === key}">${l}${count(k) !== "" ? ` <b>${count(k)}</b>` : ""}</button>`).join("")}</div>
      <span class="phacts">${ACTS[key] ? ACTS[key]() : ""}<button type="button" class="ib" data-ibrefresh title="Refresh">${I.rerun}</button></span></div>
    <section class="panel">${body}</section>`;
  if (RA.S.token && !IB.data[key] && !IB.err[key] && !IB.busy[key]) load(key);
}
const ACTS = {
  notes: () => IB.data.notes?.some((n) => n.unread) ? `<button type="button" class="btn" data-cmd="markAllRead">${I.check}Mark all as read</button>` : "",
  issues: () => `<button type="button" class="btn" data-cmd="newIssue">${I.plus}New issue</button>`,
  gists: () => `<button type="button" class="btn" data-cmd="newGist">${I.plus}New gist</button>`,
};
const item = (icon, cls, main, sub, acts, attrs = "") => `<div class="run"${attrs}><span class="st ${cls}">${icon}</span><div class="rb"><div class="t1">${main}</div><div class="t2">${sub}</div></div><div class="ra">${acts}</div></div>`;
const openBtn = (url) => `<button type="button" class="ib" data-open="${esc(url)}" title="Open on GitHub">${I.ext}</button>`;
const prRow = (x, review) => {
  const full = fullOf(x.repository_url);
  return item(I.pr, x.draft ? "neutral" : "success", `<b>${esc(x.title)}</b>`,
    `<span class="mono">${esc(full)}#${x.number}</span><span>${review ? `by @${esc(x.user?.login || "")}` : x.draft ? "draft" : "open"}</span><span>updated ${RA.ago(x.updated_at)}</span>${x.comments ? `<span>${x.comments} comment${x.comments === 1 ? "" : "s"}</span>` : ""}`,
    `${review ? `<button type="button" class="btn primary" data-review="${esc(full)}#${x.number}">${I.check}Review…</button>` : `<button type="button" class="btn" data-merge="${esc(full)}#${x.number}">Merge…</button>`}${openBtn(x.html_url)}`);
};
const VIEW = {
  notes: (list) => list.length ? list.map((n) => item(TYPEICON[n.subject?.type] || I.bell, n.unread ? "active" : "neutral",
    `${n.unread ? "<b>" : ""}${esc(n.subject?.title || "")}${n.unread ? "</b>" : ""}`,
    `<span class="mono">${esc(n.repository?.full_name || "")}</span><span>${esc(REASON[n.reason] || n.reason)}</span><span>${RA.ago(n.updated_at)}</span>`,
    `${n.unread ? `<button type="button" class="btn" data-ndone="${esc(n.id)}" title="Mark as read">${I.check}Done</button>` : ""}<button type="button" class="ib" data-nopen="${esc(n.id)}" title="Open on GitHub and mark as read">${I.ext}</button>`)).join("")
    : `<div class="empty">You're all caught up. New GitHub notifications show up here.</div>`,
  prs: (d) => `<div class="sublabel">Waiting for your review</div>${d.review.length ? d.review.map((x) => prRow(x, true)).join("") : `<div class="empty">No pull requests are waiting for your review.</div>`}
    <div class="sublabel" style="margin-top:14px">Opened by you</div>${d.mine.length ? d.mine.map((x) => prRow(x, false)).join("") : `<div class="empty">You have no open pull requests.</div>`}`,
  issues: (list) => list.length ? list.map((x) => { const full = fullOf(x.repository_url); return item(I.issue, "success", `<b>${esc(x.title)}</b>`,
    `<span class="mono">${esc(full)}#${x.number}</span>${(x.labels || []).slice(0, 4).map((l) => `<span class="chip tag">${esc(l.name)}</span>`).join("")}<span>updated ${RA.ago(x.updated_at)}</span>`,
    `<button type="button" class="btn" data-iclose="${esc(full)}#${x.number}">${I.check}Close</button>${openBtn(x.html_url)}`); }).join("")
    : `<div class="empty">No open issues are assigned to you.</div>`,
  gists: (list) => list.length ? list.map((g) => { const files = Object.keys(g.files || {}); return item(I.copy, g.public ? "success" : "neutral", `<b>${esc(g.description || files[0] || "Untitled gist")}</b>`,
    `<span class="mono">${esc(files.slice(0, 3).join(", "))}${files.length > 3 ? ` +${files.length - 3}` : ""}</span><span>${g.public ? "public" : "secret"}</span><span>updated ${RA.ago(g.updated_at)}</span>`,
    `<button type="button" class="btn" data-copy="${esc(g.html_url)}">${I.link}Copy link</button>${openBtn(g.html_url)}`); }).join("")
    : `<div class="empty">You haven't made any gists yet. <b>New gist</b> shares a snippet of code with a link.</div>`,
  stars: (list) => {
    const q = IB.starQ.toLowerCase(), shown = list.filter((r) => !q || `${r.full_name} ${r.description || ""} ${r.language || ""}`.toLowerCase().includes(q));
    return `<label class="input" style="max-width:360px"><svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg><input id="starQ" placeholder="Filter your ${list.length} stars" value="${esc(IB.starQ)}" spellcheck="false"></label>`
      + (shown.length ? shown.slice(0, 150).map((r) => item(`<i class="dot" style="background:${RA.langColor(r.language)}"></i>`, "neutral", `<button type="button" class="link" data-fopen="${esc(r.full_name)}" title="Open in Repo Atlas"><b>${esc(r.full_name)}</b></button>`,
        `<span>${esc(r.description || "")}</span><span>★ ${RA.fmt(r.stargazers_count)}</span>${r.language ? `<span>${esc(r.language)}</span>` : ""}`,
        `<button type="button" class="btn" data-unstar="${esc(r.full_name)}">Unstar</button>${openBtn(r.html_url)}`)).join("")
        : `<div class="empty">${list.length ? "No stars match." : "You haven't starred any repositories."}</div>`);
  },
};
const show = () => RA.openPage("inbox");
RA.addPage("inbox", { label: "Inbox", icon: '<svg viewBox="0 0 24 24"><path d="M3.5 13.5 6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-5.5Z"/><path d="M3.5 13.5H8.5l1.5 2.5h4l1.5-2.5h5"/></svg>', render });

/* ---------------- Actions ---------------- */
const split = (ref) => { const [full, n] = ref.split("#"); return { full, n: +n }; };
const deny = (e, what) => RA.toast("error", (e.status === 403 || e.status === 404) && !e.reset ? `This token isn't allowed to ${what}. A classic token with the repo scope is (see Settings).` : e.status === 422 || e.status === 405 || e.status === 409 ? `GitHub said no: ${esc(e.message || "it can't be done right now")}.` : RA.explain(e));
async function markRead(id) {
  const n = IB.data.notes?.find((x) => x.id === id); if (!n) return;
  try { await RA.gh(`/notifications/threads/${id}`, { method: "PATCH" }); n.unread = false; }
  catch (e) { deny(e, "change notifications"); }
  render(); badge();
}
async function markAllRead() {
  try { await RA.gh("/notifications", { method: "PUT", body: JSON.stringify({ last_read_at: new Date().toISOString() }) }); (IB.data.notes || []).forEach((n) => n.unread = false); RA.toast("info", "All notifications marked as read.", 3000); }
  catch (e) { deny(e, "change notifications"); }
  render(); badge();
}
async function closeIssue(ref, reopen) {
  const { full, n } = split(ref);
  try {
    await RA.gh(`/repos/${full}/issues/${n}`, { method: "PATCH", body: JSON.stringify(reopen ? { state: "open" } : { state: "closed", state_reason: "completed" }) });
    if (reopen) { RA.toast("info", `Reopened ${esc(full)}#${n}.`, 3000); load("issues", true); return; }
    IB.data.issues = (IB.data.issues || []).filter((x) => !(fullOf(x.repository_url) === full && x.number === n));
    RA.toast("info", `Closed <span class="mono">${esc(full)}#${n}</span>. <button type="button" class="link" data-ireopen="${esc(ref)}">Undo</button>`, 8000);
  } catch (e) { deny(e, "change this issue"); }
  render();
}
async function reviewDialog(ref) {
  const { full, n } = split(ref);
  const x = IB.data.prs?.review.find((p) => fullOf(p.repository_url) === full && p.number === n);
  AtlasShare.modal(`${AtlasShare.head(`Review ${full}#${n}`)}
    <p>${esc(x?.title || "")}</p>
    <form class="form" id="rvForm"><label><span><b>Comment</b> (optional for Approve)</span><textarea id="rvBody" rows="5" placeholder="Looks good to me"></textarea></label>
      <div class="acts"><button type="submit" class="btn primary" data-ev="APPROVE">${I.check}Approve</button><button type="submit" class="btn" data-ev="REQUEST_CHANGES">Request changes</button><button type="submit" class="btn" data-ev="COMMENT">Comment</button>${x ? `<button type="button" class="btn" data-open="${esc(x.html_url + "/files")}">${I.ext}See the changes</button>` : ""}</div></form>`);
  $("rvForm").onsubmit = async (e) => {
    e.preventDefault();
    const ev = e.submitter?.dataset.ev || "APPROVE", body = $("rvBody").value.trim();
    if (ev !== "APPROVE" && !body) { RA.toast("warn", "Write a comment first, so the author knows what to change."); $("rvBody").focus(); return; }
    try {
      await RA.gh(`/repos/${full}/pulls/${n}/reviews`, { method: "POST", body: JSON.stringify({ event: ev, ...(body ? { body } : {}) }) });
      AtlasShare.closeModal();
      RA.toast("info", { APPROVE: "Approved", REQUEST_CHANGES: "Asked for changes on", COMMENT: "Commented on" }[ev] + ` <span class="mono">${esc(full)}#${n}</span>.`, 4000);
      load("prs", true);
    } catch (err) { deny(err, "review pull requests here"); }
  };
}
async function mergeDialog(ref) {
  const { full, n } = split(ref);
  RA.busyStart("Checking the pull request…");
  let pr, checks = null;
  try {
    pr = (await RA.gh(`/repos/${full}/pulls/${n}`, { fresh: true })).data;
    try { checks = (await RA.gh(`/repos/${full}/commits/${pr.head.sha}/check-runs?per_page=100`, { fresh: true })).data.check_runs; } catch {}
  } catch (e) { RA.toast("error", RA.explain(e)); return; }
  finally { RA.busyEnd(); }
  const failed = checks?.filter((c) => /^(failure|timed_out|cancelled|action_required)$/.test(c.conclusion)).length || 0;
  const running = checks?.filter((c) => c.status !== "completed").length || 0;
  const passed = checks ? checks.length - failed - running : 0;
  const st = pr.mergeable === false ? ["bad", "It has merge conflicts. Resolve them on GitHub first."]
    : pr.draft ? ["warn", "It's still a draft. Mark it ready for review on GitHub first."]
    : failed ? ["warn", `${failed} check${failed === 1 ? "" : "s"} failed.`]
    : running ? ["warn", `${running} check${running === 1 ? " is" : "s are"} still running.`]
    : pr.mergeable_state === "blocked" ? ["warn", "Branch protection is blocking it (it may need an approving review)."]
    : ["ok", checks?.length ? `All ${passed} checks passed.` : "Ready to merge."];
  AtlasShare.modal(`${AtlasShare.head(`Merge ${full}#${n}`)}
    <p><b>${esc(pr.title)}</b><br><span class="mono">${esc(pr.head.ref)}</span> into <span class="mono">${esc(pr.base.ref)}</span> · ${pr.commits} commit${pr.commits === 1 ? "" : "s"} · ${pr.changed_files} file${pr.changed_files === 1 ? "" : "s"}</p>
    <div class="tstate ${st[0] === "ok" ? "ok" : "bad"}"><i class="led"></i>${esc(st[1])}</div>
    <form class="form" id="mgForm"><label><span><b>How to merge</b></span><select id="mgHow"><option value="merge">Create a merge commit</option><option value="squash">Squash into one commit</option><option value="rebase">Rebase</option></select></label>
      <div class="acts"><button type="submit" class="btn primary"${pr.mergeable === false || pr.draft ? " disabled" : ""}>Merge pull request</button><button type="button" class="btn" data-mclose>Cancel</button></div></form>`);
  $("mgForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter; if (btn) btn.disabled = true;
    try {
      await RA.gh(`/repos/${full}/pulls/${n}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: $("mgHow").value, sha: pr.head.sha }) });
      AtlasShare.closeModal(); RA.toast("info", `Merged <span class="mono">${esc(full)}#${n}</span>.`, 4000); load("prs", true);
    } catch (err) { if (btn) btn.disabled = false; deny(err, "merge here"); }
  };
}
function newIssue(full) {
  const r = RA.curRepo();
  full = full || (r && !RA.S.sample ? r.full_name : "");
  if (!RA.S.token) return RA.toast("info", "Opening an issue needs a GitHub token. Add one in Settings (Ctrl+,).");
  const options = [...new Set([...(RA.S.sample ? [] : RA.S.repos.map((x) => x.full_name)), ...(IB.data.stars || []).map((x) => x.full_name)])].slice(0, 300);
  AtlasShare.modal(`${AtlasShare.head("New issue")}
    <form class="form" id="niForm" autocomplete="off">
      <label><span><b>Repository</b> · owner/repo</span><span class="input"><input id="niRepo" list="niRepos" value="${esc(full)}" spellcheck="false" required></span></label>
      <datalist id="niRepos">${options.map((o) => `<option value="${esc(o)}">`).join("")}</datalist>
      <label><span><b>Title</b></span><span class="input"><input id="niTitle" required></span></label>
      <label><span><b>Description</b> · Markdown works</span><textarea id="niBody" rows="7"></textarea></label>
      <div class="acts"><button type="submit" class="btn primary">${I.issue}Open issue</button><button type="button" class="btn" data-mclose>Cancel</button></div></form>`);
  (full ? $("niTitle") : $("niRepo")).focus();
  $("niForm").onsubmit = async (e) => {
    e.preventDefault();
    const repo = $("niRepo").value.trim().replace(/^https?:\/\/github\.com\//i, ""), title = $("niTitle").value.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { RA.toast("warn", "Type the repository as owner/repo."); $("niRepo").focus(); return; }
    try {
      const { data } = await RA.gh(`/repos/${repo}/issues`, { method: "POST", body: JSON.stringify({ title, body: $("niBody").value }) });
      AtlasShare.closeModal();
      RA.toast("info", `Opened <span class="mono">${esc(repo)}#${data.number}</span>. <button type="button" class="link" data-open="${esc(data.html_url)}">See it on GitHub</button>`, 8000);
      if (IB.data.issues) load("issues", true);
    } catch (err) { err.status === 410 ? RA.toast("error", "Issues are turned off in that repository.") : deny(err, "open issues there"); }
  };
}
function newGist() {
  if (!RA.S.token) return RA.toast("info", "Making a gist needs a GitHub token. Add one in Settings (Ctrl+,).");
  AtlasShare.modal(`${AtlasShare.head("New gist")}
    <form class="form" id="ngForm" autocomplete="off">
      <label><span><b>Description</b></span><span class="input"><input id="ngDesc" placeholder="What is it?"></span></label>
      <label><span><b>File name</b> · the extension sets the highlighting</span><span class="input"><input id="ngName" placeholder="snippet.js" required spellcheck="false"></span></label>
      <label><span><b>Content</b></span><textarea id="ngBody" rows="10" class="mono" required spellcheck="false"></textarea></label>
      <label class="cb"><input type="checkbox" id="ngPublic"> Public (anyone can find it; otherwise only people with the link)</label>
      <div class="acts"><button type="submit" class="btn primary">${I.plus}Create gist</button><button type="button" class="btn" data-mclose>Cancel</button></div></form>`);
  $("ngDesc").focus();
  $("ngForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await RA.gh("/gists", { method: "POST", body: JSON.stringify({ description: $("ngDesc").value, public: $("ngPublic").checked, files: { [$("ngName").value.trim()]: { content: $("ngBody").value } } }) });
      AtlasShare.closeModal();
      RA.copyText(data.html_url);
      if (IB.data.gists) IB.data.gists.unshift(data);
      render();
    } catch (err) { (err.status === 403 || err.status === 404) && !err.reset ? RA.toast("error", classicOnly("Gists")) : deny(err, "make gists"); }
  };
}
async function setStar(full, on) {
  try {
    await RA.gh(`/user/starred/${full}`, { method: on ? "PUT" : "DELETE" });
    if (!on && IB.data.stars) IB.data.stars = IB.data.stars.filter((r) => r.full_name !== full);
    if (on && IB.data.stars) delete IB.data.stars;
    render();
    return true;
  } catch (e) { deny(e, on ? "star repositories" : "unstar repositories"); return false; }
}

$("inboxPage").addEventListener("click", (e) => {
  const t = e.target.closest("[data-ibtab]"); if (t) { IB.tab = t.dataset.ibtab; store.set("ra.inboxTab", IB.tab); render(); return; }
  if (e.target.closest("[data-ibrefresh]")) { delete IB.data[IB.tab]; delete IB.err[IB.tab]; load(IB.tab); return; }
  const d = e.target.closest("[data-ndone]"); if (d) { d.disabled = true; markRead(d.dataset.ndone); return; }
  const o = e.target.closest("[data-nopen]"); if (o) { const n = IB.data.notes?.find((x) => x.id === o.dataset.nopen); if (n) { RA.openExternal(htmlOf(n)); if (n.unread) markRead(n.id); } return; }
  const c = e.target.closest("[data-iclose]"); if (c) { c.disabled = true; closeIssue(c.dataset.iclose); return; }
  const rv = e.target.closest("[data-review]"); if (rv) { reviewDialog(rv.dataset.review); return; }
  const mg = e.target.closest("[data-merge]"); if (mg) { mergeDialog(mg.dataset.merge); return; }
  const us = e.target.closest("[data-unstar]"); if (us) { us.disabled = true; setStar(us.dataset.unstar, false); }
});
$("inboxPage").addEventListener("input", (e) => {
  if (e.target.id !== "starQ") return;
  IB.starQ = e.target.value; const pos = e.target.selectionStart;
  render(); const q = $("starQ"); q.focus(); q.setSelectionRange(pos, pos);
});
document.addEventListener("click", (e) => { const r = e.target.closest("[data-ireopen]"); if (r) { r.disabled = true; closeIssue(r.dataset.ireopen, true); } });

/* ---------------- Badge and background check ---------------- */
function badge() {
  const n = (IB.data.notes || []).filter((x) => x.unread).length + (IB.data.prs?.review.length || 0);
  const b = $("inboxBadge"); b.hidden = !n; b.textContent = n > 99 ? "99+" : n;
  $("actInbox").title = `Inbox: notifications, pull requests, issues${n ? ` (${n} new)` : ""} (Ctrl+Shift+M)`;
}
// New GitHub notifications and review requests are announced like updates from followed repositories
async function poll() {
  if (!RA.S.token) return;
  const before = new Set(store.json("ra.ghSeen", []));
  const first = !store.get("ra.ghSeen");
  await Promise.all([load("notes", true), load("prs", true)]);
  const fresh = [
    ...(IB.data.notes || []).filter((n) => n.unread).map((n) => ({ id: "n" + n.id + n.updated_at, title: n.repository?.full_name || "GitHub", text: `${REASON[n.reason] || n.reason}: ${n.subject?.title || ""}` })),
    ...(IB.data.prs?.review || []).map((x) => ({ id: "r" + x.id, title: fullOf(x.repository_url), text: `Review requested: ${x.title}` })),
  ];
  store.set("ra.ghSeen", JSON.stringify(fresh.map((f) => f.id).slice(0, 300)));
  const news = first ? [] : fresh.filter((f) => !before.has(f.id));
  if (!news.length || store.json("ra.notify", {}).gh === false) return;
  if (news.length === 1) AtlasFollow.tell(news[0].title, news[0].text);
  else AtlasFollow.tell(`${news.length} new on GitHub`, news.slice(0, 3).map((f) => `${f.title}: ${f.text}`).join("\n"));
}
let lastPoll = 0;
setInterval(() => { if (Date.now() - lastPoll >= AtlasFollow.everyMs()) { lastPoll = Date.now(); poll(); } }, MIN);
setTimeout(() => { lastPoll = Date.now(); poll(); }, 8000);

const ghBox = $("ghOn");
if (ghBox) { ghBox.checked = store.json("ra.notify", {}).gh !== false; ghBox.onchange = () => store.set("ra.notify", JSON.stringify({ ...store.json("ra.notify", {}), gh: ghBox.checked })); }

RA.addCommands([
  { id: "inbox", label: "View: Show Inbox", keys: ["Ctrl", "Shift", "M"], run: show },
  { id: "markAllRead", label: "Inbox: Mark All Notifications as Read", when: () => !!RA.S.token, run: markAllRead },
  { id: "newIssue", label: "Issues: New Issue…", run: () => newIssue() },
  { id: "newGist", label: "Gists: New Gist…", run: newGist },
  { id: "myPrs", label: "Inbox: Show My Pull Requests", run: () => { IB.tab = "prs"; show(); } },
  { id: "myIssues", label: "Inbox: Show Issues Assigned to Me", run: () => { IB.tab = "issues"; show(); } },
  { id: "myStars", label: "Inbox: Show My Stars", run: () => { IB.tab = "stars"; show(); } },
]);
window.AtlasInbox = { newIssue, setStar, poll };
})();
