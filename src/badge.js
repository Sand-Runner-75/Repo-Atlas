/* Headline numbers for an account and the README badge drawn from them.
   Shared by the app (share picture, compare view, badge preview) and the GitHub Action in action/,
   so this file has no dependencies and works both in a browser and in Node. */
(function (root) {
"use strict";
const DAY = 864e5;
const LANG = { JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5", Java: "#b07219", C: "#555555", "C++": "#f34b7d", "C#": "#178600", Go: "#00ADD8", Rust: "#dea584", Ruby: "#701516", PHP: "#4F5D95", Swift: "#F05138", Kotlin: "#A97BFF", Dart: "#00B4AB", HTML: "#e34c26", CSS: "#663399", SCSS: "#c6538c", Shell: "#89e051", "Jupyter Notebook": "#DA5B0B", Vue: "#41b883", Svelte: "#ff3e00", Lua: "#000080", R: "#198CE7", Scala: "#c22d40", Haskell: "#5e5086", Elixir: "#6e4a7e", Dockerfile: "#384d54", PowerShell: "#012456", "Objective-C": "#438eff", Julia: "#a270ba", Zig: "#ec915c", Nix: "#7e7eff", HCL: "#844FBA", Astro: "#ff5a03", GDScript: "#355570", OCaml: "#ef7a08", Elm: "#60B5CC" };
const langColor = (l) => {
  if (!l) return "#9d9d9d";
  if (LANG[l]) return LANG[l];
  let h = 0; for (const c of l) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 52%)`;
};
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : Number(n).toLocaleString("en-US");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// days: [{ date: "YYYY-MM-DD", count }], oldest first. daysSource: "calendar" (a year of contributions) or "events" (90 days of public events)
function atlasStats(user, repos, days, daysSource) {
  const own = repos.filter((r) => !r.fork);
  const sum = (k) => own.reduce((a, r) => a + (r[k] || 0), 0);
  const lc = {}; for (const r of own) if (r.language) lc[r.language] = (lc[r.language] || 0) + 1;
  const total = Object.values(lc).reduce((a, v) => a + v, 0) || 1;
  const langs = Object.entries(lc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, share: n / total, color: langColor(name) }));
  const top = [...own].sort((a, b) => b.stargazers_count - a.stargazers_count)[0] || null;
  days = days || [];
  let best = 0, run = 0;
  for (const d of days) { run = d.count ? run + 1 : 0; best = Math.max(best, run); }
  // Today may simply not have happened yet, so the current streak can end yesterday
  let cur = 0; for (let i = days.length - 1; i >= 0; i--) { if (days[i].count) cur++; else if (i === days.length - 1) continue; else break; }
  const wd = [0, 0, 0, 0, 0, 0, 0]; for (const d of days) wd[new Date(d.date + "T12:00:00Z").getUTCDay()] += d.count;
  const busiest = days.reduce((a, d) => d.count > (a?.count || 0) ? d : a, null);
  const s = {
    login: user.login, name: user.name || user.login, avatar: user.avatar_url || null, type: user.type || "User",
    since: new Date(user.created_at || Date.now()).getFullYear(), followers: user.followers || 0,
    repos: repos.length, original: own.length, stars: sum("stargazers_count"), forks: sum("forks_count"),
    active: repos.filter((r) => Date.now() - new Date(r.pushed_at) < 30 * DAY).length,
    langs, langCount: Object.keys(lc).length, top: top && top.stargazers_count ? { name: top.name, stars: top.stargazers_count, language: top.language } : null,
    contributions: days.reduce((a, d) => a + d.count, 0), contribLabel: daysSource === "calendar" ? "contributions this year" : "actions in 90 days",
    streak: best, current: cur, weekday: wd.some(Boolean) ? WEEKDAY[wd.indexOf(Math.max(...wd))] : null,
    busiest: busiest ? { date: busiest.date, count: busiest.count } : null,
    days: days.slice(-182),
  };
  s.title = archetype(s);
  return s;
}
// A playful one-line title, the part people screenshot
function archetype(s) {
  const per = s.original ? s.stars / s.original : 0;
  if (s.stars >= 1000 && per >= 50) return "Hit maker";
  if (s.type === "Organization") return s.repos >= 100 ? "Open source powerhouse" : "Builders' collective";
  if (s.streak >= 60) return "Streak machine";
  if (s.langCount >= 8) return "Polyglot";
  if (s.stars >= 250) return "Crowd favorite";
  if (s.original >= 60) return "Serial builder";
  if (s.weekday === "Saturday" || s.weekday === "Sunday") return "Weekend hacker";
  if (s.active >= 8) return "Always shipping";
  if (s.since <= new Date().getFullYear() - 10) return "GitHub veteran";
  return "Rising builder";
}

const THEMES = {
  dark: { bg: "#0d1117", border: "#30363d", ink: "#e6edf3", muted: "#8d96a0", accent: "#4daafc", track: "#21262d", heat: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"] },
  light: { bg: "#ffffff", border: "#d0d7de", ink: "#1f2328", muted: "#656d76", accent: "#0969da", track: "#eaeef2", heat: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"] },
};
// The README card: 495 × 195, like the stats cards people already put on their profiles
function atlasBadgeSVG(s, theme) {
  const t = THEMES[theme] || THEMES.dark, W = 495, H = 195, font = "'Segoe UI', -apple-system, Ubuntu, sans-serif";
  const nums = [["Stars", fmt(s.stars)], ["Repos", fmt(s.repos)], [s.contribLabel.startsWith("contrib") ? "Contributions" : "Actions (90d)", fmt(s.contributions)], ["Best streak", s.streak + "d"]];
  const stat = nums.map(([k, v], i) => `<g transform="translate(${25 + i * 115},78)"><text y="0" fill="${t.ink}" font-size="22" font-weight="600">${esc(v)}</text><text y="18" fill="${t.muted}" font-size="11">${esc(k)}</text></g>`).join("");
  let x = 25; const bw = W - 50;
  const bar = s.langs.map((l) => { const w = Math.max(2, l.share * bw); const r = `<rect x="${x.toFixed(1)}" y="122" width="${w.toFixed(1)}" height="8" fill="${l.color}"/>`; x += w; return r; }).join("");
  let lx = 25; const legend = s.langs.slice(0, 4).map((l) => { const label = `${l.name} ${Math.round(l.share * 100)}%`; const g = `<g transform="translate(${lx},150)"><circle cx="4" cy="-4" r="4" fill="${l.color}"/><text x="12" y="0" fill="${t.muted}" font-size="11">${esc(label)}</text></g>`; lx += 22 + label.length * 6.2; return lx < W - 20 ? g : ""; }).join("");
  // The last 26 weeks as a strip of squares on the right of the title
  const days = s.days.slice(-26 * 7), nz = days.map((d) => d.count).filter(Boolean).sort((a, b) => a - b);
  const q = [0.25, 0.5, 0.75].map((p) => nz[Math.floor(p * (nz.length - 1))] || 1);
  const lvl = (c) => c === 0 ? 0 : c <= q[0] ? 1 : c <= q[1] ? 2 : c <= q[2] ? 3 : 4;
  const heat = days.map((d, i) => `<rect x="${W - 25 - (Math.ceil(days.length / 7) - Math.floor(i / 7)) * 5 + 1}" y="${18 + (i % 7) * 5}" width="4" height="4" rx="1" fill="${t.heat[lvl(d.count)]}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.name)} on Repo Atlas: ${fmt(s.stars)} stars, ${fmt(s.repos)} repositories">
<title>${esc(s.name)} · Repo Atlas</title>
<g font-family="${font}">
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="6" fill="${t.bg}" stroke="${t.border}"/>
<text x="25" y="35" fill="${t.ink}" font-size="17" font-weight="600">${esc(s.name.length > 26 ? s.name.slice(0, 25) + "…" : s.name)}</text>
<text x="25" y="53" fill="${t.accent}" font-size="12" font-weight="600">${esc(s.title)}<tspan fill="${t.muted}" font-weight="400"> · @${esc(s.login)} · since ${s.since}</tspan></text>
${heat}${stat}
<rect x="25" y="122" width="${bw}" height="8" rx="4" fill="${t.track}"/>
<clipPath id="lc"><rect x="25" y="122" width="${bw}" height="8" rx="4"/></clipPath><g clip-path="url(#lc)">${bar}</g>
${legend}
<text x="${W - 25}" y="${H - 14}" fill="${t.muted}" font-size="10" text-anchor="end">Repo Atlas</text>
</g></svg>`;
}

const api = { atlasStats, atlasBadgeSVG, langColor, fmt };
if (typeof module === "object" && module.exports) module.exports = api; else root.AtlasBadge = api;
})(typeof window !== "undefined" ? window : globalThis);
