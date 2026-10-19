// Runs inside the "Repo Atlas sponsor thanks" GitHub Action: finds new public sponsors and thanks each one in a post on X
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { SPONSORS_QUERY, sponsorsFrom, sponsorKey, thankText } = require("../src/thanks.js");

const env = (k) => (process.env[k] || "").trim();
const login = env("ATLAS_USER");
const statePath = env("ATLAS_STATE") || ".github/repo-atlas-sponsors.json";
const message = process.env.ATLAS_MESSAGE || "";
const token = env("ATLAS_TOKEN");
const dryRun = env("ATLAS_DRY_RUN") === "true";
const thankExisting = env("ATLAS_THANK_EXISTING") === "true";
const maxPosts = Math.max(1, parseInt(env("ATLAS_MAX_POSTS"), 10) || 5);
const X = { key: env("X_API_KEY"), secret: env("X_API_SECRET"), token: env("X_ACCESS_TOKEN"), tokenSecret: env("X_ACCESS_TOKEN_SECRET") };

// OAuth 1.0a, the sign-in X uses for posting as a person. JSON bodies are not part of the signature.
const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
function oauthHeader(method, url, keys, extra = {}, nonce = crypto.randomBytes(16).toString("hex"), timestamp = Math.floor(Date.now() / 1000).toString()) {
  const o = { oauth_consumer_key: keys.key, oauth_nonce: nonce, oauth_signature_method: "HMAC-SHA1", oauth_timestamp: timestamp, oauth_token: keys.token, oauth_version: "1.0" };
  const params = Object.entries({ ...o, ...extra }).map(([k, v]) => [pct(k), pct(v)]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1);
  const base = [method.toUpperCase(), pct(url), pct(params.map(([k, v]) => `${k}=${v}`).join("&"))].join("&");
  o.oauth_signature = crypto.createHmac("sha1", `${pct(keys.secret)}&${pct(keys.tokenSecret)}`).update(base).digest("base64");
  return "OAuth " + Object.keys(o).sort().map((k) => `${pct(k)}="${pct(o[k])}"`).join(", ");
}
async function postToX(text) {
  const url = "https://api.x.com/2/tweets";
  const res = await fetch(url, { method: "POST", headers: { Authorization: oauthHeader("POST", url, X), "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  const body = await res.text();
  if (!res.ok) {
    const hint = res.status === 401 ? " Check the four X keys are copied in full." : res.status === 403 ? " The X app needs Read and Write permission, and X needs billing set up on the project." : res.status === 402 ? " The X project has no credit left." : "";
    throw new Error(`X refused the post (${res.status}).${hint} ${body}`);
  }
  return JSON.parse(body).data?.id;
}
async function sponsors() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST", body: JSON.stringify({ query: SPONSORS_QUERY, variables: { l: login, p: false } }),
    headers: { "User-Agent": "repo-atlas-sponsors", ...(token ? { Authorization: "Bearer " + token } : {}) },
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.errors) throw new Error(`GitHub returned ${res.status}: ${JSON.stringify(out.errors || out)}`);
  return sponsorsFrom(out.data);
}
function readState() {
  try { return JSON.parse(fs.readFileSync(statePath, "utf8")); } catch { return null; }
}
function writeState(state) {
  fs.mkdirSync(path.dirname(path.resolve(statePath)), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

async function main() {
  if (!login) throw new Error("Set the user input to your GitHub username.");
  if (!dryRun && !(X.key && X.secret && X.token && X.tokenSecret)) throw new Error("Add the four X secrets (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET) to this repository, or set dry-run: true.");
  const list = (await sponsors()).filter((s) => !s.private).reverse(); // oldest first
  let state = readState();
  if (!state) {
    // First run: remember everyone who already sponsors, so turning this on doesn't post a burst of old thank-yous
    state = { thanked: thankExisting ? [] : list.map(sponsorKey) };
    if (!thankExisting) { if (!dryRun) writeState(state); console.log(`First run: noted ${list.length} existing public sponsor(s). New sponsors from now on get a thank-you.`); return; }
  }
  const done = new Set(state.thanked);
  const fresh = list.filter((s) => !done.has(sponsorKey(s)));
  if (!fresh.length) { console.log("No new public sponsors."); return; }
  for (const s of fresh.slice(0, maxPosts)) {
    const text = thankText(message, s);
    if (dryRun) { console.log(`Would post for @${s.login}: ${text}`); continue; }
    console.log(`Posted for @${s.login}: https://x.com/i/status/${await postToX(text)}`);
    state.thanked.push(sponsorKey(s));
    writeState(state); // after every post, so a failure later never posts the same thank-you twice
  }
  if (fresh.length > maxPosts) console.log(`${fresh.length - maxPosts} more new sponsor(s) will be thanked on the next run.`);
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { oauthHeader };
