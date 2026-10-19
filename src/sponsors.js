/* Sponsors: your newest GitHub sponsors with a one-click thank-you on X, and the GitHub Action that does it by itself */
(() => {
"use strict";
const RA = window.RA, { esc, I } = RA;
const { modal, head, codebox } = window.AtlasShare;
const { DEFAULT_MESSAGE, SPONSORS_QUERY, sponsorsFrom, thankText } = window.AtlasThanks;
const $ = (id) => document.getElementById(id);
const KEY = "ra.thanks";
const getMessage = () => { try { return localStorage.getItem(KEY) || DEFAULT_MESSAGE; } catch { return DEFAULT_MESSAGE; } };
const setMessage = (m) => { try { m && m !== DEFAULT_MESSAGE ? localStorage.setItem(KEY, m) : localStorage.removeItem(KEY); } catch {} };
let list = null, error = null;

async function fetchSponsors(login) {
  const { data } = await RA.gh("/graphql", { method: "POST", body: JSON.stringify({ query: SPONSORS_QUERY, variables: { l: login, p: true } }) });
  if (data.errors) throw new Error(data.errors[0]?.message || "GitHub couldn't list your sponsors.");
  return sponsorsFrom(data.data);
}
const xIntent = (text) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

function workflow(login, message) {
  return `name: Thank sponsors
on:
  schedule:
    - cron: "17 */6 * * *"   # every 6 hours
  workflow_dispatch:          # and whenever you press "Run workflow"
permissions:
  contents: write
jobs:
  thanks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Sand-Runner-75/repo-atlas/sponsors@main
        with:
          user: ${login}
          message: ${JSON.stringify(message)}
          x-api-key: \${{ secrets.X_API_KEY }}
          x-api-secret: \${{ secrets.X_API_SECRET }}
          x-access-token: \${{ secrets.X_ACCESS_TOKEN }}
          x-access-token-secret: \${{ secrets.X_ACCESS_TOKEN_SECRET }}`;
}

function rows(message) {
  if (error) return `<p class="empty">${esc(error)}</p>`;
  if (!list) return `<p class="empty">Loading your sponsors…</p>`;
  if (!list.length) return `<p class="empty">No sponsors yet. When someone sponsors you, they show up here.</p>`;
  return `<div class="sprows">${list.map((s, i) => `<div class="sprow">
    ${s.avatar ? `<img src="${esc(s.avatar)}&s=64" alt="">` : `<span class="av">${esc(s.name[0].toUpperCase())}</span>`}
    <span class="spn">${esc(s.name)}<span>@${esc(s.login)}${s.tier ? ` · ${esc(s.tier)}` : ""} · ${esc(RA.dateStr(s.at))}</span></span>
    ${s.private ? `<span class="sppriv" title="This sponsor asked to stay private, so they aren't thanked in public">${I.lock}Private</span>`
      : `<button type="button" class="btn" data-thank="${i}" title="${esc(thankText(message, s))}">Thank on X</button>`}
  </div>`).join("")}</div>`;
}

function render() {
  const S = RA.S, me = S.me;
  if (!me) {
    modal(`${head("Thank your sponsors")}<p>Add your GitHub token first (Settings, Ctrl+,). Repo Atlas uses it to see who sponsors you.</p>`);
    return;
  }
  const message = getMessage();
  modal(`${head("Thank your sponsors")}
    <label class="splabel" for="spMsg">Your thank-you message. <span class="mono">{name}</span> becomes the sponsor's name.</label>
    <textarea id="spMsg" class="spmsg" rows="2" maxlength="280" spellcheck="true">${esc(message)}</textarea>
    <div class="acts"><button type="button" class="btn" id="spReset">Reset message</button>
      <button type="button" class="btn" data-open="https://github.com/sponsors/${esc(me.login)}/dashboard">${I.heart}Sponsors dashboard</button></div>
    <div id="spList">${rows(message)}</div>
    <h3>Thank new sponsors automatically</h3>
    <p>A small job in one of your repositories checks for new sponsors every 6 hours and posts your message on X, even when this app is closed. Private sponsors are never posted. The first run only notes who already sponsors you, so nobody gets an old thank-you.</p>
    <ol>
      <li>Create an app at <a href="https://developer.x.com/en/portal/dashboard">developer.x.com</a>, set its permissions to <b>Read and Write</b>, and generate its <b>API key and secret</b> and an <b>access token and secret</b>. X charges a small amount for each post, so add some credit to the project there. A post with a link costs more than one without.</li>
      <li>In one of your GitHub repositories, open <b>Settings → Secrets and variables → Actions</b> and add four secrets: <span class="mono">X_API_KEY</span>, <span class="mono">X_API_SECRET</span>, <span class="mono">X_ACCESS_TOKEN</span> and <span class="mono">X_ACCESS_TOKEN_SECRET</span>.</li>
      <li>Add a file called <span class="mono">.github/workflows/thank-sponsors.yml</span> with this inside:${codebox(workflow(me.login, message))}</li>
      <li>Open the <b>Actions</b> tab, pick <b>Thank sponsors</b> and press <b>Run workflow</b>.</li>
    </ol>`);
  const box = $("spMsg");
  box.oninput = () => { setMessage(box.value.trim()); $("spList").innerHTML = rows(getMessage()); };
  box.onchange = () => render(); // refresh the workflow text once they stop typing
  $("spReset").onclick = () => { setMessage(""); render(); };
}

async function show() {
  const S = RA.S;
  list = null; error = null;
  render();
  if (!S.me) return;
  try { list = await fetchSponsors(S.me.login); }
  catch (e) { error = e.status === 401 ? "GitHub didn't accept your token. Check it in Settings." : "Couldn't load your sponsors: " + (e.message || "unknown error"); }
  if ($("spList")) $("spList").innerHTML = rows(getMessage());
}

$("modal").addEventListener("click", (e) => {
  const b = e.target.closest("[data-thank]"); if (!b || !list) return;
  RA.openExternal(xIntent(thankText(getMessage(), list[+b.dataset.thank])));
});

RA.addCommands([{ id: "sponsors", label: "Sponsors: Thank My Sponsors", when: () => !!RA.S.me, run: show }]);
})();
