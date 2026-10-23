/* Actions: each repository's latest workflow runs, with re-run and cancel, and starting a workflow by hand */
(() => {
"use strict";
const RA = window.RA, { esc, I } = RA;
const $ = (id) => document.getElementById(id);
const A = { full: null, runs: [], total: 0, timer: null };
const X = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>';
const SKIP = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/></svg>';

function state(r) {
  if (r.status !== "completed") return { cls: "active", icon: '<i class="spin"></i>', label: /^(queued|waiting|pending|requested)$/.test(r.status) ? "Queued" : "Running" };
  switch (r.conclusion) {
    case "success": return { cls: "success", icon: I.check, label: "Succeeded" };
    case "failure": case "timed_out": case "startup_failure": return { cls: "failure", icon: X, label: r.conclusion === "timed_out" ? "Timed out" : "Failed" };
    case "action_required": return { cls: "active", icon: I.issue, label: "Waiting for approval" };
    case "cancelled": return { cls: "neutral", icon: SKIP, label: "Cancelled" };
    default: return { cls: "neutral", icon: SKIP, label: r.conclusion ? r.conclusion[0].toUpperCase() + r.conclusion.slice(1) : "Done" };
  }
}
function took(r) {
  const s = Math.max(0, ((r.status === "completed" ? new Date(r.updated_at) : Date.now()) - new Date(r.run_started_at || r.created_at)) / 1000);
  return s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.floor(s / 3600)}h ${Math.round(s % 3600 / 60)}m`;
}
const EVENT = { push: "push", pull_request: "pull request", workflow_dispatch: "run by hand", schedule: "schedule", release: "release", pull_request_target: "pull request", merge_group: "merge queue" };
function row(r) {
  const st = state(r), done = r.status === "completed", failed = st.cls === "failure";
  return `<div class="run" data-run="${r.id}"><span class="st ${st.cls}" title="${esc(st.label)}">${st.icon}</span>
    <div class="rb"><div class="t1"><b>${esc(r.name || "Workflow")}</b> · ${esc(r.display_title || r.head_commit?.message?.split("\n")[0] || "")}</div>
      <div class="t2"><span>${esc(st.label)}</span><span class="chip tag">${esc(r.head_branch || "")}</span><span>${esc(EVENT[r.event] || r.event)}${r.actor ? ` by @${esc(r.actor.login)}` : ""}</span><span>${RA.ago(r.created_at)} · ${took(r)}</span>${r.run_attempt > 1 ? `<span>attempt ${r.run_attempt}</span>` : ""}</div></div>
    <div class="ra">${done ? `${failed ? `<button type="button" class="btn" data-arerun="${r.id}" data-failed="1" title="Run only the jobs that failed again">${I.rerun}Re-run failed</button>` : ""}<button type="button" class="btn" data-arerun="${r.id}" title="Run every job again">${I.rerun}Re-run</button>`
      : `<button type="button" class="btn" data-acancel="${r.id}" title="Stop this run">${I.stop}Cancel</button>`}
      ${r.html_url && r.html_url !== "#" ? `<button type="button" class="ib" data-open="${esc(r.html_url)}" title="Open the run and its logs on GitHub">${I.ext}</button>` : ""}</div></div>`;
}
function draw() {
  const box = $("dRuns"); if (!box) return;
  const full = A.full;
  $("dActSub").innerHTML = A.total ? `${RA.fmt(A.total)} run${A.total === 1 ? "" : "s"} · ${RA.S.sample ? "all on GitHub" : `<a href="https://github.com/${esc(full)}/actions">all on GitHub</a>`}` : "";
  box.innerHTML = A.runs.length ? A.runs.map(row).join("")
    : `<div class="empty">No Actions runs yet. Workflows in <span class="mono">.github/workflows</span> show up here once they run.</div>`;
}
async function load(full) {
  if (RA.S.sample) return sample();
  try {
    const { data } = await RA.gh(`/repos/${full}/actions/runs?per_page=10`, { fresh: true });
    if (RA.repoShown() !== full) return;
    A.runs = data.workflow_runs || []; A.total = data.total_count || 0;
    draw();
  } catch (e) {
    if (RA.repoShown() !== full || !$("dRuns")) return;
    A.runs = [];
    $("dRuns").innerHTML = `<div class="empty">${e.status === 404 || e.status === 403 && !e.reset ? "Actions runs aren't visible for this repository. It may have Actions turned off, or your token can't see them." : esc(RA.explain(e).replace(/<[^>]+>/g, ""))}</div>`;
  }
  schedule(full);
}
// While a run is queued or running, the list updates itself every few seconds
function schedule(full) {
  clearTimeout(A.timer);
  if (!A.runs.some((r) => r.status !== "completed") || RA.S.sample) return;
  A.timer = setTimeout(() => {
    if (RA.repoShown() !== full) return;
    if (document.visibilityState === "visible") load(full); else schedule(full);
  }, 8000);
}
function soon(full) { setTimeout(() => RA.repoShown() === full && load(full), 2500); setTimeout(() => RA.repoShown() === full && load(full), 7000); }

const noWrite = "This token can't run Actions here. In Settings, give it <b>Actions: Read and write</b> access (or use a classic token with the <span class=\"mono\">repo</span> and <span class=\"mono\">workflow</span> scopes).";
function writeError(e) { RA.toast("error", e.status === 403 && !e.reset || e.status === 404 ? noWrite : e.status === 409 ? "GitHub says this run can't be changed right now (it may have just finished)." : RA.explain(e)); }
function sampleOnly() { RA.toast("info", "This is sample data. Load a real account (Ctrl+O) to run Actions."); }
async function rerun(id, failedOnly) {
  if (RA.S.sample) return sampleOnly();
  if (!RA.S.token) return RA.toast("info", "Re-running a workflow needs a GitHub token. Add one in Settings (Ctrl+,).");
  const full = A.full;
  try {
    await RA.gh(`/repos/${full}/actions/runs/${id}/${failedOnly ? "rerun-failed-jobs" : "rerun"}`, { method: "POST" });
    const r = A.runs.find((x) => x.id === +id);
    RA.toast("info", `Started <b>${esc(r?.name || "the run")}</b> again${failedOnly ? ", failed jobs only" : ""}.`, 4000);
    soon(full);
  } catch (e) { writeError(e); }
}
async function cancel(id) {
  if (RA.S.sample) return sampleOnly();
  const full = A.full;
  try { await RA.gh(`/repos/${full}/actions/runs/${id}/cancel`, { method: "POST" }); RA.toast("info", "Cancelling the run…", 3000); soon(full); }
  catch (e) { writeError(e); }
}
$("v-repo").addEventListener("click", (e) => {
  const rr = e.target.closest("[data-arerun]"); if (rr) { rr.disabled = true; rerun(rr.dataset.arerun, !!rr.dataset.failed); return; }
  const c = e.target.closest("[data-acancel]"); if (c) { c.disabled = true; cancel(c.dataset.acancel); }
});

/* ---------------- Run workflow ---------------- */
const unq = (v) => v.trim().replace(/^(['"])(.*)\1$/, "$2");
// Reads the inputs of a workflow_dispatch trigger. Not a full YAML parser, just enough for the usual shape:
// on: workflow_dispatch: inputs: name: { description, required, default, type, options }
function parseInputs(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+#.*$/, "").replace(/\t/g, "  "));
  const ind = (l) => l.match(/^ */)[0].length;
  const i0 = lines.findIndex((l) => /^\s*workflow_dispatch:\s*$/.test(l));
  if (i0 < 0) return [];
  let at = -1;
  for (let i = i0 + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    if (ind(lines[i]) <= ind(lines[i0])) break;
    if (/^\s*inputs:\s*$/.test(lines[i])) { at = i; break; }
  }
  if (at < 0) return [];
  const out = [], dIn = ind(lines[at]);
  let cur = null, dName = -1, dOpt = -1;
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i]; if (!l.trim()) continue;
    const d = ind(l), t = l.trim(); if (d <= dIn) break;
    if (dName < 0) dName = d;
    if (d === dName) { const m = /^([\w-]+):/.exec(t); if (m) { cur = { name: m[1], type: "string", options: [] }; out.push(cur); dOpt = -1; } continue; }
    if (!cur) continue;
    if (dOpt >= 0 && d > dOpt && t.startsWith("- ")) { cur.options.push(unq(t.slice(2))); continue; }
    dOpt = -1;
    const m = /^([\w-]+):\s*(.*)$/.exec(t); if (!m) continue;
    if (m[1] === "options") { if (m[2].startsWith("[")) cur.options = m[2].replace(/^\[|\]$/g, "").split(",").map(unq).filter(Boolean); else dOpt = d; }
    else if (/^(description|default|type|required)$/.test(m[1]) && !/^[|>]/.test(m[2])) cur[m[1]] = unq(m[2]);
  }
  return out;
}
const decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
function field(x) {
  const id = "wfi-" + x.name, req = x.required === "true", lbl = `<span><b>${esc(x.name)}</b>${req ? " (required)" : ""}${x.description ? ` · ${esc(x.description)}` : ""}</span>`;
  if (x.type === "boolean") return `<label class="cb"><input type="checkbox" id="${esc(id)}" data-in="${esc(x.name)}"${x.default === "true" ? " checked" : ""}>${lbl}</label>`;
  if (x.type === "choice" && x.options.length) return `<label>${lbl}<select data-in="${esc(x.name)}">${x.options.map((o) => `<option${o === x.default ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
  return `<label>${lbl}<span class="input"><input data-in="${esc(x.name)}" value="${esc(x.default || "")}" spellcheck="false"${req ? " required" : ""}></span></label>`;
}
async function runDialog() {
  const r = RA.curRepo(); if (!r) return;
  if (RA.S.sample) return sampleOnly();
  if (!RA.S.token) return RA.toast("info", "Running a workflow needs a GitHub token with <b>Actions: Read and write</b>. Add one in Settings (Ctrl+,).");
  const full = r.full_name;
  RA.busyStart("Finding workflows you can run…");
  let wfs = [], branches = [];
  try {
    const { data } = await RA.gh(`/repos/${full}/actions/workflows?per_page=100`, { fresh: true });
    const active = (data.workflows || []).filter((w) => w.state === "active" && w.path.startsWith(".github/workflows/"));
    // Only workflows with a workflow_dispatch trigger can be started by hand, and only the file says which those are
    wfs = (await Promise.all(active.map(async (w) => {
      try {
        const { data: f } = await RA.gh(`/repos/${full}/contents/${w.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(r.default_branch)}`, { fresh: true });
        const text = decode(f.content || "");
        return /\bworkflow_dispatch\b/.test(text) ? { ...w, inputs: parseInputs(text) } : null;
      } catch { return null; }
    }))).filter(Boolean);
    try { branches = (await RA.paged(`/repos/${full}/branches`)).map((b) => b.name); } catch {}
  } catch (e) { RA.toast("error", RA.explain(e)); return; }
  finally { RA.busyEnd(); }
  if (!wfs.length) {
    RA.toast("info", `None of the workflows in <b>${esc(full)}</b> can be started by hand. Add <span class="mono">workflow_dispatch:</span> under <span class="mono">on:</span> in a workflow file to allow it.`, 9000);
    return;
  }
  if (!branches.includes(r.default_branch)) branches.unshift(r.default_branch);
  AtlasShare.modal(`${AtlasShare.head(`Run a workflow in ${r.name}`)}
    <form class="form" id="wfForm" autocomplete="off">
      <label><span><b>Workflow</b></span><select id="wfSel">${wfs.map((w, i) => `<option value="${i}">${esc(w.name)} (${esc(w.path.split("/").pop())})</option>`).join("")}</select></label>
      <label><span><b>Branch</b> · the workflow file is read from here</span><select id="wfRef">${branches.map((b) => `<option${b === r.default_branch ? " selected" : ""}>${esc(b)}</option>`).join("")}</select></label>
      <div class="form" id="wfInputs"></div>
      <div class="acts"><button type="submit" class="btn primary">${I.play}Run workflow</button><button type="button" class="btn" data-mclose>Cancel</button></div>
    </form>`);
  const showInputs = () => { const w = wfs[+$("wfSel").value]; $("wfInputs").innerHTML = w.inputs.length ? w.inputs.map(field).join("") : `<p class="fine">This workflow has no inputs.</p>`; };
  $("wfSel").onchange = showInputs; showInputs();
  $("wfForm").onsubmit = async (e) => {
    e.preventDefault();
    const w = wfs[+$("wfSel").value], ref = $("wfRef").value, inputs = {};
    $("wfInputs").querySelectorAll("[data-in]").forEach((el) => inputs[el.dataset.in] = el.type === "checkbox" ? String(el.checked) : el.value);
    const btn = $("wfForm").querySelector("button[type=submit]"); btn.disabled = true;
    try {
      await RA.gh(`/repos/${full}/actions/workflows/${w.id}/dispatches`, { method: "POST", body: JSON.stringify({ ref, inputs }) });
      AtlasShare.closeModal();
      RA.toast("info", `Started <b>${esc(w.name)}</b> on <span class="mono">${esc(ref)}</span>. It shows up in the list in a few seconds.`, 5000);
      soon(full);
    } catch (err) {
      btn.disabled = false;
      if (err.status === 422) RA.toast("error", `GitHub refused to start it: ${esc(err.message || "check the inputs")}. The branch you pick must have this workflow with a workflow_dispatch trigger.`);
      else writeError(err);
    }
  };
}

/* ---------------- Sample data ---------------- */
function sample() {
  const now = Date.now(), m = 6e4, br = RA.curRepo()?.default_branch || "main";
  const mk = (id, name, title, status, conclusion, ago, mins, branch, event) => ({ id, name, display_title: title, status, conclusion, head_branch: branch || br, event: event || "push", actor: { login: "sample-dev" }, created_at: new Date(now - ago * m).toISOString(), run_started_at: new Date(now - ago * m).toISOString(), updated_at: new Date(now - (ago - mins) * m).toISOString(), run_attempt: 1, html_url: "#" });
  A.runs = [
    mk(9, "CI", "Add dark mode toggle", "in_progress", null, 2, 0, "feature/dark-mode"),
    mk(8, "CI", "Start the 1.1 cycle", "completed", "success", 50, 3, "develop"),
    mk(7, "Deploy", "Prepare 1.0 release", "completed", "failure", 190, 6),
    mk(6, "CI", "Prepare 1.0 release", "completed", "success", 195, 4),
    mk(5, "Nightly build", "Nightly build", "completed", "cancelled", 900, 12, null, "schedule"),
  ];
  A.total = 128; draw();
}

RA.onRepo((r) => { A.full = r.full_name; A.runs = []; clearTimeout(A.timer); if (RA.S.sample) sample(); else load(r.full_name); });
// Back on a kept repository page: bring the runs up to date (an unchanged list costs no requests)
RA.onRepoBack((r) => { A.full = r.full_name; clearTimeout(A.timer); if (!RA.S.sample) load(r.full_name); });
RA.addCommands([
  { id: "runWorkflow", label: "Actions: Run Workflow…", when: RA.isRepo, run: runDialog },
  { id: "actionsRefresh", label: "Actions: Refresh Runs", when: RA.isRepo, run: () => RA.S.sample ? sample() : load(A.full) },
]);
window.AtlasActions = { parseInputs };
})();
