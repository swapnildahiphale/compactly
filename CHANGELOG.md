# Changelog

All notable changes to Compactly are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The version lives in `plugin/compactly/.claude-plugin/plugin.json`. See
[RELEASING.md](RELEASING.md) for how a release is cut.

## [Unreleased]

### Added

- `CHANGELOG.md`, `RELEASING.md` and `scripts/release-notes.sh` for release notes (#5).
- A release cadence in `RELEASING.md` and a pull request template with a changelog
  checkbox (#7).

### Changed

- The README title is now the Compactly logo, with the "Compact smartly." tagline and the
  launch video embedded inline (#4).
- The marketplace and plugin descriptions start with the "Compact smartly." tagline (#4).
- The README GIFs and annotated screenshots are redrawn to match the launch video, and the
  decision flowchart is now a drawn diagram (#4).
- The docs say that compaction before the cache expires respects `minTokens` and paused
  work (#4).
- The README demo GIF is labeled as an illustrative session, since costs vary by model and
  context (#6).

## [0.7.0] - 2026-10-15

### Added

- A settings page in the panel: turn the panel's sections on or off, and pick the footer's
  fields by preset or one by one. The choices are kept across sessions (#3).
- A footer line that shows the cache state and timer, plus the rebuild cost, pending tips
  and high context when they matter. Pressing it opens the cost & cache pane (#1).

### Changed

- The README is shorter, and the details moved to `docs/`: installation, configuration,
  how it works, and the panel (#2).

### Fixed

- The panel's context size updates as soon as a compaction finishes. Before, Context and
  the cold re-write cost stayed at the pre-compaction value until the next turn.
- After a compaction, the context size is read from the `/context` usage estimate while the
  host has not reported the new token count yet.

## [0.6.0] - 2026-10-14

### Added

- First public version of the plugin.
- Cost & cache panel (`/cost-panel`) for the terminal and the desktop app: stat tiles with
  sparklines (session cost, cache hit, re-read per turn, rebuild if cold), a cache clock,
  the context bar, ranked hints with Compact now / Snooze / Not this session actions, savings
  from compacting, and cost per turn. Where no window can be drawn it replies with a text
  report.
- Compaction at natural breaks (`auto` mode): a judge model (`sonnet`, `haiku` or `off`)
  reads each new prompt on a large context and compacts first with a handoff summary when it
  sees a natural break.
- Compaction shortly before the prompt cache expires, after a git commit, push or PR on a
  large context.
- 👍 / 👎 ratings on automatic compactions (`/compactly-rate up|down`) that tune the judge's
  confidence bar and give it examples from the same project.
- Task-boundary suggestions (`suggest` mode) after git commits, pushes and PRs, with wider
  signal sets through the `signals` option.
- `/compactly` to compact now with instructions to keep open work, decisions and file paths.
- Paused work is left alone: a git signal does not compact when recent prompts say the work
  is paused or blocked.
- Settings: `mode`, `judge`, `minTokens`, `cacheTtl`, `openPanel` and `signals`.

[Unreleased]: https://github.com/swapnildahiphale/compactly/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/swapnildahiphale/compactly/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/swapnildahiphale/compactly/releases/tag/v0.6.0
