# Releasing Compactly

Releases are cut by hand. There is no release workflow. This file covers when a release
happens (the cadence) and how one is cut (the checklist).

## Versioning

Compactly follows [Semantic Versioning](https://semver.org/). While it is below 1.0:

- **Patch** (`0.1.1`): bug fixes, docs and wording changes. Nothing new to configure.
- **Minor** (`0.2.0`): new features, commands or settings. A change that breaks existing
  settings or commands also goes in a minor while we are below 1.0, and it is marked
  **Breaking** in the changelog with what to change.
- **Major** (`1.0.0`): reserved for when the settings and commands are considered stable.

The version lives in one place: `"version"` in `plugin/compactly/.claude-plugin/plugin.json`.
Tags are `vX.Y.Z` and point at the commit on `main` that set that version.

## Cadence

| Release | When | Rule |
|---|---|---|
| Minor | Every second Monday | Only if `[Unreleased]` has user-facing entries. If it is empty or docs-only, skip it and wait for the next slot. |
| Patch | As needed | Within two days of a user-facing bug fix landing on `main`. Don't hold fixes for the next minor. |
| Security fix | Same day | Patch release as soon as the fix is merged. |

Releases happen on Mondays so there is a working week to catch problems before the weekend.
Dates in IST.

### Upcoming

| Date | What | Notes |
|---|---|---|
| Fri 31 Oct 2026 | Freeze | Only fixes merge until the launch is over. |
| Mon 3 Nov 2026 | Minor slot | Normal slot rules: release only if `[Unreleased]` has user-facing entries, otherwise skip. |
| Tue 4 Nov 2026 | Launch (Show HN) | No release of its own. The launch ships whatever release is Latest on GitHub. Check that the README, the release page and compactly.dev show that version. |
| Mon 17 Nov 2026 | Minor slot | Skip if `[Unreleased]` has nothing user-facing. |
| Mon 1 Dec 2026 | Minor slot | Skip if `[Unreleased]` has nothing user-facing. |

After that, every second Monday. If the launch moves, the freeze moves with it (the Friday
before), and the launch still ships the Latest release.

## While you work

Every PR that changes what users see or do adds a line under `## [Unreleased]` in
[CHANGELOG.md](CHANGELOG.md), in the same PR as the change. Use the headings Added, Changed,
Deprecated, Removed, Fixed or Security, and end the line with the PR number, for example
`(#12)`. The PR template has a checkbox for this.

Internal changes (tests, refactors, CI) don't need a line.

## Checklist

1. **Pick the version.** Read `[Unreleased]` and choose `X.Y.Z` using the rules above.
2. **Open a release branch** from an up-to-date `main`: `chore/release-vX.Y.Z`.
3. **Bump the version.** Set `"version"` in
   `plugin/compactly/.claude-plugin/plugin.json`. This is the only manifest that carries a
   version: `.claude-plugin/marketplace.json` has none, and there is no `package.json`. If
   you add a version field anywhere else, add it to this step too. Check with:

   ```sh
   grep -rn '"version"' --include='*.json' .
   ```

4. **Check the requirement line.** If the release needs a newer Claude Code, update the
   minimum version in all three places that state it: `README.md`,
   `plugin/compactly/README.md` and `docs/installation.md`.
5. **Update the changelog.** Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, add a
   new empty `## [Unreleased]` above it, and update the compare links at the bottom:

   ```text
   [Unreleased]: https://github.com/swapnildahiphale/compactly/compare/vX.Y.Z...HEAD
   [X.Y.Z]: https://github.com/swapnildahiphale/compactly/compare/vPREVIOUS...vX.Y.Z
   ```

6. **Open the release PR**, titled `Release X.Y.Z`, with only the bump and the changelog.
   Check that `scripts/release-notes.sh X.Y.Z` prints the new section, then squash-merge it
   into `main`.
7. **Tag the merge commit** on `main` with an annotated tag:

   ```sh
   git switch main && git pull
   grep -q "\"version\": \"X.Y.Z\"" plugin/compactly/.claude-plugin/plugin.json
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

8. **Create the GitHub Release** for the tag, titled `vX.Y.Z`, with the notes taken from the
   changelog:

   ```sh
   scripts/release-notes.sh X.Y.Z > /tmp/notes.md
   gh release create vX.Y.Z --verify-tag --latest --title "vX.Y.Z" --notes-file /tmp/notes.md
   ```

   Without `gh`, open Releases → Draft a new release on GitHub, pick the tag and paste the
   output of `scripts/release-notes.sh X.Y.Z`.

9. **Update compactly.dev.** Change the version and release date shown on the site
   (`softwareVersion` and `datePublished` in its structured data, and any visible version
   text) to match the release.
10. **Announce it if it's notable.** For a minor release, or a fix users have been waiting
    for, write a short post from the release notes for X and LinkedIn. It goes out only
    once I've signed off on the final text. Patch releases don't need a post.

## Hotfix

For a bug that can't wait for the next slot: fix it on a `fix/short-description` branch,
merge it with its changelog line, then run the checklist right away as a patch release.

## Check the release

- `scripts/release-notes.sh X.Y.Z` prints the new section.
- The GitHub Release shows the tag, the notes and the **Latest** badge.
- The version in `plugin.json` on the tagged commit matches the tag.
- `/plugin` in Claude Code shows the new version after a marketplace update.

## Before every push, tag or release

Run a secret scan over what is about to go out, for example `gitleaks git` for commits
and `gitleaks dir` for release notes, and read the diff for keys, tokens or credentials.
