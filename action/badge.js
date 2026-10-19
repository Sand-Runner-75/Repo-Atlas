// Runs inside the "Repo Atlas badge" GitHub Action: reads an account from the GitHub API and writes the badge SVG
"use strict";
const fs = require("fs");
const path = require("path");
const { atlasStats, atlasBadgeSVG } = require("../src/badge.js");

const login = (process.env.ATLAS_USER || "").trim();
const out = process.env.ATLAS_PATH || "repo-atlas.svg";
const theme = process.env.ATLAS_THEME === "light" ? "light" : "dark";
const token = process.env.ATLAS_TOKEN || "";
const DAY = 864e5;

async function gh(url, opts = {}) {
  const res = await fetch(url.startsWith("http") ? url : "https://api.github.com" + url, {
    method: opts.method || "GET", body: opts.body,
    headers: { Accept: "application/vnd.github+json", "User-Agent": "repo-atlas-badge", ...(token ? { Authorization: "Bearer " + token } : {}) },
  });
  if (!res.ok) throw new Error(`GitHub returned ${res.status} for ${url}: ${await res.text()}`);
  return res.json();
}
async function main() {
  if (!login) throw new Error("Set the user input to a GitHub username or organization.");
  const user = await gh(`/users/${encodeURIComponent(login)}`);
  const base = user.type === "Organization" ? `/orgs/${user.login}/repos?type=all` : `/users/${user.login}/repos?type=owner`;
  const repos = [];
  for (let p = 1; p <= 15; p++) { const page = await gh(`${base}&per_page=100&page=${p}`); repos.push(...page); if (page.length < 100) break; }
  let days = null, source = "events";
  if (user.type === "User" && token) {
    try {
      const query = "query($l:String!){user(login:$l){contributionsCollection{contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}";
      const r = await gh("/graphql", { method: "POST", body: JSON.stringify({ query, variables: { l: user.login } }) });
      const weeks = r.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
      if (weeks) { days = weeks.flatMap((w) => w.contributionDays).map((d) => ({ date: d.date, count: d.contributionCount })); source = "calendar"; }
    } catch (e) { console.log("Contribution calendar not available, using public events:", e.message); }
  }
  if (!days) {
    const events = [];
    for (let p = 1; p <= 3; p++) { try { const page = await gh(`/users/${user.login}/events/public?per_page=100&page=${p}`); events.push(...page); if (page.length < 100) break; } catch { break; } }
    const counts = {};
    for (const e of events) { const d = e.created_at.slice(0, 10); counts[d] = (counts[d] || 0) + (e.type === "PushEvent" ? (e.payload?.size || 1) : 1); }
    days = []; const end = new Date(); end.setUTCHours(0, 0, 0, 0);
    for (let t = end - 90 * DAY; t <= +end; t += DAY) { const d = new Date(t).toISOString().slice(0, 10); days.push({ date: d, count: counts[d] || 0 }); }
  }
  const svg = atlasBadgeSVG(atlasStats(user, repos, days, source), theme);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, svg);
  console.log(`Wrote ${out} for @${user.login} (${repos.length} repositories)`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
