(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : Number(n).toLocaleString();
const kb = (k) => k >= 1048576 ? (k / 1048576).toFixed(1) + " GB" : k >= 1024 ? (k / 1024).toFixed(1) + " MB" : k + " KB";
const bytes = (b) => kb(Math.round(b / 1024));
const DAY = 864e5;
const ago = (d) => {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  if (s < 86400 * 30) return Math.round(s / 86400) + "d ago";
  if (s < 86400 * 365) return Math.round(s / 86400 / 30) + "mo ago";
  return (s / 86400 / 365).toFixed(1).replace(/\.0$/, "") + "y ago";
};
const dateStr = (d) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
};

/* ---------------- Desktop bridge ---------------- */
// Inside the desktop app the token lives in the OS credential store (Windows Credential Manager).
// Opened as a plain web page, it falls back to this browser's local storage.
const T = window.__TAURI__;
const desktop = !!T;
const secrets = {
  where: desktop ? (/Windows/.test(navigator.userAgent) ? "Windows Credential Manager" : "your system keychain") : "this browser's local storage",
  async get() { return desktop ? await T.core.invoke("get_token") : store.get("ra.token"); },
  async set(t) { if (desktop) await T.core.invoke("set_token", { token: t }); else store.set("ra.token", t); },
  async clear() { if (desktop) await T.core.invoke("delete_token"); else store.set("ra.token", null); },
};
const openExternal = (url) => { if (desktop) T.opener.openUrl(url).catch(() => {}); else window.open(url, "_blank", "noopener"); };
const setTitle = (t) => { document.title = t; if (desktop) try { T.window.getCurrentWindow().setTitle(t).catch(() => {}); } catch {} };
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  toast("info", `Copied <span class="mono">${esc(text)}</span>`, 2500);
}

// GitHub linguist colors for common languages
const LANG = { JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5", Java: "#b07219", C: "#555555", "C++": "#f34b7d", "C#": "#178600", Go: "#00ADD8", Rust: "#dea584", Ruby: "#701516", PHP: "#4F5D95", Swift: "#F05138", Kotlin: "#A97BFF", Dart: "#00B4AB", HTML: "#e34c26", CSS: "#663399", SCSS: "#c6538c", Shell: "#89e051", "Jupyter Notebook": "#DA5B0B", Vue: "#41b883", Svelte: "#ff3e00", Lua: "#000080", R: "#198CE7", Scala: "#c22d40", Haskell: "#5e5086", Elixir: "#6e4a7e", Clojure: "#db5855", Dockerfile: "#384d54", Makefile: "#427819", PowerShell: "#012456", "Objective-C": "#438eff", Perl: "#0298c3", MATLAB: "#e16737", Julia: "#a270ba", Zig: "#ec915c", Nix: "#7e7eff", HCL: "#844FBA", TeX: "#3D6117", "Vim Script": "#199f4b", Assembly: "#6E4C13", Solidity: "#AA6746", Astro: "#ff5a03", MDX: "#fcb32c", GDScript: "#355570", Batchfile: "#C1F12E", CMake: "#DA3434", Erlang: "#B83998", OCaml: "#ef7a08", "F#": "#b845fc", Groovy: "#4298b8", Elm: "#60B5CC", Nim: "#ffc200", Crystal: "#000100", Fortran: "#4d41b1", "Visual Basic .NET": "#945db7", Processing: "#0096D8", Arduino: "#bd79d1" };
const langColor = (l) => {
  if (!l) return "var(--muted)";
  if (LANG[l]) return LANG[l];
  let h = 0; for (const c of l) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 52%)`;
};

// Small line icons in the spirit of VS Code's codicons
const I = {
  repo: '<svg viewBox="0 0 24 24"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
  fork: '<svg viewBox="0 0 24 24"><circle cx="6.5" cy="5" r="2"/><circle cx="17.5" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6.5 7v1.5a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3V7M12 11.5V17"/></svg>',
  archive: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="4.5" rx="1"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m7 9.5 5 5 5-5"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  dash: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="9" rx="1"/><rect x="13.5" y="3.5" width="7" height="5" rx="1"/><rect x="13.5" y="11.5" width="7" height="9" rx="1"/><rect x="3.5" y="15.5" width="7" height="5" rx="1"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M15.5 8.5V5.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3"/></svg>',
  key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/></svg>',
  branch: '<svg viewBox="0 0 24 24"><circle cx="6.5" cy="5" r="2"/><circle cx="6.5" cy="19" r="2"/><circle cx="17.5" cy="7" r="2"/><path d="M6.5 7v10M17.5 9c0 4-6 3-10 7.5"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17.2v.1"/></svg>',
  person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/></svg>',
  versus: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="7" height="14" rx="1.5"/><rect x="14" y="5" width="7" height="14" rx="1.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/></svg>',
  badge: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 14.5v-3M10.5 14.5v-5M14 14.5v-2M17.5 14.5V9"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5-10-6.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13M16 5.5v13"/></svg>',
  film: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5l1.5-2Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  rerun: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 6.5 8 6 8-6"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7-8.3-8.3Z"/><circle cx="8" cy="8" r="1.5"/></svg>',
  commit: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M3 12h5.5M15.5 12H21"/></svg>',
  issue: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.5"/></svg>',
  pr: '<svg viewBox="0 0 24 24"><circle cx="6" cy="5.5" r="2"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="18.5" r="2"/><path d="M6 7.5v9M18 16.5V9a3 3 0 0 0-3-3h-4M13 3.5 10.5 6 13 8.5"/></svg>',
  actions: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M10 8.5v7l5.5-3.5L10 8.5Z"/></svg>',
};

/* ---------------- State ---------------- */
const S = {
  user: null, repos: [], events: [], days: null, daysSource: "", sample: true, token: "", me: null, tokenBad: false,
  rank: "stargazers_count", langMode: "count", langBytes: null, langBytesLoading: false,
  topic: null, collapsed: new Set(store.json("ra.collapsed", [])),
};

/* ---------------- API ---------------- */
class ApiError extends Error { constructor(status, msg, reset) { super(msg); this.status = status; this.reset = reset; } }
let rateReset = null, rateLeft = null;
// GET responses are kept for the session so switching tabs is instant; Refresh (F5) clears it
const cache = new Map();
function noteRate(res) {
  const rem = res.headers.get("x-ratelimit-remaining"), lim = res.headers.get("x-ratelimit-limit"), reset = res.headers.get("x-ratelimit-reset");
  if (rem == null) return;
  if (res.headers.get("x-ratelimit-resource") === "graphql") return;
  rateReset = reset ? new Date(reset * 1000) : null; rateLeft = +rem;
  const el = $("rate");
  el.textContent = `API ${rem}/${lim}`;
  el.title = `GitHub API requests left this hour${rateReset ? `, resets at ${rateReset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`;
  el.classList.toggle("low", rem / lim < 0.15);
}
// fresh: skip the session cache and ask GitHub again. The browser sends the ETag it has, so an unchanged answer
// comes back as 304, which doesn't count against the rate limit. Background checks and live run lists use this.
async function gh(path, opts = {}) {
  const url = path.startsWith("http") ? path : "https://api.github.com" + path;
  const method = opts.method || "GET", key = method === "GET" ? url : null;
  if (key && !opts.fresh && cache.has(key)) return cache.get(key);
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (S.token) headers.Authorization = "Bearer " + S.token;
  const res = await fetch(url, { headers, method, body: opts.body, cache: opts.fresh ? "no-cache" : "default" });
  noteRate(res);
  if (res.status === 202) return { pending: true };
  if (res.status === 204) return { data: [] };
  if (!res.ok) {
    let msg = ""; try { msg = (await res.json()).message || ""; } catch {}
    throw new ApiError(res.status, msg, res.headers.get("x-ratelimit-remaining") === "0" ? rateReset : null);
  }
  // Some writes (re-running a workflow) answer with an empty body
  const text = await res.text();
  const out = { data: text ? JSON.parse(text) : {} };
  if (key) cache.set(key, out);
  return out;
}
async function paged(path, onPage) {
  const out = [];
  for (let p = 1; p <= 15; p++) {
    const sep = path.includes("?") ? "&" : "?";
    const { data } = await gh(`${path}${sep}per_page=100&page=${p}`);
    out.push(...data);
    onPage && onPage(p, out.length);
    if (data.length < 100) break;
  }
  return out;
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}
function explain(e, login) {
  if (e instanceof ApiError) {
    if (e.status === 404) return `No GitHub user or organization is called “${esc(login)}”. Check the spelling.`;
    if (e.status === 401) return "GitHub rejected the saved token. Open Settings (Ctrl+,) to replace or remove it.";
    if (e.status === 403 || e.status === 429) {
      const when = e.reset ? ` It resets at ${e.reset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "";
      return `GitHub's rate limit is used up.${when} Adding a token in Settings raises the limit from 60 to 5,000 requests an hour.`;
    }
    return `GitHub returned ${e.status}${e.message ? ": " + esc(e.message) : ""}.`;
  }
  return "Couldn't reach GitHub. Check your connection and try again.";
}

/* ---------------- Feedback: banner, busy indicator, notifications ---------------- */
function notice(kind, html) {
  const n = $("notice");
  if (!kind) { n.hidden = true; return; }
  n.hidden = false; n.className = "notice " + kind; n.innerHTML = html;
}
let busyCount = 0;
function busy(text) {
  if (text) { $("sBusy").innerHTML = `<i class="spin"></i>${text}`; $("sBusy").hidden = false; $("progress").hidden = false; }
  else { $("sBusy").hidden = true; $("progress").hidden = busyCount > 0; }
}
function toast(kind, html, ms) {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = `<span class="ti">${kind === "error" ? "!" : kind === "warn" ? "!" : "i"}</span><div class="tb">${html}</div><button type="button" class="ib" aria-label="Dismiss">${I.close}</button>`;
  el.querySelector("button").onclick = () => el.remove();
  $("toasts").append(el);
  while ($("toasts").children.length > 3) $("toasts").firstChild.remove();
  setTimeout(() => el.remove(), ms || (kind === "error" ? 12000 : 6000));
}

/* ---------------- Loading ---------------- */
let loading = false;
async function load(input) {
  const parts = String(input || "").trim().replace(/^@/, "").replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").split("/").filter(Boolean);
  const login = parts[0] || ""; const repoName = parts[1] || null;
  if (!login || loading) return;
  loading = true; busyCount++;
  busy(`Loading @${esc(login)}…`);
  try {
    const { data: user } = await gh(`/users/${encodeURIComponent(login)}`);
    const me = S.me;
    let path;
    if (me && me.login.toLowerCase() === user.login.toLowerCase()) path = "/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed";
    else if (user.type === "Organization") path = `/orgs/${user.login}/repos?type=all&sort=pushed`;
    else path = `/users/${user.login}/repos?type=owner&sort=pushed`;
    const repos = (await paged(path, (p, n) => busy(`Loading @${esc(user.login)}… ${n} repositories`))).map((r) => ({ ...r }));
    for (const r of repos) r.shared = !!r.owner && r.owner.login.toLowerCase() !== user.login.toLowerCase();
    let events = [];
    // GitHub serves at most 300 public events (3 pages)
    for (let p = 1; p <= 3; p++) {
      try { const { data } = await gh(`/users/${user.login}/events/public?per_page=100&page=${p}`); events.push(...data); if (data.length < 100) break; } catch { break; }
    }
    let days = null, daysSource = "";
    if (S.token && user.type === "User") {
      try { days = await contributionCalendar(user.login); daysSource = "calendar"; } catch {}
    }
    if (!days) { days = eventsToDays(events); daysSource = "events"; }

    const switched = !S.user || S.user.login !== user.login || S.sample;
    Object.assign(S, { user, repos, events: events.slice(0, 300), days, daysSource, sample: false, langBytes: null, langMode: "count" });
    if (switched) { S.topic = null; resetFilters(); closeRepoTabs(); }
    store.set("ra.user", user.login);
    remember(user);
    notice(null);
    renderAll();
    if (S.token && me && path.startsWith("/user/repos") && !repos.some((r) => r.private))
      toast("warn", "Your token works but can't see any private repositories. On GitHub, edit the token and set Repository access to All repositories, with Contents: Read-only.");
    if (repoName) await openByName(user.login, repoName);
  } catch (e) {
    console.error(e);
    toast("error", explain(e, login));
  } finally { loading = false; busyCount--; busy(null); }
}
async function openByName(owner, name) {
  let r = S.repos.find((x) => x.full_name.toLowerCase() === `${owner}/${name}`.toLowerCase());
  if (!r) {
    try { r = { ...(await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`)).data, shared: true }; S.repos.push(r); fillLangSelect(); renderTree(); }
    catch (e) { toast("error", e.status === 404 ? `Can't find ${esc(owner)}/${esc(name)}. If it's private, make sure your token has access to it.` : explain(e)); return; }
  }
  openRepo(r.full_name, true);
}
async function contributionCalendar(login) {
  const query = `query($l:String!){user(login:$l){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}`;
  const { data } = await gh("/graphql", { method: "POST", body: JSON.stringify({ query, variables: { l: login } }) });
  const cal = data?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) throw new Error("no calendar");
  return cal.weeks.flatMap((w) => w.contributionDays).map((d) => ({ date: d.date, count: d.contributionCount }));
}
function eventsToDays(events) {
  const counts = {};
  for (const e of events) {
    const d = e.created_at.slice(0, 10);
    const n = e.type === "PushEvent" ? (e.payload?.size || e.payload?.distinct_size || 1) : 1;
    counts[d] = (counts[d] || 0) + n;
  }
  const out = [], end = new Date(); end.setUTCHours(0, 0, 0, 0);
  for (let t = end - 90 * DAY; t <= +end; t += DAY) { const d = new Date(t).toISOString().slice(0, 10); out.push({ date: d, count: counts[d] || 0 }); }
  return out;
}
function refresh() {
  cache.clear();
  if (S.sample) { toast("info", "This is sample data. Load an account with Ctrl+O."); return; }
  load(S.user.login).then(() => { const t = activeTab(); if (t?.kind === "repo") renderRepo(t.full); });
}

/* ---------------- Links ---------------- */
// The same files run as a web page on GitHub Pages; links there open straight to an account, a repository or a comparison
const WEB_HOME = "https://sand-runner-75.github.io/repo-atlas/";
const webBase = () => !desktop && /^https?:$/.test(location.protocol) ? location.origin + location.pathname : WEB_HOME;
function linkFor(o = {}) {
  const p = new URLSearchParams();
  if (o.user) p.set("u", o.repo ? `${o.user}/${o.repo}` : o.user);
  if (o.vs) p.set("vs", o.vs);
  const q = p.toString().replace(/%2F/g, "/");
  return webBase() + (q ? "?" + q : "");
}
function currentLink() {
  if (!S.user || S.sample) return webBase();
  const t = activeTab();
  if (t?.kind === "repo") { const [o, n] = t.full.split("/"); return linkFor({ user: o, repo: n }); }
  if (t?.kind === "compare" && window.AtlasCompare?.other()) return linkFor({ user: S.user.login, vs: window.AtlasCompare.other() });
  return linkFor({ user: S.user.login });
}
function syncUrl() {
  if (desktop || !/^https?:$/.test(location.protocol) || S.sample) return;
  const want = new URL(currentLink()).search;
  if (location.search !== want) history.replaceState(null, "", location.pathname + want);
}
function linkRequest() {
  const p = new URLSearchParams(location.search);
  const u = (p.get("u") || p.get("user") || "").trim();
  return u ? { u, vs: (p.get("vs") || "").trim() || null } : null;
}

/* ---------------- Token ---------------- */
async function useToken(t) {
  S.token = t || ""; S.me = null; S.tokenBad = false; cache.clear();
  if (S.token) {
    try { S.me = (await gh("/user")).data; }
    catch (e) { if (e.status === 401) S.tokenBad = true; }
  }
  renderToken();
}
function renderToken() {
  const st = $("tokenState"), sb = $("sToken");
  if (!S.token) {
    st.className = "tstate"; st.innerHTML = `<i class="led"></i>No token saved. Public data only, 60 requests an hour.`;
    sb.innerHTML = `${I.key}Add token`;
  } else if (S.tokenBad) {
    st.className = "tstate bad"; st.innerHTML = `<i class="led"></i>GitHub rejected the saved token. Paste a new one or remove it.`;
    sb.innerHTML = `${I.key}Token rejected`;
  } else {
    st.className = "tstate ok"; st.innerHTML = `<i class="led"></i>Signed in as <b>@${esc(S.me?.login || "unknown")}</b>`;
    sb.innerHTML = `${I.key}@${esc(S.me?.login || "token")}`;
  }
  $("tokenWhere").textContent = `Saved in ${secrets.where}${desktop ? ", never in a file or this app's storage" : ""}. It is only sent to api.github.com.`;
  $("addToken").hidden = !!S.token && !S.tokenBad;
  $("addToken").innerHTML = `${I.key}${S.tokenBad ? "Fix GitHub token" : "Add GitHub token"}`;
  if (S.sample && S.user) renderAllNotice();
  $("token").value = "";
  $("token").placeholder = S.token ? "Paste a new token to replace the saved one" : "github_pat_… or ghp_…";
}

/* ---------------- Recent accounts ---------------- */
function remember(u) {
  const list = store.json("ra.recent", []).filter((x) => x.login.toLowerCase() !== u.login.toLowerCase());
  list.unshift({ login: u.login, name: u.name || "", avatar: u.avatar_url || "", type: u.type, at: Date.now() });
  store.set("ra.recent", JSON.stringify(list.slice(0, 12)));
  renderRecent();
}
function renderRecent() {
  const list = store.json("ra.recent", []);
  $("recent").innerHTML = list.length ? list.map((u) => `<div class="row${S.user && !S.sample && S.user.login === u.login ? " sel" : ""}" data-load="${esc(u.login)}" title="Load @${esc(u.login)}">
      ${u.avatar ? `<img src="${esc(u.avatar)}&s=48" alt="">` : `<span class="av">${esc(u.login[0].toUpperCase())}</span>`}
      <span class="rn"><b>${esc(u.name || u.login)}</b><span>@${esc(u.login)}${u.type === "Organization" ? " · organization" : ""} · ${ago(u.at)}</span></span></div>`).join("")
    : `<div class="shint">Accounts you load show up here.</div>`;
}

/* ---------------- Sample data ---------------- */
function sampleData() {
  let seed = 7; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const names = ["trailhead-cli", "tiny-tensor", "dotfiles", "weather-station", "budget-buddy", "markdown-garden", "rust-raytracer", "pixel-sorter", "api-gateway-lite", "home-automation", "chess-engine", "notes-sync", "portfolio-site", "leetcode-journal", "k8s-playground", "spotify-stats", "ocr-receipts", "go-url-shortener", "habit-tracker", "terraform-modules", "discord-bot", "audio-visualizer", "csv-to-charts", "neural-style", "react-hooks-kit", "flask-blog", "game-of-life", "vim-config", "esp32-sensors", "awesome-shaders"];
  const langs = ["TypeScript", "TypeScript", "Python", "Python", "Python", "Rust", "Go", "JavaScript", "JavaScript", "Shell", "C++", "HTML", "Jupyter Notebook", "HCL", "Vim Script"];
  const topicsPool = ["cli", "machine-learning", "react", "iot", "rust", "golang", "visualization", "productivity", "self-hosted", "devops", "game", "api", "terraform", "raytracing", "automation"];
  const licenses = [null, "MIT License", "MIT License", "MIT License", "Apache License 2.0", "GNU General Public License v3.0", "BSD 3-Clause \"New\" or \"Revised\" License"];
  const now = Date.now();
  const repos = names.map((name, i) => {
    const created = now - (60 + rnd() * 2900) * DAY;
    const pushed = Math.min(now - rnd() * 40 * DAY, created + rnd() * (now - created) + 30 * DAY);
    const fork = rnd() < 0.18, arch = !fork && rnd() < 0.12, priv = rnd() < 0.15;
    const pop = Math.pow(rnd(), 3);
    const lang = name === "dotfiles" ? "Shell" : name === "vim-config" ? "Vim Script" : pick(langs);
    const tp = []; for (let k = 0; k < Math.floor(rnd() * 4); k++) { const t = pick(topicsPool); if (!tp.includes(t)) tp.push(t); }
    return {
      id: i, name, full_name: "sample-dev/" + name, html_url: "#", clone_url: `https://github.com/sample-dev/${name}.git`, private: priv, fork, archived: arch,
      description: `Example project: ${name.replace(/-/g, " ")}.`, language: lang,
      stargazers_count: fork ? 0 : Math.round(pop * 1800), forks_count: fork ? 0 : Math.round(pop * 260 * rnd()),
      open_issues_count: Math.round(pop * 40 * rnd()), size: Math.round(50 + rnd() * rnd() * 90000),
      created_at: new Date(created).toISOString(), pushed_at: new Date(pushed).toISOString(), updated_at: new Date(pushed).toISOString(),
      topics: tp, license: licenses[Math.floor(rnd() * licenses.length)] ? { name: licenses[Math.floor(rnd() * (licenses.length - 1)) + 1] } : null,
      default_branch: rnd() < 0.7 ? "main" : "master", homepage: "", watchers_count: 0, is_template: rnd() < 0.05,
    };
  });
  const evTypes = ["PushEvent", "PushEvent", "PushEvent", "PushEvent", "PullRequestEvent", "IssuesEvent", "IssueCommentEvent", "CreateEvent", "WatchEvent", "PullRequestReviewEvent", "ReleaseEvent"];
  const events = Array.from({ length: 160 }, () => {
    const r = pick(repos.slice(0, 14));
    return { type: pick(evTypes), created_at: new Date(now - Math.pow(rnd(), 1.4) * 89 * DAY).toISOString(), repo: { name: r.full_name }, payload: { size: 1 + Math.floor(rnd() * 5), action: pick(["opened", "closed"]), ref_type: "branch" } };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const days = []; const end = new Date(); end.setUTCHours(0, 0, 0, 0);
  for (let t = end - 364 * DAY; t <= +end; t += DAY) { const wk = new Date(t).getUTCDay() % 6 === 0; const v = rnd(); days.push({ date: new Date(t).toISOString().slice(0, 10), count: v < (wk ? 0.65 : 0.25) ? 0 : Math.round(Math.pow(rnd(), 2) * 14) + 1 }); }
  const user = { login: "sample-dev", name: "Sample Developer", type: "User", bio: "Invented example data so you can see every view. Press Ctrl+O to load your own account.", followers: 312, following: 48, public_repos: repos.filter((r) => !r.private).length, created_at: new Date(now - 3000 * DAY).toISOString(), location: "Anywhere", company: null, blog: "", avatar_url: null, html_url: "#" };
  return { user, repos, events, days };
}

/* ---------------- Render: summary ---------------- */
function renderProfile() {
  const u = S.user;
  const avatar = u.avatar_url ? `<img class="avatar" src="${esc(u.avatar_url)}&s=160" alt="">` : `<div class="avatar">${esc((u.name || u.login)[0].toUpperCase())}</div>`;
  const bits = [
    u.type === "Organization" ? "<span>Organization</span>" : "",
    u.followers != null ? `<span><b>${fmt(u.followers)}</b> followers</span>` : "",
    u.following != null && u.type !== "Organization" ? `<span><b>${fmt(u.following)}</b> following</span>` : "",
    u.location ? `<span>${esc(u.location)}</span>` : "",
    u.company ? `<span>${esc(u.company)}</span>` : "",
    `<span>On GitHub since <b>${new Date(u.created_at).getFullYear()}</b></span>`,
    u.blog ? `<span><a href="${esc(/^https?:/.test(u.blog) ? u.blog : "https://" + u.blog)}">${esc(u.blog.replace(/^https?:\/\//, ""))}</a></span>` : "",
  ].join("");
  $("profile").innerHTML = `${avatar}<div class="who"><h1>${esc(u.name || u.login)}</h1>
    <div class="login">${S.sample ? "@" + esc(u.login) : `<a href="${esc(u.html_url)}">@${esc(u.login)}</a>`}</div>
    ${u.bio ? `<p>${esc(u.bio)}</p>` : ""}<div class="meta">${bits}</div></div>
    <div class="pacts"><button type="button" class="btn primary" data-cmd="share" title="Make a picture of this profile to post">${I.share}Share</button>
      <button type="button" class="btn" data-cmd="compare" title="Put this account side by side with another">${I.versus}Compare</button>
      <button type="button" class="btn" data-cmd="badge" title="A stats card for a GitHub profile README">${I.badge}README badge</button>${S.me && !S.sample && S.me.login === u.login ? `
      <button type="button" class="btn" data-cmd="sponsors" title="Thank your GitHub sponsors on X">${I.heart}Sponsors</button>` : ""}</div>`;
}
function renderKpis() {
  const R = S.repos, own = R.filter((r) => !r.fork);
  const stars = own.reduce((a, r) => a + r.stargazers_count, 0);
  const forks = own.reduce((a, r) => a + r.forks_count, 0);
  const issues = own.reduce((a, r) => a + r.open_issues_count, 0);
  const size = R.reduce((a, r) => a + r.size, 0);
  const top = [...own].sort((a, b) => b.stargazers_count - a.stargazers_count)[0];
  const active = R.filter((r) => Date.now() - new Date(r.pushed_at) < 30 * DAY).length;
  const langs = new Set(own.map((r) => r.language).filter(Boolean));
  const priv = R.filter((r) => r.private).length;
  const contrib = S.days ? S.days.reduce((a, d) => a + d.count, 0) : 0;
  const k = [
    ["Repositories", fmt(R.length), `${own.length} original · ${R.length - own.length} forks${priv ? ` · ${priv} private` : ""}`],
    ["Stars earned", fmt(stars), `${fmt(forks)} forks by others${top && top.stargazers_count ? ` · most on ${top.name}` : ""}`],
    ["Open issues + PRs", fmt(issues), "Across original repos"],
    ["Active last 30 days", fmt(active), `${R.length ? Math.round(active / R.length * 100) : 0}% of all repos`],
    ["Languages", fmt(langs.size), `Total size ${kb(size)}`],
    [S.daysSource === "calendar" ? "Contributions, 1 year" : "Event activity, 90 days", fmt(contrib), S.daysSource === "calendar" ? "From the contribution calendar" : "Commits and actions in public events"],
  ];
  $("kpis").innerHTML = k.map(([a, b, c]) => `<div class="kpi"><div class="k">${a}</div><div class="v">${b}</div><div class="s" title="${esc(c)}">${esc(c)}</div></div>`).join("");
}

/* ---------------- Render: languages ---------------- */
function langEntries() {
  const m = {};
  if (S.langMode === "bytes" && S.langBytes) for (const [l, b] of Object.entries(S.langBytes)) m[l] = b;
  else for (const r of S.repos) if (!r.fork && r.language) m[r.language] = (m[r.language] || 0) + 1;
  let e = Object.entries(m).sort((a, b) => b[1] - a[1]);
  if (e.length > 9) { const rest = e.slice(8).reduce((a, x) => a + x[1], 0); e = [...e.slice(0, 8), ["Other", rest]]; }
  return e;
}
function renderLangs() {
  $("langCount").setAttribute("aria-pressed", S.langMode === "count");
  $("langBytes").setAttribute("aria-pressed", S.langMode === "bytes");
  if (S.langMode === "bytes" && S.langBytesLoading) { $("langs").innerHTML = `<div class="empty">Measuring code in each repository…</div>`; return; }
  const e = langEntries(); const total = e.reduce((a, x) => a + x[1], 0);
  if (!total) { $("langs").innerHTML = `<div class="empty">No language data yet.</div>`; return; }
  const R = 64, C = 2 * Math.PI * R; let off = 0;
  const arcs = e.map(([l, v]) => {
    const len = v / total * C;
    const s = `<circle r="${R}" cx="75" cy="75" fill="none" stroke="${l === "Other" ? "var(--line-strong)" : langColor(l)}" stroke-width="18" stroke-dasharray="${Math.max(0, len - 1.2)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 75 75)" data-tip="${esc(l)}\n${S.langMode === "bytes" ? bytes(v) : v + " repos"} · ${(v / total * 100).toFixed(1)}%"></circle>`;
    off += len; return s;
  }).join("");
  const unit = S.langMode === "bytes" ? bytes(total) : total + " repos";
  const max = e[0][1];
  $("langs").innerHTML = `<div class="lang-wrap"><div class="chart" style="max-width:140px"><svg viewBox="0 0 150 150" role="img" aria-label="Language share">${arcs}
    <text x="75" y="72" text-anchor="middle" style="font:600 20px var(--f-display);fill:var(--ink-strong)">${e.length > 8 ? "9+" : e.length}</text>
    <text x="75" y="90" text-anchor="middle">${S.langMode === "bytes" ? esc(unit) : "languages"}</text></svg></div>
    <div class="bars">${e.map(([l, v]) => `<div class="brow${l !== "Other" ? " click" : ""}" ${l !== "Other" ? `data-lang="${esc(l)}"` : ""}><span class="lbl"><i class="dot" style="background:${l === "Other" ? "var(--line-strong)" : langColor(l)}"></i>${esc(l)}</span><span class="trk"><span class="fil" style="display:block;width:${v / max * 100}%;background:${l === "Other" ? "var(--muted)" : langColor(l)}"></span></span><span class="val">${(v / total * 100).toFixed(1)}%</span></div>`).join("")}</div></div>`;
  $("langNote").textContent = S.langMode === "bytes" ? "Bytes of code per language, summed across original repositories." : "Primary language of each original repository. Click one to filter the sidebar.";
}
async function loadLangBytes() {
  S.langMode = "bytes";
  if (S.langBytes) return renderLangs();
  const own = S.repos.filter((r) => !r.fork);
  if (S.sample) {
    const m = {}; for (const r of own) if (r.language) { m[r.language] = (m[r.language] || 0) + r.size * 900; m.Shell = (m.Shell || 0) + 4000; m.Dockerfile = (m.Dockerfile || 0) + 800; }
    S.langBytes = m; return renderLangs();
  }
  if (!S.token && own.length > 40) {
    S.langMode = "count"; renderLangs();
    toast("warn", `Measuring code size needs one request per repository (${own.length} here), which is more than GitHub allows without a token. Add a token in Settings (Ctrl+,) to use this view.`);
    return;
  }
  S.langBytesLoading = true; renderLangs(); busyCount++; busy("Measuring code size…");
  const m = {};
  try {
    await pool(own.slice(0, 300), 6, async (r) => {
      try { const { data } = await gh(`/repos/${r.full_name}/languages`); for (const [l, b] of Object.entries(data)) m[l] = (m[l] || 0) + b; } catch (e) { if (e.status === 403 || e.status === 429) throw e; }
    });
    S.langBytes = m;
  } catch (e) { S.langMode = "count"; toast("error", explain(e)); }
  S.langBytesLoading = false; busyCount--; busy(null); renderLangs();
}

/* ---------------- Render: heatmap ---------------- */
function renderHeat() {
  const days = S.days || [];
  const box = $("heat");
  if (!days.length) { box.innerHTML = `<div class="empty">No recent activity.</div>`; return; }
  const total = days.reduce((a, d) => a + d.count, 0);
  $("heatSub").textContent = S.daysSource === "calendar" ? `${fmt(total)} contributions in the last year` : `${fmt(total)} actions in the last 90 days · add a token for the full year`;
  const nz = days.map((d) => d.count).filter(Boolean).sort((a, b) => a - b);
  const q = [0.25, 0.5, 0.75].map((p) => nz[Math.floor(p * (nz.length - 1))] || 1);
  const lvl = (c) => c === 0 ? 0 : c <= q[0] ? 1 : c <= q[1] ? 2 : c <= q[2] ? 3 : 4;
  const fill = (l) => l === 0 ? "var(--heat-0)" : `color-mix(in srgb, var(--heat) ${[0, 35, 58, 80, 100][l]}%, var(--heat-0))`;
  const first = new Date(days[0].date + "T00:00:00Z"), pad = first.getUTCDay();
  const weeks = Math.ceil((days.length + pad) / 7);
  const cs = 11, g = 3, left = 28, top = 18;
  const W = left + weeks * (cs + g), H = top + 7 * (cs + g);
  let cells = "", months = "", lastM = -1;
  days.forEach((d, i) => {
    const idx = i + pad, w = Math.floor(idx / 7), dow = idx % 7;
    const x = left + w * (cs + g), y = top + dow * (cs + g);
    cells += `<rect x="${x}" y="${y}" width="${cs}" height="${cs}" rx="2" fill="${fill(lvl(d.count))}" data-tip="${d.count} ${S.daysSource === "calendar" ? "contribution" : "action"}${d.count === 1 ? "" : "s"}\n${dateStr(d.date + "T12:00:00Z")}"></rect>`;
    const m = new Date(d.date + "T00:00:00Z").getUTCMonth();
    if (m !== lastM && dow <= 3) { months += `<text x="${x}" y="11">${new Date(d.date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })}</text>`; lastM = m; }
  });
  const dl = ["", "Mon", "", "Wed", "", "Fri", ""].map((t, i) => t ? `<text x="0" y="${top + i * (cs + g) + 9}">${t}</text>` : "").join("");
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 640)}px;max-width:${W * 1.3}px" role="img" aria-label="Activity heatmap">${months}${dl}${cells}</svg>`;
  $("heatLegend").innerHTML = `<span>Less</span>${[0, 1, 2, 3, 4].map((l) => `<i class="dot" style="border-radius:2px;background:${fill(l)}"></i>`).join("")}<span>More</span>
    <span style="margin-left:auto">Busiest day: <b>${(() => { const b = days.reduce((a, d) => d.count > a.count ? d : a, days[0]); return b.count ? `${b.count} on ${dateStr(b.date + "T12:00:00Z")}` : "–"; })()}</b></span>`;
}

/* ---------------- Render: rankings ---------------- */
function renderRank() {
  document.querySelectorAll("#rankSeg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === S.rank));
  const m = S.rank;
  const list = S.repos.filter((r) => m === "size" || !r.fork).sort((a, b) => b[m] - a[m]).slice(0, 10).filter((r) => r[m] > 0);
  if (!list.length) { $("rank").innerHTML = `<div class="empty">Nothing to rank here yet.</div>`; return; }
  const max = list[0][m];
  $("rank").innerHTML = list.map((r) => `<div class="brow click" data-repo="${esc(r.full_name)}"><span class="lbl"><i class="dot" style="background:${langColor(r.language)}"></i>${esc(r.name)}</span><span class="trk"><span class="fil" style="display:block;width:${r[m] / max * 100}%"></span></span><span class="val">${m === "size" ? kb(r.size) : fmt(r[m])}</span></div>`).join("");
}

/* ---------------- Render: years ---------------- */
function renderYears() {
  const box = $("years"); const W = Math.max(280, box.clientWidth), H = 200, pl = 30, pb = 22, pt = 10;
  const R = S.repos; if (!R.length) { box.innerHTML = `<div class="empty">No repositories.</div>`; return; }
  const y0 = Math.min(...R.map((r) => new Date(r.created_at).getFullYear())), y1 = new Date().getFullYear();
  const years = []; for (let y = y0; y <= y1; y++) years.push({ y, src: 0, fork: 0 });
  for (const r of R) { const o = years[new Date(r.created_at).getFullYear() - y0]; r.fork ? o.fork++ : o.src++; }
  const max = Math.max(1, ...years.map((o) => o.src + o.fork));
  const step = max <= 5 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : Math.ceil(max / 5 / 5) * 5;
  const top = Math.ceil(max / step) * step;
  const sy = (v) => pt + (H - pt - pb) * (1 - v / top);
  const bw = (W - pl) / years.length;
  let grid = ""; for (let v = 0; v <= top; v += step) grid += `<line x1="${pl}" x2="${W}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line-strong)" ${v ? 'stroke-dasharray="2 3"' : ""}></line><text x="${pl - 6}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`;
  const labelEvery = Math.ceil(years.length / Math.floor((W - pl) / 38));
  const bars = years.map((o, i) => {
    const x = pl + i * bw + bw * 0.18, w = bw * 0.64;
    const tip = `${o.y}\n${o.src} original · ${o.fork} fork${o.fork === 1 ? "" : "s"}`;
    return `<g data-tip="${tip}"><rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent"></rect>
      ${o.src ? `<rect x="${x}" y="${sy(o.src)}" width="${w}" height="${sy(0) - sy(o.src)}" rx="2" fill="var(--accent)"></rect>` : ""}
      ${o.fork ? `<rect x="${x}" y="${sy(o.src + o.fork)}" width="${w}" height="${sy(o.src) - sy(o.src + o.fork)}" rx="2" fill="var(--muted)" opacity=".45"></rect>` : ""}
      ${i % labelEvery === 0 || i === years.length - 1 ? `<text x="${pl + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${years.length > 8 ? "’" + String(o.y).slice(2) : o.y}</text>` : ""}</g>`;
  }).join("");
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Repositories created per year">${grid}${bars}</svg>`;
}

/* ---------------- Render: lifespans ---------------- */
function renderLife() {
  const box = $("life");
  const R = [...S.repos].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (!R.length) { box.innerHTML = `<div class="empty">No repositories.</div>`; return; }
  const W = Math.max(320, box.clientWidth), lw = Math.min(170, W * 0.32), rh = 18, top = 22, H = top + R.length * rh + 4;
  const t0 = new Date(R[0].created_at).getTime(), t1 = Date.now();
  const sx = (t) => lw + (W - lw - 8) * (t - t0) / (t1 - t0 || 1);
  let axis = "";
  const y0 = new Date(t0).getFullYear() + 1, y1 = new Date().getFullYear();
  const ystep = Math.max(1, Math.ceil((y1 - y0 + 1) / Math.floor((W - lw) / 50)));
  for (let y = y0; y <= y1; y += ystep) { const x = sx(new Date(y, 0, 1).getTime()); axis += `<line x1="${x}" x2="${x}" y1="${top - 6}" y2="${H}" stroke="var(--line-strong)"></line><text x="${x + 3}" y="12">${y}</text>`; }
  const maxChars = Math.floor(lw / 7);
  const rows = R.map((r, i) => {
    const y = top + i * rh, a = sx(new Date(r.created_at).getTime()), b = Math.max(a + 3, sx(new Date(r.pushed_at).getTime()));
    const nm = r.name.length > maxChars ? r.name.slice(0, maxChars - 1) + "…" : r.name;
    const span = Math.round((new Date(r.pushed_at) - new Date(r.created_at)) / DAY);
    return `<g data-repo="${esc(r.full_name)}" style="cursor:pointer" data-tip="${esc(r.name)}${r.fork ? " (fork)" : ""}\nCreated ${dateStr(r.created_at)}\nLast push ${dateStr(r.pushed_at)} · ${span} days active">
      <rect x="0" y="${y}" width="${W}" height="${rh}" fill="transparent"></rect>
      <text x="0" y="${y + 12.5}" style="fill:var(--ink)">${esc(nm)}</text>
      <rect x="${a}" y="${y + 4}" width="${b - a}" height="${rh - 8}" rx="3" fill="${langColor(r.language)}" opacity="${r.archived || r.fork ? 0.4 : 0.9}"></rect>
      <circle cx="${b}" cy="${y + rh / 2}" r="3" fill="${langColor(r.language)}"></circle></g>`;
  }).join("");
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Project lifespans">${axis}${rows}</svg>`;
}

/* ---------------- Render: scatter ---------------- */
function renderScatter() {
  const box = $("scatter"); const W = Math.max(300, box.clientWidth), H = 300, pl = 40, pb = 26, pt = 14, pr = 16;
  const R = S.repos.filter((r) => !r.fork);
  if (!R.length) { box.innerHTML = `<div class="empty">No original repositories.</div>`; return; }
  const t0 = Math.min(...R.map((r) => +new Date(r.pushed_at))) - 10 * DAY, t1 = Date.now() + 5 * DAY;
  const maxS = Math.max(1, ...R.map((r) => r.stargazers_count));
  const sx = (t) => pl + (W - pl - pr) * (t - t0) / (t1 - t0);
  const sy = (v) => pt + (H - pt - pb) * (1 - Math.sqrt(v) / Math.sqrt(maxS));
  const maxSize = Math.max(1, ...R.map((r) => r.size));
  const rr = (s) => 3 + 11 * Math.sqrt(s / maxSize);
  const ticks = [0, ...[1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000].filter((v) => v <= maxS)];
  const show = ticks.filter((v, i) => i === 0 || sy(ticks[i - 1]) - sy(v) > 18 || v === ticks[ticks.length - 1]);
  let grid = show.map((v) => `<line x1="${pl}" x2="${W - pr}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line-strong)" ${v ? 'stroke-dasharray="2 3"' : ""}></line><text x="${pl - 6}" y="${sy(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join("");
  const span = (t1 - t0) / DAY; const xt = [];
  if (span > 600) { for (let y = new Date(t0).getFullYear() + 1; y <= new Date().getFullYear(); y++) xt.push([new Date(y, 0, 1), String(y)]); }
  else { const d = new Date(t0); d.setDate(1); d.setMonth(d.getMonth() + 1); for (; d < t1; d.setMonth(d.getMonth() + (span > 200 ? 2 : 1))) xt.push([new Date(d), d.toLocaleDateString(undefined, { month: "short", year: "2-digit" })]); }
  const every = Math.max(1, Math.ceil(xt.length / Math.floor((W - pl) / 56)));
  grid += xt.filter((_, i) => i % every === 0).map(([d, l]) => `<text x="${sx(+d)}" y="${H - 6}" text-anchor="middle">${l}</text><line x1="${sx(+d)}" x2="${sx(+d)}" y1="${H - pb}" y2="${H - pb + 4}" stroke="var(--line-strong)"></line>`).join("");
  const pts = [...R].sort((a, b) => b.size - a.size).map((r) => `<circle cx="${sx(+new Date(r.pushed_at))}" cy="${sy(r.stargazers_count)}" r="${rr(r.size)}" fill="${langColor(r.language)}" fill-opacity=".75" stroke="var(--surface)" stroke-width="1" style="cursor:pointer" data-repo="${esc(r.full_name)}" data-tip="${esc(r.name)}\n★ ${fmt(r.stargazers_count)} · ${kb(r.size)}\nLast push ${ago(r.pushed_at)}"></circle>`).join("");
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Stars against last push date"><line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" stroke="var(--line-strong)"></line>${grid}${pts}
    <text x="${pl}" y="${pt - 3}">★ stars</text><text x="${W - pr}" y="${H - pb - 6}" text-anchor="end">last push →</text></svg>`;
}

/* ---------------- Render: composition, topics, feed ---------------- */
function renderComposition() {
  const R = S.repos, n = R.length || 1;
  const parts = [
    ["Original", R.filter((r) => !r.fork && !r.archived).length, "var(--accent)"],
    ["Fork", R.filter((r) => r.fork && !r.archived).length, "color-mix(in srgb, var(--muted) 55%, var(--surface))"],
    ["Archived", R.filter((r) => r.archived).length, "var(--bad)"],
  ];
  const priv = R.filter((r) => r.private).length, tmpl = R.filter((r) => r.is_template).length;
  $("types").innerHTML = `<div class="stack">${parts.map(([l, v, c]) => v ? `<div style="width:${v / n * 100}%;background:${c}" data-tip="${l}: ${v}"></div>` : "").join("")}</div>
    <div class="legend" style="margin-top:8px">${parts.map(([l, v, c]) => `<span><i class="dot" style="background:${c}"></i>${l} <b>${v}</b></span>`).join("")}<span>Private <b>${priv}</b></span>${tmpl ? `<span>Templates <b>${tmpl}</b></span>` : ""}</div>`;
  const lic = {}; for (const r of R.filter((r) => !r.fork)) { const k = r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : r.license?.name || "No license"; lic[k] = (lic[k] || 0) + 1; }
  const le = Object.entries(lic).sort((a, b) => b[1] - a[1]).slice(0, 6), lmax = le[0]?.[1] || 1;
  $("licenses").innerHTML = le.map(([l, v]) => `<div class="brow"><span class="lbl" title="${esc(l)}">${esc(l.replace(/ License$/, "").replace(/"New" or "Revised" /, ""))}</span><span class="trk"><span class="fil" style="display:block;width:${v / lmax * 100}%;${l === "No license" ? "background:var(--warn)" : ""}"></span></span><span class="val">${v}</span></div>`).join("") || `<div class="empty">No repositories.</div>`;
  const br = {}; for (const r of R) br[r.default_branch] = (br[r.default_branch] || 0) + 1;
  $("branches").innerHTML = Object.entries(br).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([b, v]) => `<span class="mono">${esc(b)} <b>${v}</b></span>`).join("");
}
function renderTopics() {
  const t = {}; for (const r of S.repos) for (const x of r.topics || []) t[x] = (t[x] || 0) + 1;
  const e = Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 40);
  $("topics").innerHTML = e.length ? e.map(([x, v]) => `<button type="button" class="chip${S.topic === x ? " on" : ""}" data-topic="${esc(x)}" aria-pressed="${S.topic === x}">${esc(x)}<b>${v}</b></button>`).join("")
    : `<div class="empty" style="width:100%">No topics are set on these repositories. Add topics on GitHub to group projects here.</div>`;
}
const EV = { PushEvent: ["push", "Pushes"], PullRequestEvent: ["PR", "Pull requests"], PullRequestReviewEvent: ["rev", "Reviews"], PullRequestReviewCommentEvent: ["rev", "Review comments"], IssuesEvent: ["iss", "Issues"], IssueCommentEvent: ["cmt", "Comments"], CreateEvent: ["new", "Created"], DeleteEvent: ["del", "Deleted"], WatchEvent: ["★", "Starred"], ForkEvent: ["fork", "Forked"], ReleaseEvent: ["rel", "Releases"], PublicEvent: ["pub", "Made public"], MemberEvent: ["mem", "Collaborators"], GollumEvent: ["wiki", "Wiki edits"], CommitCommentEvent: ["cmt", "Commit comments"] };
function evText(e) {
  const repo = esc(e.repo?.name || ""), p = e.payload || {};
  switch (e.type) {
    case "PushEvent": { const n = p.size || p.distinct_size; return n ? `Pushed ${n} commit${n === 1 ? "" : "s"} to <b>${repo}</b>` : `Pushed to <b>${repo}</b>`; }
    case "PullRequestEvent": return `${esc(p.action || "Updated")} a pull request in <b>${repo}</b>`.replace(/^./, (c) => c.toUpperCase());
    case "IssuesEvent": return `${esc(p.action || "Updated")} an issue in <b>${repo}</b>`.replace(/^./, (c) => c.toUpperCase());
    case "IssueCommentEvent": return `Commented in <b>${repo}</b>`;
    case "CreateEvent": return `Created ${esc(p.ref_type || "repository")} in <b>${repo}</b>`;
    case "WatchEvent": return `Starred <b>${repo}</b>`;
    case "ForkEvent": return `Forked <b>${repo}</b>`;
    case "ReleaseEvent": return `Published a release in <b>${repo}</b>`;
    default: return `${esc((EV[e.type]?.[1]) || e.type.replace(/Event$/, ""))} · <b>${repo}</b>`;
  }
}
function renderFeed() {
  const E = S.events;
  if (!E.length) { $("evmix").innerHTML = ""; $("feedSub").textContent = ""; $("feed").innerHTML = `<li style="display:block"><div class="empty">No public events in the last 90 days.</div></li>`; return; }
  const m = {}; for (const e of E) m[e.type] = (m[e.type] || 0) + 1;
  const me = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5), max = me[0][1];
  $("evmix").innerHTML = me.map(([t, v]) => `<div class="brow"><span class="lbl">${esc(EV[t]?.[1] || t.replace(/Event$/, ""))}</span><span class="trk"><span class="fil" style="display:block;width:${v / max * 100}%"></span></span><span class="val">${v}</span></div>`).join("");
  $("feedSub").textContent = `${E.length} events · since ${dateStr(E[E.length - 1].created_at)}`;
  $("feed").innerHTML = E.slice(0, 9).map((e) => `<li><span class="ic">${esc(EV[e.type]?.[0] || "•")}</span><span class="txt">${evText(e)}</span><span class="t">${ago(e.created_at)}</span></li>`).join("");
}

/* ---------------- Sidebar: repository tree ---------------- */
function resetFilters() { $("q").value = ""; $("fType").value = "all"; $("fSort").value = "pushed_at"; S.topic = null; fillLangSelect(); $("fLang").value = "all"; }
function fillLangSelect() {
  const c = {}; for (const r of S.repos) { const l = r.language || "None"; c[l] = (c[l] || 0) + 1; }
  const keep = $("fLang").value;
  $("fLang").innerHTML = `<option value="all">All languages</option>` + Object.entries(c).sort((a, b) => b[1] - a[1]).map(([l, v]) => `<option value="${esc(l)}">${esc(l)} (${v})</option>`).join("");
  if (keep && [...$("fLang").options].some((o) => o.value === keep)) $("fLang").value = keep;
}
function filtered() {
  const q = $("q").value.trim().toLowerCase(), lang = $("fLang").value, type = $("fType").value, sort = $("fSort").value;
  const R = S.repos.filter((r) => {
    if (lang !== "all" && (r.language || "None") !== lang) return false;
    if (type === "source" && r.fork) return false;
    if (type === "fork" && !r.fork) return false;
    if (type === "archived" && !r.archived) return false;
    if (type === "private" && !r.private) return false;
    if (type === "public" && r.private) return false;
    if (type === "shared" && !r.shared) return false;
    if (S.topic && !(r.topics || []).includes(S.topic)) return false;
    if (q && !(`${r.name} ${r.description || ""} ${(r.topics || []).join(" ")}`.toLowerCase().includes(q))) return false;
    return true;
  });
  return R.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort.endsWith("_at") ? new Date(b[sort]) - new Date(a[sort]) : b[sort] - a[sort]);
}
const groupOf = (r) => r.archived ? "archived" : r.shared ? "shared" : r.fork ? "forks" : "own";
const GROUPS = [["own", "Repositories"], ["shared", "Shared with you"], ["forks", "Forks"], ["archived", "Archived"]];
function renderTree() {
  const R = filtered();
  const parts = [`<b>${R.length}</b> of ${S.repos.length}`];
  if (S.topic) parts.push(`<button type="button" class="chip on" id="clearTopic" title="Clear topic filter">${esc(S.topic)} ×</button>`);
  $("count").innerHTML = parts.join("");
  const active = activeTab();
  const sel = active?.kind === "repo" ? active.full : null;
  const freshColor = (d) => { const a = (Date.now() - new Date(d)) / DAY; return a < 30 ? "var(--ok)" : a < 180 ? "var(--warn)" : "var(--line-strong)"; };
  const html = GROUPS.map(([g, label]) => {
    const list = R.filter((r) => groupOf(r) === g);
    if (!list.length) return "";
    const open = !S.collapsed.has(g);
    return `<button type="button" class="grp" data-grp="${g}" aria-expanded="${open}">${I.chevron}${label}<span class="n">${list.length}</span></button>` + (open ? list.map((r) => `<div class="row${r.full_name === sel ? " sel focus" : ""}${r.archived ? " dim" : ""}" role="treeitem" data-repo="${esc(r.full_name)}" title="${esc(r.full_name)}${r.description ? "\n" + esc(r.description) : ""}">
        ${r.private ? I.lock : r.fork ? I.fork : r.archived ? I.archive : I.repo}
        <span class="rn">${esc(r.name)}${r.shared ? `<small>${esc(r.owner?.login || "")}</small>` : ""}</span>
        <span class="rm">${r.stargazers_count ? `★${fmt(r.stargazers_count)}` : ""}<i class="dot" style="width:7px;height:7px;background:${freshColor(r.pushed_at)}" title="Last push ${esc(ago(r.pushed_at))}"></i></span></div>`).join("") : "");
  }).join("");
  $("tree").innerHTML = html || `<div class="shint">No repositories match these filters.</div>`;
  const s = $("tree").querySelector(".row.sel"); if (s) s.scrollIntoView({ block: "nearest" });
}
function renderAccount() {
  const u = S.user;
  $("account").innerHTML = `${u.avatar_url ? `<img src="${esc(u.avatar_url)}&s=56" alt="">` : `<span class="av">${esc(u.login[0].toUpperCase())}</span>`}
    <span class="nm"><b>${esc(u.name || u.login)}</b><span>${S.sample ? "Sample data · press Ctrl+O" : "@" + esc(u.login) + (u.type === "Organization" ? " · organization" : "")}</span></span><span class="sw">Switch</span>`;
  $("sAccount").innerHTML = `${I.person}${S.sample ? "Sample data" : "@" + esc(u.login)}`;
  $("sRepos").innerHTML = `${I.repo}${S.repos.length} repositories`;
}

/* ---------------- Editor tabs ---------------- */
// Single-clicking a repository opens a preview tab (italic) that the next click replaces; double-click keeps it
let tabs = [{ id: "overview", kind: "overview" }], activeId = "overview";
const activeTab = () => tabs.find((t) => t.id === activeId);
// Pages other files add (the Inbox): { label, icon, render } by tab kind
const PAGES = {};
const tabLabel = (t) => PAGES[t.kind] ? PAGES[t.kind].label : t.kind === "overview" ? (S.user ? (S.sample ? "Overview" : `@${S.user.login}`) : "Overview") : t.kind === "settings" ? "Settings" : t.kind === "help" ? "Help" : t.kind === "compare" ? (window.AtlasCompare?.label() || "Compare") : t.full.split("/")[1];
const tabIcon = (t) => PAGES[t.kind] ? PAGES[t.kind].icon : t.kind === "overview" ? I.dash : t.kind === "settings" ? I.gear : t.kind === "help" ? I.help : t.kind === "compare" ? I.versus : I.repo;
function renderTabs() {
  $("tabs").innerHTML = tabs.map((t) => `<div class="tab${t.id === activeId ? " on" : ""}${t.preview ? " preview" : ""}" role="tab" aria-selected="${t.id === activeId}" data-tab="${esc(t.id)}" title="${esc(t.full || tabLabel(t))}">
    <svg class="ti" viewBox="0 0 24 24">${tabIcon(t).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg><span class="tl">${esc(tabLabel(t))}</span>
    <span class="tx${t.kind === "overview" ? " pin" : ""}" data-close="${esc(t.id)}" title="Close (Ctrl+W)">${t.kind === "overview" ? "" : I.close}</span></div>`).join("");
  const on = $("tabs").querySelector(".tab.on"); if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function showTab(id) {
  const t = tabs.find((x) => x.id === id); if (!t) return;
  activeId = id;
  document.querySelectorAll(".views > .view").forEach((v) => v.hidden = v.id !== "v-" + t.kind);
  renderTabs();
  PAGES[t.kind]?.render();
  if (t.kind === "compare") window.AtlasCompare?.render();
  if (t.kind === "repo") renderRepo(t.full);
  else repoFor = null;
  if (t.kind === "overview" && S.user) requestAnimationFrame(() => { renderYears(); renderLife(); renderScatter(); });
  renderTree();
  const who = S.user && !S.sample ? `@${S.user.login}` : "Sample data";
  setTitle(`${t.kind === "repo" ? t.full : t.kind === "overview" ? who : tabLabel(t)} · Repo Atlas`);
  syncUrl();
}
function openCompare() {
  if (!tabs.some((t) => t.id === "compare")) tabs.push({ id: "compare", kind: "compare" });
  showTab("compare");
}
function openRepo(full, pin) {
  const id = "repo:" + full;
  let t = tabs.find((x) => x.id === id);
  if (t) { if (pin) t.preview = false; }
  else {
    const prev = tabs.findIndex((x) => x.preview);
    t = { id, kind: "repo", full, preview: !pin };
    if (prev >= 0) tabs[prev] = t; else tabs.push(t);
  }
  showTab(id);
}
// Settings and Help are single pages that open as their own tab
function openPage(kind) {
  if (!tabs.some((t) => t.id === kind)) tabs.push({ id: kind, kind });
  showTab(kind);
}
const openSettings = () => openPage("settings");
function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0 || tabs[i].kind === "overview") return;
  tabs.splice(i, 1);
  if (activeId === id) showTab(tabs[Math.min(i, tabs.length - 1)].id); else renderTabs();
}
function closeRepoTabs() { tabs = tabs.filter((t) => t.kind !== "repo"); if (!tabs.some((t) => t.id === activeId)) activeId = "overview"; }
function cycleTab(d) { const i = tabs.findIndex((t) => t.id === activeId); showTab(tabs[(i + d + tabs.length) % tabs.length].id); }

/* ---------------- Repository view ---------------- */
let repoFor = null;
// Following and Actions add their parts to the repository view through these
const repoHooks = [];
function renderRepo(full) {
  const r = S.repos.find((x) => x.full_name === full); if (!r) { closeTab("repo:" + full); return; }
  repoFor = full;
  const clone = r.clone_url || `https://github.com/${r.full_name}.git`;
  $("repoPage").innerHTML = `<div class="rhead"><div style="min-width:0;flex:1 1 360px">
      <div class="crumb">${esc(r.full_name.split("/")[0])} /</div>
      <h1>${esc(r.name)}${r.private ? '<span class="flag private">private</span>' : '<span class="flag">public</span>'}${r.fork ? '<span class="flag">fork</span>' : ""}${r.archived ? '<span class="flag archived">archived</span>' : ""}${r.is_template ? '<span class="flag">template</span>' : ""}</h1>
      ${r.description ? `<p>${esc(r.description)}</p>` : ""}
      ${(r.topics || []).length ? `<div class="chips" style="margin-top:8px">${r.topics.map((t) => `<span class="chip tag">${esc(t)}</span>`).join("")}</div>` : ""}
    </div>
    <div class="racts">
      <div class="clone" title="Clone URL"><code>${esc(clone)}</code><button type="button" data-copy="${esc(clone)}" title="Copy clone URL (Ctrl+Shift+C)">${I.copy}</button></div>
      ${S.sample ? "" : `<button type="button" class="btn" id="starBtn" data-cmd="star" hidden></button><button type="button" class="btn" data-cmd="newIssue" title="Open a new issue in this repository">${I.issue}New issue</button><button type="button" class="btn" id="followBtn" data-cmd="follow"></button><button type="button" class="btn primary" data-open="${esc(r.html_url)}" title="Open on GitHub (Ctrl+Shift+G)">${I.ext}Open on GitHub</button>`}
    </div></div>
    <div class="kpis">${[["Stars", fmt(r.stargazers_count)], ["Forks", fmt(r.forks_count)], ["Open issues + PRs", fmt(r.open_issues_count)], ["Size", kb(r.size)], ["Last push", ago(r.pushed_at)], ["Default branch", esc(r.default_branch)]].map(([k, v]) => `<div class="kpi"><div class="k">${k}</div><div class="v" style="font-size:20px">${v}</div></div>`).join("")}</div>
    <section class="panel"><div class="ph"><h2>Branch graph</h2><div class="legend" id="dGraphSum"></div>
      <span class="phacts"><button type="button" class="btn" data-cmd="replay" id="replayBtn" title="Play the history of this graph">${I.play}Replay history</button><button type="button" class="btn" data-cmd="replayGif" title="Save the replay as an animated GIF">${I.film}Save as GIF</button></span></div><div class="chart scroll-x" id="dGraph"><div class="empty">Loading…</div></div><div class="legend" id="dGraphKey"></div></section>
    <section class="panel" id="dActions"><div class="ph"><h2>Actions</h2><span class="sub" id="dActSub"></span>
      <span class="phacts"><button type="button" class="btn" data-cmd="runWorkflow" title="Start a workflow that can be run by hand">${I.play}Run workflow</button><button type="button" class="ib" data-cmd="actionsRefresh" title="Refresh runs">${I.rerun}</button></span></div>
      <div class="runs" id="dRuns"><div class="empty">Loading…</div></div></section>
    <section class="panel" id="dReleases"><div class="ph"><h2>Releases</h2><span class="sub" id="dRelSub"></span>
      <span class="phacts"><button type="button" class="btn" data-cmd="newRelease" title="Publish a new release">${I.tag}New release</button></span></div>
      <div class="runs" id="dRels"><div class="empty">Loading…</div></div></section>
    <div class="grid">
      <section class="panel c7"><div class="ph"><h2>Commits per week, last 52 weeks</h2></div><div class="chart" id="dCommits"><div class="empty">Loading…</div></div></section>
      <section class="panel c5"><div class="ph"><h2>Languages</h2></div><div id="dLang"><div class="empty">Loading…</div></div></section>
      <section class="panel c7"><div class="ph"><h2>Branches</h2><div class="legend" id="dBranchSum"></div></div><div class="chart" id="dBranches"><div class="empty">Loading…</div></div>
        <div class="legend"><span><i class="dot" style="background:var(--muted);opacity:.55"></i>Commits behind default</span><span><i class="dot" style="background:var(--accent)"></i>Commits ahead (not merged)</span></div></section>
      <section class="panel c5"><div class="ph"><h2>Details</h2></div>
        <dl class="dl"><dt>Created</dt><dd>${dateStr(r.created_at)}</dd><dt>Last push</dt><dd>${dateStr(r.pushed_at)} (${ago(r.pushed_at)})</dd>
        <dt>Default branch</dt><dd>${esc(r.default_branch)}</dd><dt>License</dt><dd>${esc(r.license?.name || "None")}</dd>
        <dt>Visibility</dt><dd>${r.private ? "Private" : "Public"}${r.fork ? " · fork" : ""}${r.archived ? " · archived" : ""}</dd>
        ${r.homepage ? `<dt>Homepage</dt><dd><a href="${esc(r.homepage)}">${esc(r.homepage)}</a></dd>` : ""}</dl>
        <div class="sublabel">Top contributors</div><div class="contrib" id="dContrib"><div class="empty">Loading…</div></div></section>
    </div>`;
  $("v-repo").scrollTop = 0;
  for (const fn of repoHooks) try { fn(r); } catch (e) { console.error(e); }
  if (S.sample) {
    const rnd = mulberry(r.id + 1);
    fillDrawerLangs({ [r.language || "Text"]: r.size * 800, Shell: 3000 + rnd() * 9000, Dockerfile: 600 });
    fillDrawerCommits(Array.from({ length: 52 }, (_, i) => ({ total: rnd() < 0.4 ? 0 : Math.round(rnd() * rnd() * 25 * (i / 52 + 0.3)), week: (Date.now() - (52 - i) * 7 * DAY) / 1000 })));
    $("dContrib").innerHTML = `<span class="chip tag">sample-dev · ${Math.round(40 + rnd() * 300)} commits</span>`;
    const g = sampleGraph(r.default_branch); fillGraph(r.default_branch, g.commits, g.heads, g.tags, g.heads.length);
    const bn = ["feature/dark-mode", "fix/login-timeout", "experiment/new-parser", "release/1.2", "docs-update", "refactor-api"].slice(0, 1 + Math.floor(rnd() * 6));
    fillBranches(r.default_branch, new Date(Date.now() - rnd() * 20 * DAY).toISOString(),
      bn.map((name) => ({ name, ahead: rnd() < 0.3 ? 0 : Math.round(rnd() * 30), behind: Math.round(rnd() * rnd() * 120), date: new Date(Date.now() - rnd() * 300 * DAY).toISOString(), protected: name.startsWith("release") })), bn.length);
    return;
  }
  loadRepoDetails(r, full);
}
async function loadRepoDetails(r, full) {
  busyCount++; $("progress").hidden = false;
  const done = () => { busyCount--; busy(null); };
  const jobs = [
    loadBranches(r, full),
    gh(`/repos/${r.full_name}/languages`).then(({ data }) => repoFor === full && fillDrawerLangs(data)).catch(() => repoFor === full && ($("dLang").innerHTML = `<div class="empty">Couldn't load languages.</div>`)),
    gh(`/repos/${r.full_name}/contributors?per_page=12`).then(({ data }) => {
      if (repoFor !== full) return;
      $("dContrib").innerHTML = (data || []).length ? data.map((c) => `<a href="${esc(c.html_url)}" title="${c.contributions} commits"><img src="${esc(c.avatar_url)}&s=40" alt="">${esc(c.login)} <span class="mono" style="color:var(--muted)">${fmt(c.contributions)}</span></a>`).join("") : `<div class="empty">No contributors listed (empty repository).</div>`;
    }).catch((e) => repoFor === full && ($("dContrib").innerHTML = `<div class="empty">${/too large/i.test(e.message) ? "This repository has too much history for GitHub to list contributors." : "Couldn't load contributors."}</div>`)),
    (async () => {
      for (let tries = 0; tries < 4; tries++) {
        try {
          const res = await gh(`/repos/${r.full_name}/stats/commit_activity`);
          if (repoFor !== full) return;
          if (res.pending) { $("dCommits").innerHTML = `<div class="empty">GitHub is computing commit statistics…</div>`; await new Promise((ok) => setTimeout(ok, 2500)); continue; }
          return fillDrawerCommits(res.data || []);
        } catch { break; }
      }
      if (repoFor === full) $("dCommits").innerHTML = `<div class="empty">Commit statistics aren't available yet. GitHub computes them in the background; refresh (F5) in a minute.</div>`;
    })(),
  ];
  await Promise.allSettled(jobs); done();
}
const refPath = (name) => name.split("/").map(encodeURIComponent).join("/");
async function loadBranches(r, full) {
  const box = () => $("dBranches");
  try {
    const list = await paged(`/repos/${r.full_name}/branches`);
    if (repoFor !== full) return;
    if (!list.length) { box().innerHTML = $("dGraph").innerHTML = `<div class="empty">This repository has no branches yet (it's empty).</div>`; return; }
    const graph = loadGraph(r, full, list);
    const def = r.default_branch, defB = list.find((b) => b.name === def);
    const others = list.filter((b) => b.name !== def);
    box().innerHTML = `<div class="empty">Comparing ${others.length} branch${others.length === 1 ? "" : "es"} with ${esc(def)}…</div>`;
    const headDate = async (sha) => (await gh(`/repos/${r.full_name}/commits/${sha}`)).data.commit.committer.date;
    const rows = [];
    await pool(others.slice(0, 40), 5, async (b) => {
      try {
        const { data: c } = await gh(`/repos/${r.full_name}/compare/${refPath(def)}...${refPath(b.name)}`);
        const date = c.ahead_by && c.commits?.length ? c.commits[c.commits.length - 1].commit.committer.date : await headDate(b.commit.sha);
        rows.push({ name: b.name, ahead: c.ahead_by, behind: c.behind_by, date, protected: b.protected });
      } catch { rows.push({ name: b.name, ahead: null, behind: null, date: null, protected: b.protected }); }
    });
    let defDate = null; try { if (defB) defDate = await headDate(defB.commit.sha); } catch {}
    if (repoFor === full) fillBranches(def, defDate, rows, others.length);
    await graph;
  } catch (e) {
    if (repoFor === full) box().innerHTML = $("dGraph").innerHTML = `<div class="empty">Couldn't load branches. ${esc(explain(e).replace(/<[^>]+>/g, ""))}</div>`;
  }
}
/* Git-flow graph: one lane per branch, colored by the kind of branch (lines, dots and labels alike), with merges and tags */
const FLOW = [
  { k: "main", c: "#e5534b", t: (n, def) => n === def || /^(main|master|trunk)$/i.test(n) },
  { k: "hotfix", c: "#26a865", t: (n) => /^(hotfix|bugfix|fix)[/-]/i.test(n) },
  { k: "release", c: "#d9821b", t: (n) => /^release[/-]/i.test(n) },
  { k: "develop", c: "#3b76f0", t: (n) => /^(develop|development|dev|next)$/i.test(n) },
  { k: "feature", c: "#9b59c9", t: (n) => /^(feature|feat)[/-]/i.test(n) },
  { k: "other", c: "#7d8b92", t: () => true },
];
const flowOf = (name, def) => FLOW.find((f) => f.t(name, def));
// Which branch claims a commit first: main, then develop, then the short-lived kinds
const RANK = ["main", "develop", "release", "hotfix", "feature", "other"];
const rankOf = (name, def) => RANK.indexOf(flowOf(name, def).k);
async function loadGraph(r, full, list) {
  const def = r.default_branch;
  const pick = [...list].sort((a, b) => rankOf(a.name, def) - rankOf(b.name, def) || a.name.localeCompare(b.name)).slice(0, 15);
  const commits = new Map();
  await pool(pick, 4, async (b) => {
    try {
      const { data } = await gh(`/repos/${r.full_name}/commits?sha=${encodeURIComponent(b.name)}&per_page=50`);
      for (const c of data) commits.set(c.sha, { sha: c.sha, parents: c.parents.map((p) => p.sha), date: c.commit.committer?.date || c.commit.author?.date, msg: c.commit.message.split("\n")[0], author: c.author?.login || c.commit.author?.name || "", url: c.html_url });
    } catch {}
  });
  let tags = []; try { tags = (await gh(`/repos/${r.full_name}/tags?per_page=100`)).data; } catch {}
  if (repoFor !== full) return;
  fillGraph(def, [...commits.values()], pick.map((b) => ({ name: b.name, sha: b.commit.sha })), tags.map((t) => ({ name: t.name, sha: t.commit.sha })), list.length);
}
function sampleGraph(def) {
  const c = (sha, parents, d, msg) => ({ sha, parents, date: new Date(Date.now() - d * DAY).toISOString(), msg, author: "sample-dev" });
  return {
    commits: [
      c("c0f3a91", [], 60, "Initial commit"), c("d17b2e4", ["c0f3a91"], 55, "Set up project structure"),
      c("e5a09c2", ["c0f3a91"], 50, "Fix crash on startup"), c("a9d41f7", ["c0f3a91", "e5a09c2"], 48, "Merge branch 'hotfix/startup-crash'"),
      c("b3c8e10", ["d17b2e4"], 40, "Add settings page"), c("f2e6d58", ["b3c8e10"], 35, "Add login form"),
      c("f8a1c03", ["f2e6d58"], 30, "Validate credentials"), c("d4b7a62", ["b3c8e10", "f8a1c03"], 25, "Merge branch 'feature/login' into develop"),
      c("a4e2b95", ["a9d41f7"], 20, "Update README"), c("d9c3f71", ["d4b7a62"], 12, "Prepare 1.0 release"),
      c("a7f05d3", ["a4e2b95", "d9c3f71"], 5, "Merge branch 'develop'"), c("d6e8a24", ["d9c3f71"], 3, "Start the 1.1 cycle"),
      c("f5c2d19", ["d6e8a24"], 2, "Add dark mode toggle"),
    ],
    heads: [{ name: def, sha: "a7f05d3" }, { name: "develop", sha: "d6e8a24" }, { name: "hotfix/startup-crash", sha: "e5a09c2" }, { name: "feature/dark-mode", sha: "f5c2d19" }],
    tags: [{ name: "v0.5", sha: "a9d41f7" }, { name: "v1.0", sha: "d4b7a62" }, { name: "v1", sha: "a7f05d3" }],
  };
}
function fillGraph(def, all, heads, tags, totalBranches) {
  const box = $("dGraph");
  const win = new Map([...all].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 60).map((c) => [c.sha, { ...c }]));
  if (!win.size) { box.innerHTML = `<div class="empty">No commits to draw.</div>`; $("dGraphSum").innerHTML = $("dGraphKey").innerHTML = ""; return; }
  // Oldest first, but never before a parent (commit dates can be out of order)
  const order = [], placed = new Set(), left = [...win.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
  while (left.length) {
    const i = Math.max(0, left.findIndex((c) => c.parents.every((p) => !win.has(p) || placed.has(p))));
    const [c] = left.splice(i, 1); c.x = order.length; order.push(c); placed.add(c.sha);
  }
  // Each branch claims its first-parent chain, most important branches first
  const lanes = [], laneOf = new Map();
  const walk = (sha, lane) => {
    lane.commits = [];
    for (let c = win.get(sha); c && !laneOf.has(c.sha); c = win.get(c.parents[0])) { laneOf.set(c.sha, lane); lane.commits.push(c); }
    if (lane.commits.length) lanes.push(lane);
  };
  for (const b of [...heads].sort((a, b) => rankOf(a.name, def) - rankOf(b.name, def))) walk(b.sha, { name: b.name, flow: flowOf(b.name, def) });
  // What's left was merged from a branch that has since been deleted; name it from the merge message
  for (const c of [...order].reverse()) {
    if (laneOf.has(c.sha)) continue;
    const m = order.find((k) => k.parents.indexOf(c.sha) > 0)?.msg || "";
    const name = /Merge branch '([^']+)'/.exec(m)?.[1] || /Merge pull request #\d+ from [^/\s]+\/(\S+)/.exec(m)?.[1] || "merged branch";
    walk(c.sha, { name, flow: flowOf(name, def), gone: true });
  }
  // A lane spans from the commit it forked from to the last commit it merged into
  for (const l of lanes) {
    const xs = l.commits.map((c) => c.x), base = win.get(l.commits[l.commits.length - 1].parents[0]);
    if (base) xs.push(base.x);
    for (const k of order) if (k.parents.slice(1).some((p) => laneOf.get(p) === l)) xs.push(k.x);
    l.lo = Math.min(...xs); l.hi = Math.max(...xs);
  }
  // Rows go main, hotfix, release, develop, feature, other; branches of one kind share a row when they don't overlap
  const rows = [];
  lanes.sort((a, b) => FLOW.indexOf(a.flow) - FLOW.indexOf(b.flow) || a.lo - b.lo);
  for (const l of lanes) {
    let row = rows.find((r) => r.flow === l.flow && r.hi + 3 < l.lo);
    if (!row) rows.push(row = { flow: l.flow });
    row.hi = l.hi; l.row = rows.indexOf(row);
  }
  const COL = 34, ROW = 62, PADL = 46, TOP = 40, R = 8;
  const W = PADL * 2 + (order.length - 1) * COL, H = TOP + (rows.length - 1) * ROW + 46;
  const X = (c) => PADL + c.x * COL, Y = (c) => TOP + laneOf.get(c.sha).row * ROW;
  const path = (p, c, merge) => {
    const x1 = X(p), y1 = Y(p), x2 = X(c), y2 = Y(c);
    if (y1 === y2) return `M${x1} ${y1}H${x2}`;
    // Branch-offs turn right after the parent, merges turn right before the child
    const xb = merge ? x2 - COL / 2 : x1 + COL / 2, s = y2 > y1 ? 1 : -1, r = Math.min(10, Math.abs(y2 - y1) / 2);
    return `M${x1} ${y1}H${xb - r}Q${xb} ${y1} ${xb} ${y1 + s * r}V${y2 - s * r}Q${xb} ${y2} ${xb + r} ${y2}H${x2}`;
  };
  // data-s is the step each piece appears at, so the history replay can reveal the graph commit by commit.
  // Each line takes its branch's color: a merge line the merged branch's, any other line the child's.
  const edges = order.flatMap((c) => c.parents.map((p, i) => win.has(p) ? `<path data-s="${c.x}" d="${path(win.get(p), c, i > 0)}" stroke="${laneOf.get(i > 0 ? p : c.sha).flow.c}"/>`
    : i === 0 ? `<path data-s="${c.x}" d="M${X(c) - COL * 0.7} ${Y(c)}H${X(c)}" stroke="${laneOf.get(c.sha).flow.c}" stroke-dasharray="3 4"/>` : "")).join("");
  const at = (list) => { const m = new Map(); for (const t of list) if (win.has(t.sha)) m.set(t.sha, [...(m.get(t.sha) || []), t.name]); return m; };
  const tagsAt = at(tags), headsAt = at(heads);
  const flag = (x, y, names, color, above, s) => {
    let text = names[0].length > 24 ? names[0].slice(0, 23) + "…" : names[0];
    if (names.length > 1) text += ` +${names.length - 1}`;
    const w = text.length * 6.1 + 12, h = 16, fx = Math.min(W - w - 2, Math.max(2, x - w / 2)), fy = above ? y - R - 6 - h : y + R + 6;
    const tip = above ? `${x - 4},${fy + h} ${x + 4},${fy + h} ${x},${fy + h + 4}` : `${x - 4},${fy} ${x + 4},${fy} ${x},${fy - 4}`;
    return `<g data-s="${s}" data-tip="${esc(names.join("\n"))}"><polygon points="${tip}" fill="${color}"/><rect x="${fx}" y="${fy}" width="${w}" height="${h}" rx="3" fill="${color}"/><text class="fl" x="${fx + w / 2}" y="${fy + 11.5}" text-anchor="middle">${esc(text)}</text></g>`;
  };
  const nodes = order.map((c) => {
    const l = laneOf.get(c.sha), x = X(c), y = Y(c);
    const tip = `${c.msg}\n${c.sha.slice(0, 7)} on ${l.name}${l.gone ? " (deleted)" : ""}\n${c.author ? c.author + " · " : ""}${dateStr(c.date)}`;
    const dot = `<g class="gn" data-s="${c.x}" data-tip="${esc(tip)}"><circle cx="${x}" cy="${y}" r="${R}" fill="${l.flow.c}"/></g>`;
    return c.url ? `<a href="${esc(c.url)}">${dot}</a>` : dot;
  }).join("");
  const flags = order.map((c) => {
    const x = X(c), y = Y(c), t = tagsAt.get(c.sha), h = headsAt.get(c.sha);
    return (t ? flag(x, y, t, laneOf.get(c.sha).flow.c, true, c.x) : "") + (h ? flag(x, y, h, flowOf(h[0], def).c, false, c.x) : "");
  }).join("");
  const guides = rows.map((_, i) => `<line x1="0" x2="${W}" y1="${TOP + i * ROW}" y2="${TOP + i * ROW}" stroke="var(--line-strong)" stroke-dasharray="3 6"/>`).join("");
  const nTags = [...tagsAt.values()].reduce((a, t) => a + t.length, 0);
  $("dGraphSum").innerHTML = `<span><b>${order.length}</b> recent commits</span><span><b>${lanes.length}</b> line${lanes.length === 1 ? "" : "s"} of work</span><span><b>${nTags}</b> tag${nTags === 1 ? "" : "s"}</span>${totalBranches > heads.length ? `<span>Drawing ${heads.length} of ${totalBranches} branches</span>` : ""}`;
  const kinds = FLOW.filter((f) => lanes.some((l) => l.flow === f));
  $("dGraphKey").innerHTML = kinds.map((f) => `<span><i class="dot" style="background:${f.c}"></i>${f.k}</span>`).join("") + (W > box.clientWidth ? `<span>Scroll sideways for older commits</span>` : "");
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Branch graph of the last ${order.length} commits">${guides}
    <g fill="none" stroke-width="2.5" stroke-linecap="round" opacity=".85">${edges}</g>${nodes}${flags}</svg>`;
  box.scrollLeft = box.scrollWidth;
  box.steps = order.map((c) => ({ date: c.date, msg: c.msg, x: X(c) }));
}
function fillBranches(def, defDate, rows, total) {
  const box = $("dBranches");
  const stale = rows.filter((b) => b.date && Date.now() - new Date(b.date) > 90 * DAY).length;
  const merged = rows.filter((b) => b.ahead === 0).length;
  $("dBranchSum").innerHTML = `<span><b>${total + 1}</b> branches</span><span><b>${merged}</b> merged</span><span><b>${stale}</b> stale</span>${total > rows.length ? `<span>Showing ${rows.length}</span>` : ""}`;
  if (!rows.length) { box.innerHTML = `<div class="empty">Only the default branch exists.</div>`; return; }
  rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const W = Math.max(300, box.clientWidth), rh = 22, top = 16, H = top + rows.length * rh;
  const lw = Math.min(170, W * 0.38), aw = 54, mid = lw + (W - lw - aw) / 2, half = (W - lw - aw) / 2 - 22;
  const max = Math.max(1, ...rows.map((b) => Math.max(b.ahead || 0, b.behind || 0)));
  const sc = (v) => half * Math.sqrt(v / max);
  const maxChars = Math.floor(lw / 7);
  const body = rows.map((b, i) => {
    const y = top + i * rh, nm = b.name.length > maxChars ? b.name.slice(0, maxChars - 1) + "…" : b.name;
    const old = b.date && Date.now() - new Date(b.date) > 90 * DAY;
    const tip = `${b.name}${b.protected ? " (protected)" : ""}\n${b.ahead == null ? "Couldn't compare with " + def : `${b.ahead} ahead · ${b.behind} behind ${def}`}${b.date ? "\nLast commit " + dateStr(b.date) : ""}`;
    return `<g data-tip="${esc(tip)}"><rect x="0" y="${y}" width="${W}" height="${rh}" fill="transparent"></rect>
      <text x="0" y="${y + 14}" style="fill:var(--ink);${old ? "opacity:.55" : ""}">${esc(nm)}</text>
      ${b.behind ? `<rect x="${mid - sc(b.behind)}" y="${y + 5}" width="${sc(b.behind)}" height="${rh - 10}" rx="2" fill="var(--muted)" opacity=".55"></rect><text x="${mid - sc(b.behind) - 4}" y="${y + 14}" text-anchor="end">${b.behind}</text>` : ""}
      ${b.ahead ? `<rect x="${mid}" y="${y + 5}" width="${sc(b.ahead)}" height="${rh - 10}" rx="2" fill="var(--accent)"></rect><text x="${mid + sc(b.ahead) + 4}" y="${y + 14}">${b.ahead}</text>` : b.ahead === 0 ? `<text x="${mid + 5}" y="${y + 14}">merged</text>` : ""}
      <text x="${W}" y="${y + 14}" text-anchor="end">${b.date ? ago(b.date) : "–"}</text></g>`;
  }).join("");
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Branches compared with ${esc(def)}">
    <line x1="${mid}" x2="${mid}" y1="${top - 4}" y2="${H}" stroke="var(--line-strong)"></line>
    <text x="${mid - 4}" y="10" text-anchor="end">← behind</text><text x="${mid + 4}" y="10">ahead →</text><text x="${W}" y="10" text-anchor="end">last commit</text>${body}</svg>`;
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function fillDrawerLangs(data) {
  const e = Object.entries(data).sort((a, b) => b[1] - a[1]); const tot = e.reduce((a, x) => a + x[1], 0);
  if (!tot) { $("dLang").innerHTML = `<div class="empty">No code detected.</div>`; return; }
  $("dLang").innerHTML = `<div class="stack">${e.map(([l, v]) => `<div style="width:${v / tot * 100}%;background:${langColor(l)}" data-tip="${esc(l)}: ${bytes(v)}"></div>`).join("")}</div>
    <div class="legend" style="margin-top:10px">${e.slice(0, 8).map(([l, v]) => `<span><i class="dot" style="background:${langColor(l)}"></i>${esc(l)} <b>${(v / tot * 100).toFixed(1)}%</b></span>`).join("")}</div>`;
}
function fillDrawerCommits(weeks) {
  const box = $("dCommits");
  if (!weeks.length) { box.innerHTML = `<div class="empty">No commits in the last year.</div>`; return; }
  const W = Math.max(280, box.clientWidth), H = 130, pb = 18, pt = 20;
  const max = Math.max(1, ...weeks.map((w) => w.total)); const bw = W / weeks.length;
  const sum = weeks.reduce((a, w) => a + w.total, 0);
  const bars = weeks.map((w, i) => { const h = (H - pb - pt) * w.total / max; return `<rect x="${i * bw + 1}" y="${H - pb - h}" width="${Math.max(1, bw - 2)}" height="${Math.max(w.total ? 1.5 : 0, h)}" rx="1" fill="var(--heat)" data-tip="${w.total} commit${w.total === 1 ? "" : "s"}\nweek of ${dateStr(w.week * 1000)}"></rect><rect x="${i * bw}" y="0" width="${bw}" height="${H - pb}" fill="transparent" data-tip="${w.total} commit${w.total === 1 ? "" : "s"}\nweek of ${dateStr(w.week * 1000)}"></rect>`; }).join("");
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="var(--line-strong)"></line>${bars}
    <text x="0" y="${H - 3}">${new Date(weeks[0].week * 1000).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</text><text x="${W}" y="${H - 3}" text-anchor="end">now</text>
    <text x="${W}" y="11" text-anchor="end">${fmt(sum)} commits · peak ${max}/wk</text></svg>`;
}

/* ---------------- Sidebar views, theme, layout ---------------- */
let sideView = "repos";
function showSide(v, focus) {
  const wb = $("workbench");
  if (sideView === v && !wb.classList.contains("nosb") && !focus) { toggleSidebar(); return; }
  sideView = v; wb.classList.remove("nosb");
  document.querySelectorAll(".act[data-view]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === v));
  document.querySelectorAll(".sview").forEach((el) => el.hidden = el.id !== "view-" + v);
  if (v === "accounts") renderRecent();
  if (v === "following") window.AtlasFollow?.render();
  if (focus === "filter") { $("q").focus(); $("q").select(); }
  store.set("ra.side", v);
  relayout();
}
function toggleSidebar() {
  const wb = $("workbench"); wb.classList.toggle("nosb");
  document.querySelectorAll(".act[data-view]").forEach((b) => b.setAttribute("aria-pressed", !wb.classList.contains("nosb") && b.dataset.view === sideView));
  store.set("ra.nosb", wb.classList.contains("nosb") ? "1" : null);
  relayout();
}
const themePref = () => store.get("ra.theme") || "dark";
const mq = matchMedia("(prefers-color-scheme: light)");
function applyTheme() {
  const p = themePref(), t = p === "system" ? (mq.matches ? "light" : "dark") : p;
  document.documentElement.dataset.theme = t;
  $("themeSel").value = p;
  $("sTheme").innerHTML = t === "dark" ? `${I.moon}Dark` : `${I.sun}Light`;
  if (desktop) try { T.window.getCurrentWindow().setTheme(p === "system" ? null : t).catch(() => {}); } catch {}
}
mq.addEventListener("change", () => themePref() === "system" && applyTheme());
let rz;
function relayout() { clearTimeout(rz); rz = setTimeout(() => { if (activeTab()?.kind === "overview") { renderYears(); renderLife(); renderScatter(); } }, 120); }
window.addEventListener("resize", relayout);
// Drag the sash to resize the sidebar
(() => {
  const sash = $("sash"); let x0, w0;
  const saved = +store.get("ra.sbw"); if (saved) document.documentElement.style.setProperty("--sbw", saved + "px");
  sash.addEventListener("pointerdown", (e) => { x0 = e.clientX; w0 = $("sidebar").offsetWidth; sash.setPointerCapture(e.pointerId); sash.classList.add("drag"); });
  sash.addEventListener("pointermove", (e) => {
    if (x0 == null) return;
    const w = Math.max(200, Math.min(560, w0 + e.clientX - x0));
    document.documentElement.style.setProperty("--sbw", w + "px");
  });
  sash.addEventListener("pointerup", () => { x0 = null; sash.classList.remove("drag"); store.set("ra.sbw", $("sidebar").offsetWidth); relayout(); });
})();

/* ---------------- Commands, palette, keyboard ---------------- */
const isRepo = () => activeTab()?.kind === "repo";
const curRepo = () => isRepo() ? S.repos.find((r) => r.full_name === activeTab().full) : null;
const COMMANDS = [
  { id: "load", label: "Load Account…", keys: ["Ctrl", "O"], run: () => palette("load") },
  { id: "goto", label: "Go to Repository…", keys: ["Ctrl", "P"], run: () => palette("repo") },
  { id: "refresh", label: "Refresh", keys: ["F5"], run: refresh },
  { id: "overview", label: "View: Show Overview", keys: ["Ctrl", "1"], run: () => showTab("overview") },
  { id: "repos", label: "View: Show Repositories", keys: ["Ctrl", "Shift", "E"], run: () => showSide("repos", true) },
  { id: "accounts", label: "View: Show Accounts", keys: ["Ctrl", "Shift", "A"], run: () => showSide("accounts", true) },
  { id: "filter", label: "View: Filter Repositories", keys: ["Ctrl", "Shift", "F"], run: () => showSide("repos", "filter") },
  { id: "sidebar", label: "View: Toggle Sidebar", keys: ["Ctrl", "B"], run: toggleSidebar },
  { id: "close", label: "View: Close Tab", keys: ["Ctrl", "W"], run: () => closeTab(activeId) },
  { id: "next", label: "View: Next Tab", keys: ["Ctrl", "Tab"], run: () => cycleTab(1) },
  { id: "prev", label: "View: Previous Tab", keys: ["Ctrl", "Shift", "Tab"], run: () => cycleTab(-1) },
  { id: "github", label: "Repository: Open on GitHub", keys: ["Ctrl", "Shift", "G"], when: () => isRepo() && !S.sample, run: () => openExternal(curRepo().html_url) },
  { id: "clone", label: "Repository: Copy Clone URL", keys: ["Ctrl", "Shift", "C"], when: isRepo, run: () => { const r = curRepo(); copyText(r.clone_url || `https://github.com/${r.full_name}.git`); } },
  { id: "keep", label: "Repository: Keep Tab Open", when: () => activeTab()?.preview, run: () => { activeTab().preview = false; renderTabs(); } },
  { id: "profile", label: "Account: Open Profile on GitHub", when: () => !S.sample, run: () => openExternal(S.user.html_url) },
  { id: "me", label: "Account: Load My Account", when: () => !!S.me, run: () => load(S.me.login) },
  { id: "sample", label: "Account: Show Sample Data", run: showSample },
  { id: "settings", label: "Preferences: Open Settings", keys: ["Ctrl", ","], run: openSettings },
  { id: "token", label: "Preferences: Set GitHub Token…", run: () => { openSettings(); $("token").focus(); } },
  { id: "signout", label: "Preferences: Remove GitHub Token", when: () => !!S.token, run: () => clearToken() },
  { id: "theme", label: "Preferences: Toggle Dark/Light Theme", keys: ["Ctrl", "K", "T"], run: () => { store.set("ra.theme", document.documentElement.dataset.theme === "dark" ? "light" : "dark"); applyTheme(); } },
  { id: "palette", label: "Show All Commands", keys: ["Ctrl", "Shift", "P"], run: () => palette("cmd") },
  { id: "help", label: "Help: Show Help and Shortcuts", keys: ["F1"], run: () => openPage("help") },
  { id: "about", label: "Help: About Repo Atlas", run: () => { openPage("help"); $("about").scrollIntoView({ block: "start" }); } },
  { id: "welcome", label: "Help: Show Welcome Screen", run: () => openWelcome(0) },
  { id: "tokenbox", label: "Help: Show Me the Token Box", run: () => showTokenBox() },
  { id: "link", label: "Share: Copy Link to This View", run: () => copyText(currentLink()) },
  { id: "collapse", label: "Repositories: Collapse All Groups", run: () => { const any = GROUPS.some(([g]) => !S.collapsed.has(g)); S.collapsed = new Set(any ? GROUPS.map(([g]) => g) : []); store.set("ra.collapsed", JSON.stringify([...S.collapsed])); renderTree(); } },
];
const cmd = (id) => COMMANDS.find((c) => c.id === id);
const run = (id) => { const c = cmd(id); if (c && (!c.when || c.when())) c.run(); };
const kbd = (keys) => keys ? keys.map((k) => `<kbd>${esc(k)}</kbd>`).join("") : "";

let qi = { mode: null, items: [], sel: 0 };
function palette(mode, initial, ask) {
  qi.mode = mode; qi.sel = 0; if (ask) qi.ask = ask;
  $("qi").hidden = $("qiScrim").hidden = false;
  const inp = $("qiInput");
  inp.value = initial ?? (mode === "cmd" ? ">" : "");
  inp.placeholder = mode === "load" ? "GitHub username, organization, or owner/repo" : mode === "repo" ? "Search repositories by name (type > for commands)" : mode === "ask" ? qi.ask.placeholder : "";
  updatePalette(); inp.focus();
}
function closePalette() { $("qi").hidden = $("qiScrim").hidden = true; qi.mode = null; }
// Subsequence match with highlighted characters, like VS Code's quick open
function fuzzy(text, q) {
  if (!q) return { score: 0, html: esc(text) };
  const t = text.toLowerCase(), qq = q.toLowerCase(); let i = 0, score = 0, last = -2; const hit = [];
  for (let k = 0; k < t.length && i < qq.length; k++) if (t[k] === qq[i]) { hit.push(k); score += (k === last + 1 ? 3 : 1) + (k === 0 ? 3 : 0); if (k === 0 || /[\s/:_.-]/.test(t[k - 1])) score += 2; last = k; i++; }
  if (i < qq.length) return null;
  let html = ""; for (let k = 0; k < text.length; k++) html += hit.includes(k) ? `<mark>${esc(text[k])}</mark>` : esc(text[k]);
  return { score: score - text.length * 0.01, html };
}
function updatePalette() {
  let v = $("qiInput").value;
  if (qi.mode === "repo" && v.startsWith(">")) qi.mode = "cmd";
  if (qi.mode === "cmd" && !v.startsWith(">")) qi.mode = "repo";
  let items = [], msg = "";
  if (qi.mode === "cmd") {
    const q = v.slice(1).trim();
    items = COMMANDS.filter((c) => !c.when || c.when()).map((c) => ({ c, m: fuzzy(c.label, q) })).filter((x) => x.m).sort((a, b) => q ? b.m.score - a.m.score : 0)
      .map(({ c, m }) => ({ html: `<span class="ql">${m.html}</span><span class="qk">${kbd(c.keys)}</span>`, go: () => c.run() }));
    if (!items.length) msg = "No matching commands";
  } else if (qi.mode === "repo") {
    const q = v.trim();
    items = S.repos.map((r) => ({ r, m: fuzzy(r.name, q) })).filter((x) => x.m).sort((a, b) => q ? b.m.score - a.m.score : new Date(b.r.pushed_at) - new Date(a.r.pushed_at)).slice(0, 60)
      .map(({ r, m }) => ({ html: `<span style="color:${langColor(r.language)}">●</span><span class="ql">${m.html}</span><span class="qd">${esc(r.full_name.split("/")[0])} · ${r.language ? esc(r.language) + " · " : ""}${ago(r.pushed_at)}</span>`, go: () => openRepo(r.full_name, true) }));
    if (!items.length) msg = S.repos.length ? "No repository matches. Press Ctrl+O to load another account." : "No repositories loaded.";
  } else if (qi.mode === "load") {
    const q = v.trim().replace(/^@/, "");
    msg = "Press Enter to load. A token in Settings adds private repositories.";
    if (q) items.push({ html: `<span class="ql">Load <b>${esc(q)}</b></span><span class="qd">${q.includes("/") ? "repository" : "user or organization"}</span>`, go: () => load(q) });
    if (S.me && !q) items.push({ html: `<span class="ql">My account</span><span class="qd">@${esc(S.me.login)}</span>`, go: () => load(S.me.login) });
    for (const u of store.json("ra.recent", [])) { const m = fuzzy(u.login, q); if (m && u.login !== q) items.push({ html: `<span class="ql">${m.html}</span><span class="qd">recent${u.name ? " · " + esc(u.name) : ""}</span>`, go: () => load(u.login) }); }
  } else if (qi.mode === "ask") {
    // Another account for a command, e.g. who to compare with
    const q = v.trim().replace(/^@/, ""), a = qi.ask;
    msg = a.msg;
    if (q) items.push({ html: `<span class="ql">${a.verb} <b>${esc(q)}</b></span>`, go: () => a.go(q) });
    for (const u of [...(a.suggest || []), ...(a.noRecent ? [] : store.json("ra.recent", []))]) {
      if (S.user && u.login.toLowerCase() === S.user.login.toLowerCase() || items.some((it) => it.login === u.login)) continue;
      const m = fuzzy(u.login, q); if (m && u.login !== q) items.push({ login: u.login, html: `<span class="ql">${m.html}</span><span class="qd">${esc(u.note || "recent")}</span>`, go: () => a.go(u.login) });
    }
  }
  qi.items = items; qi.sel = Math.min(qi.sel, Math.max(0, items.length - 1));
  $("qiMsg").textContent = msg;
  $("qiList").innerHTML = items.map((it, i) => `<li role="option" data-i="${i}" class="${i === qi.sel ? "on" : ""}" aria-selected="${i === qi.sel}">${it.html}</li>`).join("");
  const on = $("qiList").querySelector(".on"); if (on) on.scrollIntoView({ block: "nearest" });
}
function pickPalette(i) { const it = qi.items[i]; closePalette(); if (it) it.go(); }
$("qiInput").addEventListener("input", () => { qi.sel = 0; updatePalette(); });
$("qiInput").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = qi.items.length; if (n) { qi.sel = (qi.sel + (e.key === "ArrowDown" ? 1 : -1) + n) % n; updatePalette(); } }
  else if (e.key === "Enter") { e.preventDefault(); pickPalette(qi.sel); }
  else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
});
$("qiList").addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-i]"); if (li) { e.preventDefault(); pickPalette(+li.dataset.i); } });
$("qiScrim").addEventListener("mousedown", closePalette);

let chord = null;
document.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (!$("welcome").hidden) { if (k === "Escape") { e.preventDefault(); closeWelcome(); } return; }
  if (!$("qi").hidden || /^(Control|Shift|Alt|Meta)$/.test(k)) return;
  if (chord) { chord = null; if (ctrl && k === "t") { e.preventDefault(); run("theme"); return; } }
  const inField = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
  if (ctrl && e.shiftKey && k === "p") { e.preventDefault(); return run("palette"); }
  if (k === "F1") { e.preventDefault(); return run("help"); }
  if (ctrl && !e.shiftKey && k === "p") { e.preventDefault(); return run("goto"); }
  if (ctrl && !e.shiftKey && k === "o") { e.preventDefault(); return run("load"); }
  if (k === "F5" || (ctrl && !e.shiftKey && k === "r")) { e.preventDefault(); return run("refresh"); }
  if (ctrl && !e.shiftKey && k === "b") { e.preventDefault(); return run("sidebar"); }
  if (ctrl && !e.shiftKey && k === "w") { e.preventDefault(); return run("close"); }
  if (ctrl && k === "Tab") { e.preventDefault(); return cycleTab(e.shiftKey ? -1 : 1); }
  if (ctrl && (k === "PageDown" || k === "PageUp")) { e.preventDefault(); return cycleTab(k === "PageDown" ? 1 : -1); }
  if (ctrl && !e.shiftKey && k === ",") { e.preventDefault(); return run("settings"); }
  if (ctrl && !e.shiftKey && k === "k") { e.preventDefault(); chord = true; return; }
  if (ctrl && !e.shiftKey && /^[1-9]$/.test(k)) { e.preventDefault(); const t = tabs[Math.min(+k, tabs.length) - 1]; if (t) showTab(t.id); return; }
  if (ctrl && e.shiftKey && k === "e") { e.preventDefault(); return run("repos"); }
  if (ctrl && e.shiftKey && k === "a") { e.preventDefault(); return run("accounts"); }
  if (ctrl && e.shiftKey && k === "u") { e.preventDefault(); return run("following"); }
  if (ctrl && e.shiftKey && k === "m") { e.preventDefault(); return run("inbox"); }
  if (ctrl && e.shiftKey && k === "f") { e.preventDefault(); return run("filter"); }
  if (ctrl && e.shiftKey && k === "g") { e.preventDefault(); return run("github"); }
  if (ctrl && e.shiftKey && k === "c" && !inField) { e.preventDefault(); return run("clone"); }
  if (k === "Escape" && document.activeElement === $("q")) { if ($("q").value) { $("q").value = ""; renderTree(); } else $("q").blur(); return; }
  // Arrow keys move through the repository list while the filter box has focus, Enter opens
  if (document.activeElement === $("q") && (k === "ArrowDown" || k === "ArrowUp" || k === "Enter")) {
    e.preventDefault();
    const rows = [...$("tree").querySelectorAll(".row")]; if (!rows.length) return;
    let i = rows.findIndex((r) => r.classList.contains("kb"));
    if (k === "Enter") { const r = rows[Math.max(0, i)]; openRepo(r.dataset.repo, true); return; }
    rows.forEach((r) => r.classList.remove("kb", "sel"));
    i = k === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
    rows[i].classList.add("kb", "sel"); rows[i].scrollIntoView({ block: "nearest" });
    openRepo(rows[i].dataset.repo, false); $("q").focus();
  }
});
function renderKeys() {
  $("keys").innerHTML = COMMANDS.filter((c) => c.keys).map((c) => `<tr><td>${esc(c.label)}</td><td>${c.id === "theme" ? "<kbd>Ctrl</kbd><kbd>K</kbd> then <kbd>Ctrl</kbd><kbd>T</kbd>" : kbd(c.keys)}</td></tr>`).join("")
    + `<tr><td>Open a tab by position</td><td><kbd>Ctrl</kbd><kbd>1</kbd> … <kbd>Ctrl</kbd><kbd>9</kbd></td></tr><tr><td>Keep a preview tab open</td><td>Double-click the tab or repository</td></tr>`;
}

/* ---------------- Welcome and help ---------------- */
// Shown once on first launch: what the app is, where the token goes, then loading a first account.
// "Show me the token box" steps out to Settings and the walk-through picks up again once a token is saved.
const wl = { step: 0, resume: false };
function openWelcome(step) {
  wl.step = step; wl.resume = false; closePalette();
  $("welcome").hidden = $("wlScrim").hidden = false;
  renderWelcome();
}
function closeWelcome() {
  $("welcome").hidden = $("wlScrim").hidden = true;
  store.set("ra.welcomed", "1");
}
function renderWelcome() {
  const hasToken = S.token && !S.tokenBad && S.me;
  const steps = [
    () => `<h1 id="wlTitle">Welcome to Repo Atlas</h1>
      <p>Repo Atlas maps the repositories of any GitHub account: languages, activity, branches and more. Two quick steps get you going.</p>
      <div class="wl-acts"><button type="button" class="btn primary" data-wl="next">Get started</button><button type="button" class="btn" data-wl="close">Skip, I'll look around</button></div>`,
    () => hasToken ? `<h1 id="wlTitle">Your GitHub token is saved</h1>
      <p>You're signed in as <b>@${esc(S.me.login)}</b>, so your private repositories are included.</p>
      <p class="fine">You can change it any time in Settings: click the gear ${I.gear} at the bottom left, or press <kbd>Ctrl</kbd><kbd>,</kbd>.</p>
      <div class="wl-acts"><button type="button" class="btn primary" data-wl="next">Next</button></div>`
      : `<h1 id="wlTitle">Add your GitHub token</h1>
      <p>This step is optional. A token lets Repo Atlas show your private repositories and the full year of contributions, and raises GitHub's limit from 60 to 5,000 requests an hour.</p>
      <p>The token box lives in Settings. To get there any time, click the gear ${I.gear} at the bottom left of the window, or press <kbd>Ctrl</kbd><kbd>,</kbd>.</p>
      <p class="fine">No token yet? Create one at <a href="https://github.com/settings/tokens?type=beta">github.com/settings/tokens</a> with read-only access to Metadata and Contents, then copy it.</p>
      <div class="wl-acts"><button type="button" class="btn primary" data-wl="token">${I.key}Show me the token box</button><button type="button" class="btn" data-wl="next">Skip this step</button></div>`,
    () => `<h1 id="wlTitle">Load your first account</h1>
      <p>Type a GitHub username, an organization, or a single repository as <span class="mono">owner/repo</span>.</p>
      <form class="trow" id="wlForm" autocomplete="off"><label class="input wide"><input id="wlInput" spellcheck="false" placeholder="e.g. torvalds or microsoft/vscode" aria-label="GitHub account or repository" value="${esc(S.me?.login || "")}"></label><button class="btn primary" type="submit">Load</button></form>
      <p class="fine">Later, press <kbd>Ctrl</kbd><kbd>O</kbd> or click the account name at the top of the sidebar to switch. Press <kbd>F1</kbd> any time for help and keyboard shortcuts.</p>
      <div class="wl-acts"><button type="button" class="btn" data-wl="close">${S.sample ? "Keep the sample data for now" : "Not now"}</button></div>`,
  ];
  $("wlDots").innerHTML = steps.map((_, i) => `<i class="${i === wl.step ? "on" : ""}"></i>`).join("");
  $("wlBody").innerHTML = steps[wl.step]();
  $("welcome").querySelector(".wl-x").innerHTML = I.close;
  const f = $("wlInput") || $("welcome").querySelector(".btn.primary"); if (f) f.focus();
}
// Version numbers come from the app itself (tauri.conf.json), so the About section never goes stale
async function renderAbout() {
  let ver = "web preview", tauri = null;
  if (desktop) { try { ver = await T.app.getVersion(); tauri = await T.app.getTauriVersion(); } catch (e) { console.error(e); } }
  $("aboutVer").textContent = desktop ? "version " + ver : ver;
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $("aboutFacts").innerHTML = row("Version", esc(ver))
    + row("Source code", `<a href="https://github.com/Sand-Runner-75/repo-atlas">github.com/Sand-Runner-75/repo-atlas</a>`)
    + row("License", `<a href="https://github.com/Sand-Runner-75/repo-atlas/blob/main/LICENSE">GNU AGPL-3.0</a>`)
    + row("Report a problem", `<a href="https://github.com/Sand-Runner-75/repo-atlas/issues">Open an issue on GitHub</a>`)
    + row("Your token is kept in", esc(secrets.where))
    + (tauri ? row("Built with", `Tauri ${esc(tauri)}`) : "");
}
function showTokenBox() {
  openSettings();
  for (const el of [$("tokenSetting"), $("gear")]) { el.classList.remove("spot"); void el.offsetWidth; el.classList.add("spot"); setTimeout(() => el.classList.remove("spot"), 4500); }
  $("tokenSetting").scrollIntoView({ block: "nearest" });
  $("token").focus();
}
$("welcome").addEventListener("click", (e) => {
  const b = e.target.closest("[data-wl]"); if (!b) return;
  const a = b.dataset.wl;
  if (a === "next") { wl.step++; renderWelcome(); }
  else if (a === "close") closeWelcome();
  else if (a === "token") {
    $("welcome").hidden = $("wlScrim").hidden = true; wl.resume = true;
    showTokenBox();
    toast("info", "Paste your token in the highlighted box and click <b>Save token</b>. The welcome screen picks up again after that.", 10000);
  }
});
$("welcome").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("wlInput").value.trim(); if (!q) { $("wlInput").focus(); return; }
  closeWelcome(); load(q);
});

/* ---------------- Wiring ---------------- */
function renderCharts() { renderLangs(); renderHeat(); renderRank(); renderYears(); renderLife(); renderScatter(); }
function renderAll() {
  renderProfile(); renderKpis(); renderCharts(); renderComposition(); renderTopics(); renderFeed(); fillLangSelect(); renderTree(); renderAccount(); renderRecent(); renderTabs();
  renderAllNotice();
  showTab(activeId);
}
function renderAllNotice() {
  if (S.sample) notice("sample", `<b>Sample data.</b><span>These projects are invented so you can see every view.</span>
    <span class="nacts"><button type="button" class="btn primary" data-cmd="load">Load a GitHub account</button>${S.token ? "" : `<button type="button" class="btn" data-cmd="token">${I.key}Add GitHub token</button>`}</span>`);
  else notice(null);
}
function showSample() {
  Object.assign(S, sampleData(), { daysSource: "calendar", sample: true, langBytes: null, langMode: "count" });
  closeRepoTabs(); resetFilters(); renderAll();
}
async function clearToken() {
  try { await secrets.clear(); } catch (e) { toast("error", `Couldn't remove the token: ${esc(e)}`); return; }
  await useToken(""); toast("info", "Token removed. Only public data is loaded now.");
}
$("tokenForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const t = $("token").value.trim(); if (!t) { $("token").focus(); return; }
  const was = S.token;
  await useToken(t);
  if (S.tokenBad || !S.me) { toast("error", "GitHub didn't accept that token. Check you copied all of it and that it hasn't expired."); await useToken(was); return; }
  try { await secrets.set(t); } catch (err) { toast("error", `Couldn't save the token to ${esc(secrets.where)}: ${esc(err)}`); return; }
  toast("info", `Token saved. Signed in as <b>@${esc(S.me.login)}</b>.`);
  if (wl.resume) { wl.resume = false; openWelcome(2); return; }
  if (S.sample || S.user.login === S.me.login) load(S.me.login);
});
$("tokenClear").onclick = clearToken;
$("themeSel").onchange = () => { store.set("ra.theme", $("themeSel").value); applyTheme(); };
$("startSel").onchange = () => store.set("ra.start", $("startSel").value);
$("langCount").onclick = () => { S.langMode = "count"; renderLangs(); };
$("langBytes").onclick = () => loadLangBytes();
$("rankSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.rank = b.dataset.m; renderRank(); } });
["q", "fLang", "fType", "fSort"].forEach((id) => $(id).addEventListener("input", renderTree));
document.addEventListener("click", (e) => {
  // Links open in the default browser, never inside the app window
  const a = e.target.closest("a[href]");
  if (a) { const href = a.getAttribute("href"); e.preventDefault(); if (/^https?:/.test(href)) openExternal(href); return; }
  const c = e.target.closest("[data-cmd]"); if (c) return run(c.dataset.cmd);
  const v = e.target.closest("[data-view]"); if (v) return showSide(v.dataset.view);
  if (e.target.closest("#clearTopic")) { S.topic = null; renderTopics(); renderTree(); return; }
  const x = e.target.closest("[data-close]"); if (x) { e.stopPropagation(); return closeTab(x.dataset.close); }
  const tb = e.target.closest("[data-tab]"); if (tb) { if (dbl("tab:" + tb.dataset.tab)) keepTab(tb.dataset.tab); return showTab(tb.dataset.tab); }
  const g = e.target.closest("[data-grp]"); if (g) { const k = g.dataset.grp; S.collapsed.has(k) ? S.collapsed.delete(k) : S.collapsed.add(k); store.set("ra.collapsed", JSON.stringify([...S.collapsed])); renderTree(); return; }
  const ld = e.target.closest("[data-load]"); if (ld) return load(ld.dataset.load);
  const cp = e.target.closest("[data-copy]"); if (cp) return copyText(cp.dataset.copy);
  const op = e.target.closest("[data-open]"); if (op) return openExternal(op.dataset.open);
  const t = e.target.closest("[data-topic]"); if (t) { S.topic = S.topic === t.dataset.topic ? null : t.dataset.topic; renderTopics(); showSide("repos", true); renderTree(); return; }
  const l = e.target.closest("[data-lang]"); if (l) { $("fLang").value = l.dataset.lang; showSide("repos", true); renderTree(); return; }
  const r = e.target.closest("[data-repo]"); if (r) openRepo(r.dataset.repo, !r.closest("#tree") || dbl("repo:" + r.dataset.repo));
});
// Lists re-render on every click, which stops the browser's own dblclick, so double-clicks are detected here
let lastClick = { key: null, at: 0 };
function dbl(key) { const now = Date.now(), hit = lastClick.key === key && now - lastClick.at < 450; lastClick = { key: hit ? null : key, at: now }; return hit; }
function keepTab(id) { const t = tabs.find((x) => x.id === id); if (t?.preview) { t.preview = false; renderTabs(); } }
document.addEventListener("auxclick", (e) => { const tb = e.target.closest("[data-tab]"); if (tb && e.button === 1) closeTab(tb.dataset.tab); });
document.addEventListener("contextmenu", (e) => { if (desktop && !e.target.closest("input, .page")) e.preventDefault(); });
const tip = $("tip");
document.addEventListener("mousemove", (e) => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.getAttribute("data-tip"); tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 14) + "px";
  tip.style.top = (e.clientY + h + 20 > window.innerHeight ? e.clientY - h - 10 : e.clientY + 16) + "px";
});

// The share picture, history replay, README badge and compare view live in their own files and reach the app through this
window.RA = {
  S, I, gh, paged, pool, esc, fmt, kb, ago, dateStr, langColor, explain, toast, busy, copyText, openExternal, desktop,
  contributionCalendar, eventsToDays, palette, openCompare, showTab, renderTabs, linkFor, currentLink, syncUrl,
  activeTab, curRepo, isRepo, load, openRepo, openByName, openPage, openSettings, showSide, renderTree, store, onRepo: (fn) => repoHooks.push(fn),
  repoShown: () => repoFor, addPage: (kind, page) => PAGES[kind] = page, rateLeft: () => rateLeft, addCommands(list) { COMMANDS.splice(COMMANDS.findIndex((c) => c.id === "collapse"), 0, ...list); renderKeys(); },
  busyStart(text) { busyCount++; busy(text); }, busyEnd() { busyCount--; busy(null); },
};

// Boot: sample data first, then the saved token and the account to start with
(async () => {
  applyTheme(); renderKeys(); renderAbout();
  $("startSel").value = store.get("ra.start") || "last";
  if (store.get("ra.nosb")) $("workbench").classList.add("nosb");
  const sv = store.get("ra.side"); if (sv && sv !== "repos" && $("view-" + sv)) showSide(sv, true);
  const asked = linkRequest();
  Object.assign(S, sampleData(), { daysSource: "calendar", sample: true });
  renderAll();
  let saved = null; try { saved = await secrets.get(); } catch (e) { console.error(e); }
  await useToken(saved || "");
  if (!store.get("ra.welcomed")) openWelcome(0);
  if (asked) {
    await load(asked.u);
    if (asked.vs && S.user && !S.sample) window.AtlasCompare?.open(asked.vs);
    return;
  }
  const start = store.get("ra.start") || "last", last = store.get("ra.user");
  if (start === "sample") return;
  const who = start === "me" ? (S.me?.login || last) : (last || S.me?.login);
  if (who) load(who);
})();
})();
