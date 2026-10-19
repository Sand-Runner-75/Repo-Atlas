/* Following: repositories to keep an eye on, checked in the background, with Windows notifications. Pending invitations live here too. */
(() => {
"use strict";
const RA = window.RA, { esc, I, store } = RA;
const $ = (id) => document.getElementById(id);
const T = window.__TAURI__;
const MIN = 6e4;

const KINDS = [
  { k: "release", label: "New releases", note: "When a new version is published." },
  { k: "commit", label: "New commits", note: "Pushed to the default branch." },
  { k: "issue", label: "New issues and pull requests", note: "Opened by anyone." },
  { k: "run", label: "Failed Actions runs", note: "When a workflow run fails." },
];
const ICON = { release: I.tag, commit: I.commit, issue: I.issue, pr: I.pr, run: I.actions, invite: I.mail };

/* ---------------- Saved state ---------------- */
// ra.follow: [{ full, branch, kinds: {release, commit, issue, run}, seen: {...}, added }]; ra.updates: newest first
const follows = () => store.json("ra.follow", []);
const saveFollows = (list) => store.set("ra.follow", JSON.stringify(list));
const updates = () => store.json("ra.updates", []);
const saveUpdates = (list) => store.set("ra.updates", JSON.stringify(list.slice(0, 150)));
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const findFollow = (full) => follows().find((f) => same(f.full, full));
const prefs = () => ({ every: 15, notify: true, tray: true, ...store.json("ra.notify", {}) });
const setPrefs = (p) => store.set("ra.notify", JSON.stringify({ ...prefs(), ...p }));
// Without a token GitHub allows 60 requests an hour, so checks slow down to hourly
const everyMs = () => Math.max(prefs().every, RA.S.token ? 0 : 60) * MIN;

/* ---------------- Notifications ---------------- */
// Desktop: Windows toast notifications through Tauri. Web: the browser's own notifications, if the page is allowed to.
async function allowed(ask) {
  try {
    if (RA.desktop) {
      if (await T.core.invoke("plugin:notification|is_permission_granted")) return true;
      return ask && (await T.core.invoke("plugin:notification|request_permission")) === "granted";
    }
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    return ask && Notification.permission === "default" && (await Notification.requestPermission()) === "granted";
  } catch (e) { console.error(e); return false; }
}
async function osNotify(title, body) {
  if (!(await allowed(false))) return false;
  try {
    if (RA.desktop) {
      if (T.notification?.sendNotification) T.notification.sendNotification({ title, body });
      else await T.core.invoke("plugin:notification|notify", { options: { title, body } });
    } else new Notification(title, { body, icon: "icon.png" });
    return true;
  } catch (e) { console.error(e); return false; }
}
// While you're looking at the app a small in-app message is enough; otherwise it's a Windows notification
async function tell(title, body) {
  const looking = document.visibilityState === "visible" && document.hasFocus();
  if (!looking && prefs().notify && (await osNotify(title, body))) return;
  RA.toast("info", `<b>${esc(title)}</b><br>${esc(body)}`, 9000);
}

/* ---------------- Following and unfollowing ---------------- */
async function repoInfo(full) {
  const [o, n] = full.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").split("/");
  if (!o || !n) throw new Error("bad name");
  return (await RA.gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(n)}`)).data;
}
function openOptions(full, info) {
  const f = findFollow(full);
  const kinds = f?.kinds || { release: true };
  AtlasShare.modal(`${AtlasShare.head(f ? `Following ${full}` : `Follow ${full}`)}
    <p>Repo Atlas checks it ${RA.S.token ? `every ${prefs().every === 60 ? "hour" : prefs().every + " minutes"}` : "once an hour (add a token to check more often)"} and tells you about:</p>
    <div class="checks">${KINDS.map((x) => `<label><input type="checkbox" data-k="${x.k}"${kinds[x.k] ? " checked" : ""}><div><b>${x.label}</b><span>${x.k === "commit" && f?.branch ? `Pushed to ${esc(f.branch)}.` : x.note}</span></div></label>`).join("")}</div>
    <div class="acts"><button type="button" class="btn primary" id="fSave">${I.bell}${f ? "Save" : "Follow"}</button>
      ${f ? `<button type="button" class="btn danger" id="fUnfollow">Unfollow</button>` : `<button type="button" class="btn" data-mclose>Cancel</button>`}</div>`);
  $("fSave").onclick = async () => {
    const k = {}; $("modal").querySelectorAll("[data-k]").forEach((c) => k[c.dataset.k] = c.checked);
    if (!Object.values(k).some(Boolean)) { RA.toast("warn", "Pick at least one thing to hear about, or choose Unfollow."); return; }
    AtlasShare.closeModal();
    if (f) { saveFollows(follows().map((x) => same(x.full, full) ? { ...x, kinds: k } : x)); RA.toast("info", `Saved. You'll hear about ${hearAbout(k)} in ${esc(full)}.`); after(); check([findFollow(full)], true, true); }
    else follow(full, k, info);
  };
  if (f) $("fUnfollow").onclick = () => { AtlasShare.closeModal(); unfollow(full); };
}
const hearAbout = (k) => {
  const w = KINDS.filter((x) => k[x.k]).map((x) => x.label.toLowerCase().replace("actions", "Actions"));
  return w.length > 1 ? w.slice(0, -1).join(", ") + " and " + w[w.length - 1] : w[0];
};
async function follow(full, kinds, info) {
  if (findFollow(full)) { openOptions(findFollow(full).full); return; }
  let r = info;
  if (!r) {
    try { r = await repoInfo(full); }
    catch (e) { RA.toast("error", e.status === 404 || e.message === "bad name" ? `Can't find the repository <span class="mono">${esc(full)}</span>. Type it as owner/repo.` : RA.explain(e)); return; }
  }
  const f = { full: r.full_name, branch: r.default_branch, kinds: kinds || { release: true }, seen: {}, added: Date.now() };
  saveFollows([...follows(), f]);
  after();
  RA.toast("info", `Following <b>${esc(r.full_name)}</b>. You'll hear about ${hearAbout(f.kinds)}.`, 7000);
  check([f], true, true);
  allowed(true);
}
function unfollow(full) {
  saveFollows(follows().filter((f) => !same(f.full, full)));
  saveUpdates(updates().filter((u) => !same(u.full, full)));
  after();
  RA.toast("info", `Stopped following <b>${esc(full)}</b>.`, 4000);
}
function askFollow() {
  const S = RA.S;
  const suggest = S.sample ? [] : [...S.repos].filter((r) => !findFollow(r.full_name)).sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 8)
    .map((r) => ({ login: r.full_name, note: `★ ${RA.fmt(r.stargazers_count)}` }));
  RA.palette("ask", "", { placeholder: "Repository to follow, as owner/repo (for example microsoft/vscode)", msg: "Press Enter to follow." + (suggest.length ? ` Or pick one from @${S.user.login}:` : ""), verb: "Follow", suggest, noRecent: true, go: (q) => openOptions(q) });
}
async function importWatched() {
  if (!RA.S.token) { RA.toast("info", "Add a GitHub token in Settings first, so Repo Atlas can see what you watch."); return; }
  RA.busyStart("Reading the repositories you watch…");
  let list = [];
  try { list = (await RA.paged("/user/subscriptions")).filter((r) => !findFollow(r.full_name)); }
  catch (e) { RA.toast("error", RA.explain(e)); return; }
  finally { RA.busyEnd(); }
  if (!list.length) { RA.toast("info", "You aren't watching any repositories on GitHub that you don't already follow here."); return; }
  AtlasShare.modal(`${AtlasShare.head("Follow the repositories you watch")}
    <p>These are the repositories you watch on GitHub. Pick the ones to follow here; you'll hear about their new releases.</p>
    <div class="checks" style="max-height:340px;overflow:auto">${list.slice(0, 100).map((r, i) => `<label><input type="checkbox" data-i="${i}"><div><b>${esc(r.full_name)}</b><span>${esc(r.description || "")}</span></div></label>`).join("")}</div>
    <div class="acts"><button type="button" class="btn primary" id="fImport">${I.bell}Follow selected</button><button type="button" class="btn" data-mclose>Cancel</button></div>`);
  $("fImport").onclick = () => {
    const pick = [...$("modal").querySelectorAll("[data-i]:checked")].map((c) => list[+c.dataset.i]);
    AtlasShare.closeModal();
    if (!pick.length) return;
    const add = pick.map((r) => ({ full: r.full_name, branch: r.default_branch, kinds: { release: true }, seen: {}, added: Date.now() }));
    saveFollows([...follows(), ...add]); after();
    RA.toast("info", `Following ${pick.length} more repositor${pick.length === 1 ? "y" : "ies"}.`);
    check(add, true, true);
  };
}

/* ---------------- Checking for news ---------------- */
// The first look at a repository only notes where things stand; anything newer after that is an update
async function checkRepo(f) {
  const out = [], seen = f.seen || (f.seen = {}), base = `/repos/${f.full}`, k = f.kinds || {};
  const at = (d) => d ? new Date(d).getTime() : Date.now();
  if (k.release) {
    const rel = (await RA.gh(`${base}/releases?per_page=5`, { fresh: true })).data.filter((r) => !r.draft);
    const top = Math.max(0, ...rel.map((r) => r.id));
    if (seen.release != null) for (const r of rel.filter((r) => r.id > seen.release).reverse())
      out.push({ kind: "release", text: `New ${r.prerelease ? "pre-release" : "release"} ${r.name || r.tag_name}`, url: r.html_url, at: at(r.published_at) });
    seen.release = Math.max(seen.release || 0, top);
  }
  if (k.commit) {
    const list = (await RA.gh(`${base}/commits?per_page=20`, { fresh: true })).data;
    if (list.length) {
      if (seen.commit) {
        const i = list.findIndex((c) => c.sha === seen.commit), fresh = i < 0 ? list : list.slice(0, i);
        if (fresh.length) {
          const n = fresh.length, msg = fresh[0].commit.message.split("\n")[0];
          out.push({ kind: "commit", text: `${n}${i < 0 ? "+" : ""} new commit${n === 1 ? "" : "s"} on ${f.branch || "the default branch"}: “${msg}”`, url: n === 1 ? fresh[0].html_url : `https://github.com/${f.full}/commits`, at: at(fresh[0].commit.committer?.date) });
        }
      }
      seen.commit = list[0].sha;
    }
  }
  if (k.issue) {
    const list = (await RA.gh(`${base}/issues?state=all&sort=created&direction=desc&per_page=10`, { fresh: true })).data;
    const top = Math.max(0, ...list.map((x) => x.number));
    if (seen.issue != null) for (const x of list.filter((x) => x.number > seen.issue).reverse())
      out.push({ kind: x.pull_request ? "pr" : "issue", text: `${x.pull_request ? "New pull request" : "New issue"} #${x.number}: ${x.title}${x.user ? ` (by @${x.user.login})` : ""}`, url: x.html_url, at: at(x.created_at) });
    seen.issue = Math.max(seen.issue || 0, top);
  }
  if (k.run) {
    const runs = (await RA.gh(`${base}/actions/runs?per_page=15&status=completed`, { fresh: true })).data.workflow_runs || [];
    if (seen.runs) for (const r of runs.filter((r) => !seen.runs.includes(r.id) && /^(failure|timed_out|startup_failure)$/.test(r.conclusion)).reverse())
      out.push({ kind: "run", text: `${r.name} failed on ${r.head_branch}${r.display_title ? `: “${r.display_title}”` : ""}`, url: r.html_url, at: at(r.updated_at) });
    seen.runs = [...new Set([...runs.map((r) => r.id), ...(seen.runs || [])])].sort((a, b) => b - a).slice(0, 60);
  }
  return out;
}

const INV = { repo: [], org: [], note: "", loaded: false };
async function checkInvites() {
  if (!RA.S.token) { Object.assign(INV, { repo: [], org: [], note: "", loaded: false }); return []; }
  const out = [];
  try { INV.repo = (await RA.gh("/user/repository_invitations?per_page=100", { fresh: true })).data; INV.note = ""; }
  catch (e) { INV.repo = []; INV.note = e.status === 403 || e.status === 404 ? "Your token can't read invitations. A classic token with the repo scope can (see Settings)." : ""; }
  try { INV.org = (await RA.gh("/user/memberships/orgs?state=pending&per_page=100", { fresh: true })).data; } catch { INV.org = []; }
  const known = store.json("ra.invSeen", null);
  const ids = [...INV.repo.map((i) => "r" + i.id), ...INV.org.map((m) => "o" + m.organization.login)];
  if (known) {
    for (const i of INV.repo.filter((i) => !known.includes("r" + i.id)))
      out.push({ kind: "invite", full: i.repository.full_name, text: `@${i.inviter?.login || "someone"} invited you to collaborate`, url: i.html_url, at: new Date(i.created_at).getTime() });
    for (const m of INV.org.filter((m) => !known.includes("o" + m.organization.login)))
      out.push({ kind: "invite", full: m.organization.login, text: `You're invited to join the ${m.organization.login} organization`, url: `https://github.com/orgs/${m.organization.login}/invitation`, at: Date.now() });
  }
  store.set("ra.invSeen", JSON.stringify(ids));
  INV.loaded = true;
  return out;
}

// Checks run one after another, so a repository followed during a background check still gets its starting point
let checking = false, queue = Promise.resolve();
function check(list, manual, quiet) {
  queue = queue.then(() => runCheck(list, manual, quiet)).catch(console.error);
  return queue;
}
// quiet: don't notify (a repository that was just followed only gets its starting point)
async function runCheck(list, manual, quiet) {
  const left = RA.rateLeft();
  if (!manual && left != null && left < 40) return;
  checking = true;
  const all = list || follows();
  const found = [];
  let stop = null;
  if (manual && !quiet) RA.busyStart("Checking the repositories you follow…");
  try {
    if (!list) found.push(...(await checkInvites()));
    await RA.pool(all, 3, async (f) => {
      if (stop) return;
      try {
        const news = await checkRepo(f);
        found.push(...news.map((u) => ({ ...u, full: f.full })));
        delete f.error;
      } catch (e) {
        if (e.status === 403 && e.reset || e.status === 429) stop = e;
        else f.error = e.status === 404 ? "Can't see this repository any more" : e.status ? `GitHub returned ${e.status}` : "Couldn't reach GitHub";
      }
    });
    // Write back only the follows that were checked, in case one was added or removed meanwhile
    const byName = new Map(all.map((f) => [f.full.toLowerCase(), f]));
    saveFollows(follows().map((f) => byName.has(f.full.toLowerCase()) ? { ...f, seen: byName.get(f.full.toLowerCase()).seen, error: byName.get(f.full.toLowerCase()).error } : f));
    if (!list) store.set("ra.lastCheck", String(Date.now()));
  } finally { checking = false; if (manual && !quiet) RA.busyEnd(); }
  if (stop) RA.toast("error", RA.explain(stop));
  if (found.length && !quiet) {
    found.sort((a, b) => a.at - b.at);
    const stamp = Date.now();
    saveUpdates([...found.reverse().map((u, i) => ({ ...u, id: `${stamp}-${i}`, read: false })), ...updates()]);
    if (found.length === 1) tell(found[0].full, found[0].text);
    else tell(`${found.length} updates`, found.slice(0, 3).map((u) => `${u.full}: ${u.text}`).join("\n") + (found.length > 3 ? `\n…and ${found.length - 3} more` : ""));
  } else if (manual && !quiet) RA.toast("info", follows().length ? "Nothing new since the last check." : "Follow a repository first: open one and click Follow.", 3500);
  after();
}
// A timer looks every minute whether a check is due, so a computer waking from sleep catches up straight away
setInterval(() => { if (!checking && Date.now() - (+store.get("ra.lastCheck") || 0) >= everyMs()) check(); }, MIN);

/* ---------------- Invitations ---------------- */
async function answerInvite(id, accept) {
  const inv = INV.repo.find((i) => String(i.id) === String(id)); if (!inv) return;
  try {
    await RA.gh(`/user/repository_invitations/${inv.id}`, { method: accept ? "PATCH" : "DELETE" });
    INV.repo = INV.repo.filter((i) => i !== inv);
    RA.toast("info", accept ? `You're now a collaborator on <b>${esc(inv.repository.full_name)}</b>. <button type="button" class="link" data-fopen="${esc(inv.repository.full_name)}">Open it</button>` : `Declined the invitation to <b>${esc(inv.repository.full_name)}</b>.`, 8000);
  } catch (e) { RA.toast("error", e.status === 403 || e.status === 404 ? "GitHub didn't let this token answer the invitation. A classic token with the repo scope can; or answer it on GitHub." : RA.explain(e)); }
  after();
}
async function acceptOrg(login) {
  try {
    await RA.gh(`/user/memberships/orgs/${encodeURIComponent(login)}`, { method: "PATCH", body: JSON.stringify({ state: "active" }) });
    INV.org = INV.org.filter((m) => m.organization.login !== login);
    RA.toast("info", `You've joined <b>${esc(login)}</b>.`);
  } catch (e) { RA.toast("error", e.status === 403 || e.status === 404 ? "This token can't accept organization invitations (it needs the admin:org or read:org scope). Opening it on GitHub instead." : RA.explain(e)); if (e.status === 403 || e.status === 404) RA.openExternal(`https://github.com/orgs/${login}/invitation`); }
  after();
}

/* ---------------- Sidebar view ---------------- */
const fcollapsed = new Set(store.json("ra.fcollapsed", []));
function group(key, label, n, body) {
  const open = !fcollapsed.has(key);
  return `<button type="button" class="grp" data-fgrp="${key}" aria-expanded="${open}">${I.chevron}${label}<span class="n">${n}</span></button>${open ? body : ""}`;
}
function render() {
  const box = $("followList"); if (!box) return;
  if (!INV.loaded && RA.S.token && !box.closest("[hidden]") && !INV.asked) { INV.asked = true; checkInvites().then(after); }
  const F = follows(), U = updates(), S = RA.S;
  const unreadBy = {}; for (const u of U) if (!u.read) unreadBy[u.full.toLowerCase()] = (unreadBy[u.full.toLowerCase()] || 0) + 1;
  let html = "";
  if (!S.token) html += `<div class="shint">Add a GitHub token to see your invitations and to check more often than once an hour.<br><button type="button" class="btn" data-cmd="tokenbox" style="margin-top:6px">${I.key}Add GitHub token</button></div>`;
  const nInv = INV.repo.length + INV.org.length;
  if (nInv || INV.note) html += group("inv", "Invitations", nInv, (INV.note ? `<div class="shint">${esc(INV.note)}</div>` : "")
    + INV.repo.map((i) => `<div class="fl-row inv k-invite">${I.mail}<div class="fb"><b title="${esc(i.repository.full_name)}">${esc(i.repository.full_name)}</b>
      <span>@${esc(i.inviter?.login || "someone")} invited you · ${esc(i.permissions || "write")} access · ${RA.ago(i.created_at)}</span>
      <div class="inv-acts"><button type="button" class="btn primary" data-inv-accept="${i.id}">Accept</button><button type="button" class="btn" data-inv-decline="${i.id}">Decline</button></div></div></div>`).join("")
    + INV.org.map((m) => `<div class="fl-row inv k-invite">${I.mail}<div class="fb"><b>${esc(m.organization.login)}</b><span>Invitation to join the organization as ${esc(m.role || "member")}</span>
      <div class="inv-acts"><button type="button" class="btn primary" data-org-accept="${esc(m.organization.login)}">Accept</button><button type="button" class="btn" data-open="https://github.com/orgs/${esc(m.organization.login)}/invitation">Open on GitHub</button></div></div></div>`).join(""));
  html += group("repos", "Repositories you follow", F.length, F.length ? F.map((f) => {
    const [o, n] = f.full.split("/"), c = unreadBy[f.full.toLowerCase()];
    const what = f.error ? f.error : KINDS.filter((x) => f.kinds?.[x.k]).map((x) => ({ release: "releases", commit: "commits", issue: "issues", run: "failed runs" })[x.k]).join(", ");
    return `<div class="fl-row" data-fopen="${esc(f.full)}" title="Open ${esc(f.full)}">${I.repo}<div class="fb"><b>${esc(n)}</b><span${f.error ? ' style="color:var(--warn)"' : ""}>${esc(o)} · ${esc(what)}</span></div>
      ${c ? `<span class="cnt" title="${c} unread">${c}</span>` : ""}<button type="button" class="ib" data-fedit="${esc(f.full)}" title="What to be told about">${I.bell}</button></div>`;
  }).join("") : `<div class="shint">Nothing yet. Open any repository and click <b>Follow</b>, or press <b>+</b> above and type <span class="mono">owner/repo</span>.${S.token ? `<br><button type="button" class="btn" data-cmd="importWatched" style="margin-top:6px">${I.bell}Follow the repos I watch on GitHub</button>` : ""}</div>`);
  const nU = U.filter((u) => !u.read).length;
  html += group("upd", "Latest updates", nU ? `${nU} new` : U.length, U.length ? U.slice(0, 60).map((u) => `<div class="fl-row k-${u.kind}${u.read ? "" : " unread"}" data-fupd="${esc(u.id)}" title="${esc(u.text)}">${ICON[u.kind] || I.bell}<div class="fb"><span class="fx">${esc(u.text)}</span><span>${esc(u.full)} · ${RA.ago(u.at)}</span></div></div>`).join("")
    : `<div class="shint">${F.length ? `New releases${F.some((f) => f.kinds?.commit) ? ", commits" : ""} and more from the repositories you follow show up here.` : "Updates from the repositories you follow show up here."}${store.get("ra.lastCheck") ? `<br>Last checked ${RA.ago(+store.get("ra.lastCheck"))}.` : ""}</div>`);
  box.innerHTML = html;
}
function after() { render(); badge(); decorate(); renderSettings(); }
function badge() {
  const n = updates().filter((u) => !u.read).length + INV.repo.length + INV.org.length;
  const b = $("followBadge"); if (!b) return;
  b.hidden = !n; b.textContent = n > 99 ? "99+" : n;
  $("actFollow").title = `Following and invitations${n ? ` (${n} new)` : ""} (Ctrl+Shift+U)`;
}
function markRead(pred) { saveUpdates(updates().map((u) => !pred || pred(u) ? { ...u, read: true } : u)); after(); }
function openFollowed(full) {
  const [o, n] = full.split("/");
  markRead((u) => same(u.full, full));
  if (!RA.S.user || RA.S.sample) RA.load(full); else RA.openByName(o, n);
}
$("followList").addEventListener("click", (e) => {
  const g = e.target.closest("[data-fgrp]");
  if (g) { const k = g.dataset.fgrp; fcollapsed.has(k) ? fcollapsed.delete(k) : fcollapsed.add(k); store.set("ra.fcollapsed", JSON.stringify([...fcollapsed])); render(); return; }
  const ed = e.target.closest("[data-fedit]"); if (ed) { e.stopPropagation(); openOptions(ed.dataset.fedit); return; }
  const ac = e.target.closest("[data-inv-accept]"); if (ac) { ac.disabled = true; answerInvite(ac.dataset.invAccept, true); return; }
  const dc = e.target.closest("[data-inv-decline]");
  if (dc) {
    // Declining can't be undone, so it takes a second click
    if (dc.dataset.sure) { dc.disabled = true; answerInvite(dc.dataset.invDecline, false); }
    else { dc.dataset.sure = "1"; dc.textContent = "Click again to decline"; dc.classList.add("danger"); setTimeout(() => { if (dc.isConnected) { delete dc.dataset.sure; dc.textContent = "Decline"; dc.classList.remove("danger"); } }, 4000); }
    return;
  }
  const oa = e.target.closest("[data-org-accept]"); if (oa) { oa.disabled = true; acceptOrg(oa.dataset.orgAccept); return; }
  const up = e.target.closest("[data-fupd]");
  if (up) { const u = updates().find((x) => x.id === up.dataset.fupd); if (u) { markRead((x) => x.id === u.id); RA.openExternal(u.url); } }
});
// "Open it" links in messages, and followed repositories in the sidebar
document.addEventListener("click", (e) => { const o = e.target.closest("[data-fopen]"); if (o && !e.target.closest("[data-fedit]")) openFollowed(o.dataset.fopen); });

/* ---------------- Repository tab: the Follow button ---------------- */
function decorate() {
  const b = $("followBtn"), full = RA.repoShown(); if (!b || !full) return;
  const on = !!findFollow(full);
  b.innerHTML = `${I.bell}${on ? "Following" : "Follow"}`;
  b.classList.toggle("on", on);
  b.title = on ? "Change what you're told about, or unfollow" : "Get told about new releases and more";
}
RA.onRepo(() => setTimeout(decorate));

/* ---------------- Settings ---------------- */
function renderSettings() {
  const p = prefs();
  $("everySel").value = String(p.every);
  $("notifyOn").checked = p.notify;
  $("trayOn").checked = p.tray;
  document.querySelectorAll("#notifySetting .desk").forEach((el) => el.hidden = !RA.desktop);
  const last = +store.get("ra.lastCheck"), n = follows().length;
  $("notifyNote").textContent = `Following ${n} repositor${n === 1 ? "y" : "ies"}.${last ? ` Last checked ${RA.ago(last)}.` : ""}${RA.S.token ? "" : " Without a token, checks happen once an hour."}${RA.desktop ? "" : " In a browser, checks only run while this page is open."}`;
}
$("everySel").onchange = () => setPrefs({ every: +$("everySel").value });
$("notifyOn").onchange = async () => {
  setPrefs({ notify: $("notifyOn").checked });
  if ($("notifyOn").checked && !(await allowed(true))) RA.toast("warn", RA.desktop ? "Windows is blocking notifications from Repo Atlas. Turn them on in Windows Settings > System > Notifications." : "This browser is blocking notifications for this page. Allow them from the lock icon next to the address.");
};
$("trayOn").onchange = () => { setPrefs({ tray: $("trayOn").checked }); syncTray(); };
$("autoOn").onchange = async () => {
  const on = $("autoOn").checked;
  try { await T.core.invoke(on ? "plugin:autostart|enable" : "plugin:autostart|disable"); RA.toast("info", on ? "Repo Atlas will start, out of the way in the tray, when you sign in to Windows." : "Repo Atlas won't start by itself any more.", 5000); }
  catch (e) { $("autoOn").checked = !on; RA.toast("error", `Couldn't change that: ${esc(e)}`); }
};
async function testNotify() {
  if (!(await allowed(true))) { RA.toast("warn", RA.desktop ? "Windows is blocking notifications from Repo Atlas. Turn them on in Windows Settings > System > Notifications." : "This browser is blocking notifications for this page."); return; }
  const ok = await osNotify("Repo Atlas", "Notifications work. You'll see new releases and invitations like this.");
  if (!ok) RA.toast("error", "The notification didn't go through.");
}

/* ---------------- Tray (desktop) ---------------- */
// Closing the window can hide it to the tray instead of quitting, so checks keep running
function syncTray() { if (RA.desktop) T.core.invoke("set_close_to_tray", { on: prefs().tray }).catch(console.error); }
if (RA.desktop) {
  syncTray();
  T.core.invoke("plugin:autostart|is_enabled").then((on) => $("autoOn").checked = !!on).catch(() => {});
  T.event?.listen("hidden-to-tray", () => {
    if (store.get("ra.trayTold")) return;
    store.set("ra.trayTold", "1");
    osNotify("Repo Atlas is still running", "It keeps checking the repositories you follow. Click its icon in the tray to open it, or right-click the icon to quit.");
  });
}

RA.addCommands([
  { id: "following", label: "View: Show Following", keys: ["Ctrl", "Shift", "U"], run: () => RA.showSide("following", true) },
  { id: "follow", label: "Repository: Follow or Unfollow…", when: () => RA.isRepo() && !RA.S.sample, run: () => { const r = RA.curRepo(); openOptions(r.full_name, r); } },
  { id: "followAsk", label: "Following: Follow a Repository…", run: askFollow },
  { id: "importWatched", label: "Following: Follow the Repositories I Watch on GitHub…", when: () => !!RA.S.token, run: importWatched },
  { id: "checkNow", label: "Following: Check for Updates Now", run: () => check(null, true) },
  { id: "markRead", label: "Following: Mark All Updates as Read", run: () => markRead() },
  { id: "testNotify", label: "Notifications: Send a Test Notification", run: testNotify },
]);
window.AtlasFollow = { render, check, tell, everyMs, isFollowing: (full) => !!findFollow(full), open: openFollowed };
after();
// First check soon after start-up, once the saved token has been read
setTimeout(() => { if (Date.now() - (+store.get("ra.lastCheck") || 0) >= Math.min(everyMs(), 5 * MIN)) check(); else checkInvites().then(after); }, 6000);
})();
