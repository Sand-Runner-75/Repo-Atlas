/* Repository tab extras: the Star button, and the Releases panel with publishing a new release */
(() => {
"use strict";
const RA = window.RA, { esc, I } = RA;
const $ = (id) => document.getElementById(id);
const R = { full: null, rels: [], starred: null };

/* ---------------- Star ---------------- */
function drawStar() {
  const b = $("starBtn"); if (!b) return;
  b.hidden = R.starred == null;
  b.innerHTML = `${R.starred ? "★" : "☆"} ${R.starred ? "Starred" : "Star"}`;
  b.classList.toggle("on", !!R.starred);
  b.title = R.starred ? "Remove your star" : "Star this repository on GitHub";
}
async function loadStar(full) {
  R.starred = null; drawStar();
  if (!RA.S.token) return;
  try { await RA.gh(`/user/starred/${full}`, { fresh: true }); R.starred = true; }
  catch (e) { R.starred = e.status === 404 ? false : null; }
  if (RA.repoShown() === full) drawStar();
}
async function toggleStar() {
  const full = R.full; if (!full || R.starred == null) return;
  const on = !R.starred;
  if (await AtlasInbox.setStar(full, on)) {
    R.starred = on; drawStar();
    RA.toast("info", on ? `Starred <b>${esc(full)}</b>.` : `Removed your star from <b>${esc(full)}</b>.`, 3000);
  }
}

/* ---------------- Releases ---------------- */
function drawReleases() {
  const box = $("dRels"); if (!box) return;
  $("dRelSub").innerHTML = R.rels.length && !RA.S.sample ? `<a href="https://github.com/${esc(R.full)}/releases">all on GitHub</a>` : "";
  box.innerHTML = R.rels.length ? R.rels.map((r, i) => {
    const dl = (r.assets || []).reduce((a, x) => a + (x.download_count || 0), 0);
    return `<div class="run"><span class="st ${r.draft ? "neutral" : i === 0 && !r.prerelease ? "success" : "neutral"}">${I.tag}</span>
      <div class="rb"><div class="t1"><b>${esc(r.name || r.tag_name)}</b>${i === 0 && !r.draft && !r.prerelease ? ' <span class="flag">latest</span>' : ""}${r.prerelease ? ' <span class="flag">pre-release</span>' : ""}${r.draft ? ' <span class="flag">draft</span>' : ""}</div>
        <div class="t2"><span class="chip tag">${esc(r.tag_name)}</span><span>${r.published_at ? RA.ago(r.published_at) : "not published"}${r.author ? ` by @${esc(r.author.login)}` : ""}</span>${(r.assets || []).length ? `<span>${r.assets.length} file${r.assets.length === 1 ? "" : "s"} · ${RA.fmt(dl)} download${dl === 1 ? "" : "s"}</span>` : ""}</div></div>
      <div class="ra">${r.html_url && r.html_url !== "#" ? `<button type="button" class="ib" data-open="${esc(r.html_url)}" title="Open on GitHub">${I.ext}</button>` : ""}</div></div>`;
  }).join("") : `<div class="empty">No releases yet. <b>New release</b> tags a version and publishes it with notes.</div>`;
}
async function loadReleases(full) {
  if (RA.S.sample) { R.rels = sampleReleases(); drawReleases(); return; }
  try { R.rels = (await RA.gh(`/repos/${full}/releases?per_page=5`, { fresh: true })).data; if (RA.repoShown() === full) drawReleases(); }
  catch (e) { if (RA.repoShown() === full && $("dRels")) $("dRels").innerHTML = `<div class="empty">Couldn't load releases. ${esc(RA.explain(e).replace(/<[^>]+>/g, ""))}</div>`; }
}
function sampleReleases() {
  const d = (n) => new Date(Date.now() - n * 864e5).toISOString();
  return [
    { name: "1.1 beta", tag_name: "v1.1.0-beta.1", prerelease: true, published_at: d(2), author: { login: "sample-dev" }, assets: [{ download_count: 31 }], html_url: "#" },
    { name: "1.0", tag_name: "v1.0", published_at: d(25), author: { login: "sample-dev" }, assets: [{ download_count: 812 }, { download_count: 240 }], html_url: "#" },
    { name: "0.5", tag_name: "v0.5", published_at: d(48), author: { login: "sample-dev" }, assets: [], html_url: "#" },
  ];
}
// v1.4.2 -> v1.4.3; anything else gets no suggestion
function nextTag() {
  const last = R.rels.find((r) => !r.draft)?.tag_name || "";
  const m = /^(v?)(\d+)\.(\d+)\.(\d+)$/.exec(last);
  return m ? `${m[1]}${m[2]}.${m[3]}.${+m[4] + 1}` : last ? "" : "v1.0.0";
}
async function releaseDialog() {
  const r = RA.curRepo(); if (!r) return;
  if (RA.S.sample) return RA.toast("info", "This is sample data. Load a real account (Ctrl+O) to publish releases.");
  if (!RA.S.token) return RA.toast("info", "Publishing a release needs a GitHub token with <b>Contents: Read and write</b>. Add one in Settings (Ctrl+,).");
  const full = r.full_name;
  let branches = [r.default_branch];
  try { branches = [...new Set([r.default_branch, ...(await RA.paged(`/repos/${full}/branches`)).map((b) => b.name)])]; } catch {}
  const last = R.rels.find((x) => !x.draft)?.tag_name;
  AtlasShare.modal(`${AtlasShare.head(`New release of ${r.name}`)}
    <form class="form" id="relForm" autocomplete="off">
      <label><span><b>Version tag</b>${last ? ` · the last one was <span class="mono">${esc(last)}</span>` : ""}</span><span class="input"><input id="relTag" value="${esc(nextTag())}" placeholder="v1.0.0" required spellcheck="false"></span></label>
      <label><span><b>From branch</b> · used when the tag is new</span><select id="relTarget">${branches.map((b) => `<option>${esc(b)}</option>`).join("")}</select></label>
      <label><span><b>Title</b></span><span class="input"><input id="relName" placeholder="Same as the tag if left empty"></span></label>
      <label><span><b>What's new</b> · Markdown works</span><textarea id="relBody" rows="8"></textarea></label>
      <div class="trow"><button type="button" class="btn" id="relGen">Write the notes for me</button><span class="fine" style="align-self:center">Lists the pull requests merged since the last release.</span></div>
      <label class="cb"><input type="checkbox" id="relPre"> Pre-release (not ready for everyone yet)</label>
      <label class="cb"><input type="checkbox" id="relDraft"> Save as a draft (publish it later on GitHub)</label>
      <div class="acts"><button type="submit" class="btn primary">${I.tag}Publish release</button><button type="button" class="btn" data-mclose>Cancel</button></div></form>`);
  $("relTag").focus();
  $("relGen").onclick = async () => {
    const tag = $("relTag").value.trim(); if (!tag) { $("relTag").focus(); return; }
    $("relGen").disabled = true;
    try {
      const { data } = await RA.gh(`/repos/${full}/releases/generate-notes`, { method: "POST", body: JSON.stringify({ tag_name: tag, target_commitish: $("relTarget").value, ...(last ? { previous_tag_name: last } : {}) }) });
      if (!$("relName").value) $("relName").value = data.name || "";
      $("relBody").value = data.body || "";
    } catch (e) { RA.toast("error", e.status === 403 || e.status === 404 ? "This token can't do that here. It needs Contents: Read and write." : RA.explain(e)); }
    if ($("relGen")) $("relGen").disabled = false;
  };
  $("relForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter; if (btn) btn.disabled = true;
    const tag = $("relTag").value.trim();
    try {
      const { data } = await RA.gh(`/repos/${full}/releases`, { method: "POST", body: JSON.stringify({ tag_name: tag, target_commitish: $("relTarget").value, name: $("relName").value.trim() || tag, body: $("relBody").value, prerelease: $("relPre").checked, draft: $("relDraft").checked }) });
      AtlasShare.closeModal();
      RA.toast("info", `${data.draft ? "Saved a draft of" : "Published"} <b>${esc(data.name || tag)}</b>. <button type="button" class="link" data-open="${esc(data.html_url)}">See it on GitHub</button>`, 8000);
      if (RA.repoShown() === full) loadReleases(full);
    } catch (err) {
      if (btn) btn.disabled = false;
      RA.toast("error", err.status === 422 ? `GitHub refused: ${esc(err.message || "check the tag")}. A release with this tag may already exist.` : err.status === 403 || err.status === 404 ? "This token can't publish releases here. It needs Contents: Read and write." : RA.explain(err));
    }
  };
}

RA.onRepo((r) => { R.full = r.full_name; R.rels = []; loadReleases(r.full_name); if (!RA.S.sample) loadStar(r.full_name); });
RA.addCommands([
  { id: "star", label: "Repository: Star or Unstar", when: () => RA.isRepo() && !RA.S.sample && !!RA.S.token, run: toggleStar },
  { id: "newRelease", label: "Repository: New Release…", when: RA.isRepo, run: releaseDialog },
]);
})();
