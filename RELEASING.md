# Releasing Compactly

Releases are cut by hand. There is no release workflow.

Compactly follows [Semantic Versioning](https://semver.org/): a patch (`0.7.1`) for fixes, a
minor (`0.8.0`) for new features or settings, and a major for changes that break existing
settings or commands.

## While you work

Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) in the same PR as the
change. Use the headings Added, Changed, Deprecated, Removed, Fixed or Security, and end the
line with the PR number, for example `(#12)`.

## Checklist

1. **Pick the version.** Read the Unreleased section and choose `X.Y.Z`.
2. **Bump the version.** Set `"version"` in
   `plugin/compactly/.claude-plugin/plugin.json`. This is the only manifest that carries a
   version: `.claude-plugin/marketplace.json` has none, and there is no `package.json`. If
   you add a version field anywhere else, add it to this step too. Check with:

   ```sh
   grep -rn '"version"' --include='*.json' .
   ```

3. **Update the changelog.** Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, add a
   new empty `## [Unreleased]` above it, and update the compare links at the bottom:

   ```text
   [Unreleased]: https://github.com/swapnildahiphale/compactly/compare/vX.Y.Z...HEAD
   [X.Y.Z]: https://github.com/swapnildahiphale/compactly/compare/vPREVIOUS...vX.Y.Z
   ```

4. **Open a PR** with the bump and the changelog, for example `Release X.Y.Z`, and merge it
   into `main`.
5. **Tag the merge commit** on `main`:

   ```sh
   git switch main && git pull
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

6. **Create the GitHub Release** for the tag, titled `vX.Y.Z`, with the notes taken from the
   changelog:

   ```sh
   scripts/release-notes.sh X.Y.Z > /tmp/notes.md
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file /tmp/notes.md
   ```

   Without `gh`, open Releases → Draft a new release on GitHub, pick the tag and paste the
   output of `scripts/release-notes.sh X.Y.Z`.

7. **Update compactly.dev.** Change the version and release date shown on the site
   (`softwareVersion` and `datePublished` in its structured data, and any visible version
   text) to match the release.
8. **Announce it if it's notable.** For a minor or major release, or a fix users have been
   waiting for, share the release notes on the project's social channels.

## Check the release

- `scripts/release-notes.sh X.Y.Z` prints the new section.
- The GitHub Release shows the tag and the notes.
- `/plugin` in Claude Code shows the new version after a marketplace update.
