# Changelog

All notable changes to Compactly are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The version lives in `plugin/compactly/.claude-plugin/plugin.json`. See
[RELEASING.md](RELEASING.md) for how a release is cut.

## [Unreleased]

## [0.1.0] - 2026-10-22

First public release.

### Added

- Cost & cache panel (`/cost-panel`) for the terminal and the desktop app: stat tiles with
  sparklines (session cost, cache hit, re-read per turn, rebuild if cold), a cache clock,
  the context bar, ranked hints with Compact now / Snooze / Not this session actions, savings
  from compacting, and cost per turn. Where no window can be drawn it replies with a text
  report.
- A settings page in the panel: turn the panel's sections on or off, and pick the footer's
  fields by preset or one by one. The choices are kept across sessions (#3).
- A footer line beside the prompt that shows the cache state and timer, plus the rebuild
  cost, pending tips and high context when they matter. Pressing it opens the cost & cache
  pane (#1).
- Compaction at natural breaks (`auto` mode): a judge model (`sonnet`, `haiku` or `off`)
  reads each new prompt on a large context and compacts first with a handoff summary when it
  sees a natural break.
- Compaction shortly before the prompt cache expires, after a git commit, push or PR on a
  large context. It respects `minTokens` and leaves paused work alone (#4).
- 👍 / 👎 ratings on automatic compactions (`/compactly-rate up|down`) that tune the judge's
  confidence bar and give it examples from the same project.
- Task-boundary suggestions (`suggest` mode) after git commits, pushes and PRs, with wider
  signal sets through the `signals` option.
- `/compactly` to compact now with instructions to keep open work, decisions and file paths.
- Paused work is left alone: a git signal does not compact when recent prompts say the work
  is paused or blocked.
- The panel's context size updates as soon as a compaction finishes, using the `/context`
  usage estimate until the host reports the new token count.
- Settings: `mode`, `judge`, `minTokens`, `cacheTtl`, `openPanel` and `signals`.
- Docs in `docs/`: installation, configuration, how it works, and the panel (#2).
- `CHANGELOG.md`, `RELEASING.md` and `scripts/release-notes.sh` for release notes (#5).

[Unreleased]: https://github.com/swapnildahiphale/compactly/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/swapnildahiphale/compactly/releases/tag/v0.1.0
