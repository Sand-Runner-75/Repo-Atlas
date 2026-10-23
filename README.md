# Repo Atlas

A desktop app that maps any GitHub user's or organization's repositories: activity, languages, lifespans, a git-flow branch graph and more. It looks and works like the editors developers already use: an activity bar and sidebar, editor tabs, a command palette, a status bar, and a dark theme by default.

## Install on Windows

1. Open the [latest release](https://github.com/Sand-Runner-75/Repo-Atlas/releases/latest) and download `Repo Atlas_<version>_x64-setup.exe`.
2. Double-click it. It installs for your user only, so no admin rights are needed.
3. Windows may say *"Windows protected your PC"* because the installer isn't code-signed. Click **More info**, then **Run anyway**.
4. Open **Repo Atlas** from the Start menu.

Builds of unreleased changes are on the **Actions** tab: open the latest green **Windows app** run and download **Repo-Atlas-Windows-Installer** under **Artifacts**.

## Using it

- Press **Ctrl+O** and type a username, an organization or `owner/repo`.
- Click a repository in the sidebar to preview it in a tab; double-click to keep the tab open.
- Press **Ctrl+Shift+P** for every command, **Ctrl+P** to jump to a repository, **F5** to refresh.
- Open **Settings** with **Ctrl+,** (or the gear at the bottom left) to add a GitHub token or switch theme.
- Press **F1** (or the question mark above the gear) for help and the full list of shortcuts.
- The first launch shows a short welcome screen that walks through adding a token and loading an account. Help can show it again.

## GitHub token

Optional. A token adds your private repositories and the full-year contribution calendar, and raises GitHub's limit from 60 to 5,000 requests an hour. Create a fine-grained token at <https://github.com/settings/tokens?type=beta> with read-only access to **Metadata** and **Contents**, then paste it in Settings.

The app saves the token in **Windows Credential Manager** (macOS Keychain or the Linux keyring elsewhere), never in a file, and only sends it to `api.github.com`.

## What it shows

- Profile summary and headline numbers (repos, stars, forks, open issues, recent activity, languages)
- Language breakdown by repo count, or by bytes of code
- Contribution heatmap (full year with a token, last 90 days of public events without one)
- Top repositories by stars, forks, issues or size
- Repositories created per year (original vs. fork) and project lifespans
- Stars against recency scatter, sized by repo size
- Composition: repo types, licenses, default branch names; topics and recent public events
- Per repository: a git-flow branch graph with merges and tags, commits per week, languages, branches compared with the default branch, contributors and the clone URL
- Repos shared with you through organizations or as a collaborator (with a token)

## Share it

- **Web version.** The same app runs in any browser at <https://sand-runner-75.github.io/Repo-Atlas/>, no install needed. Links open straight to what they name: `?u=torvalds` for an account, `?u=torvalds/linux` for a repository, `?u=alice&vs=bob` for a comparison. **Share: Copy Link to This View** in the command palette gives you the link for whatever is on screen.
- **Share picture.** **Share** on the overview draws a picture of the profile (headline numbers, languages, six months of activity and a playful title) to download, copy, or post on X or LinkedIn.
- **History replay.** **Replay history** on a repository's branch graph plays it commit by commit; **Save as GIF** turns that into an animation.
- **Compare.** **Compare** puts the account side by side with any other, scores eight rounds, and makes a matchup picture to share.
- **README badge.** **README badge** shows a stats card for a GitHub profile and the few lines that keep it up to date every day:

```yaml
# .github/workflows/repo-atlas.yml in your profile repository
name: Repo Atlas badge
on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch:
permissions:
  contents: write
jobs:
  badge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Sand-Runner-75/Repo-Atlas@main
        with:
          user: your-username
```

Then add `[![Repo Atlas](./repo-atlas.svg)](https://sand-runner-75.github.io/Repo-Atlas/?u=your-username)` to the README.

## Thank your sponsors

If you have GitHub Sponsors, load your own account and press **Sponsors**. It lists your newest sponsors with a **Thank on X** button that opens a ready-written post. Private sponsors are marked and never posted.

To thank new sponsors automatically, add the four keys of an X app with Read and Write permission as repository secrets (`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`) and this workflow. X charges a small amount for each post.

```yaml
# .github/workflows/thank-sponsors.yml
name: Thank sponsors
on:
  schedule:
    - cron: "17 */6 * * *"
  workflow_dispatch:
permissions:
  contents: write
jobs:
  thanks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Sand-Runner-75/Repo-Atlas/sponsors@main
        with:
          user: your-username
          message: "Thank you {name} for sponsoring my open source work on GitHub! 💜"
          x-api-key: ${{ secrets.X_API_KEY }}
          x-api-secret: ${{ secrets.X_API_SECRET }}
          x-access-token: ${{ secrets.X_ACCESS_TOKEN }}
          x-access-token-secret: ${{ secrets.X_ACCESS_TOKEN_SECRET }}
```

The first run only notes who already sponsors you; from then on each new public sponsor gets one post. Set `dry-run: "true"` to see the posts without sending them.

## Support Repo Atlas

Repo Atlas is free. If it helps you, you can [sponsor it on GitHub](https://github.com/sponsors/Sand-Runner-75) or use the **Sponsor** button at the top of this page.

## Building it yourself

The app is [Tauri 2](https://tauri.app): plain HTML, CSS and JavaScript in `src/`, with a small Rust shell in `src-tauri/` that stores the token.

You need [Node.js](https://nodejs.org) 20+ and [Rust](https://rustup.rs). On Windows the WebView2 runtime is already installed with Windows 10 and 11.

```bash
npm ci
npm run dev     # run the app with live reload of src/
npm run build   # build the installer into src-tauri/target/release/bundle/
```

`src/index.html` also opens directly in a browser for quick UI work. There the token falls back to the browser's local storage.

## Releasing

Bump `version` in `package.json` and `src-tauri/tauri.conf.json`, then push a tag such as `v0.3.0`. The **Windows app** workflow builds the installer and attaches it to a new release on the Releases page.

## License

Copyright (c) 2026 Sand Runner

Repo Atlas is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). You can use, change and share it freely, but if you share a changed version, or run one as a service for others, you must publish your source code under the same license.

Companies that want to use Repo Atlas under different terms can contact Sand Runner through [GitHub](https://github.com/Sand-Runner-75).

Versions up to and including v0.2.0 were released under the MIT License.
