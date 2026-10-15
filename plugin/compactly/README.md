# compactly

**Compact smartly.**

A Claude Code mod that shows what your session costs and compacts it at task boundaries,
with a summary written as a handoff for the next task.

## What it does

- **Cost & cache panel** (`/cost-panel`): what each turn costs, when the prompt cache
  expires, and ranked hints: task boundary, cache expiring or cold, unexpected cache rebuild,
  large context, a cheaper model, large tool output. From top to bottom it has:
  - a header with the model, the cache TTL, a **⚙ Settings** button and a **Compact** button;
  - four stat tiles with sparklines: Session cost, Cache hit, Re-read per turn, Rebuild if cold;
  - a cache clock bar with warm, compact-window and cold zones, a marker at now, and a legend;
  - the Context bar;
  - ranked hints, each with **1 Compact now**, **2 Snooze 10 min** and **3 Not this session**
    (hotkeys 1, 2, 3 act on the top hint only);
  - Saved by compacting, and Cost per turn.

  **⚙ Settings** turns each section on or off and picks the footer line's fields (presets
  `minimal`, `cost`, `standard`, or custom); choices are kept across sessions.

  A one-line **footer line** beside the prompt keeps the cache state in view when the panel is
  closed (`● warm 42m · $0.36 if cold · ▲ 1 tip`). Press it to open the panel.

  The terminal draws text bars; the desktop app draws SVG. Clicking the buttons in the CLI
  needs `/tui fullscreen`; the hotkeys work without it. Where no window can be drawn, the
  command replies with the same report as text.
- **Compaction at natural breaks** (`auto` mode): when you send a prompt and the context is
  at least `minTokens`, a judge model (Claude Sonnet by default) reads a short digest of the
  session and the new prompt. If it sees a natural break with enough confidence, the plugin
  holds the prompt back, compacts with a handoff summary that also names the new prompt, and
  then sends it. The prompt you see in the transcript is then sent by the plugin. A prompt
  with an image or an `@`-mention is never held back, because a plugin can't send those again.
  Neither is a prompt from an SDK host (`claude -p` or another stream-json host), where a held-back
  prompt would be lost. There the git signals decide, as with `judge=off`.
- **Compaction before the cache expires** (`auto` mode with a judge): after a turn with a
  git commit, push or PR on a large context, if no prompt follows, the plugin compacts 5
  minutes before the 1-hour cache expires (1 minute before the 5-minute one). The summarizer
  still reads the context from cache, and when you come back your next message re-writes the
  short summary instead of the whole context. A prompt sent before then cancels it, and the
  judge decides as usual. This only runs while Claude Code stays open.
- **Paused work is left alone**: if your last three prompts, or the answers since, say work is
  paused, on hold, blocked or waiting ("paused after step 3, resume once replica lag drops"),
  a git signal does not compact automatically. The plugin logs why; run `/compactly` if
  it is safe. The judge still decides at your next prompt.
- **👍 / 👎 on each automatic compaction**: a band above the prompt asks whether it was a
  natural break (or run `/compactly-rate up|down`). The judge learns from the answers:
  - each 👎 in your last 20 ratings raises the confidence it needs by 0.05, and each 👍
    lowers it by 0.02, never below where it started or above 0.9;
  - your newest three 👍 and three 👎 from the same project go into the judge's prompt as
    examples of where your work really ends.

  Ratings are kept in the plugin's store under `~/.claude`, with the digest the judge read
  (the start of your prompts and of the agent's answer, and file names) and the project's
  root. Ratings from every project move the confidence bar, but a digest is only shown to the
  judge in the project it was rated in, so prompts from one project never reach another's.
- **Task-boundary suggestions** (`suggest` mode): after a successful `git commit`, `git push`
  or `gh pr create/merge` command (more categories via `signals`), once the turn ends and the
  context is at least `minTokens`, it suggests `/compactly`. With `judge=off`, `auto` mode
  compacts on these signals instead.
- **`/compactly`**: compact now, with instructions to keep open work, paused work and
  why it stopped, decisions with their reasons, and file paths.
- **Saved by compacting**: what your compactions have saved, in the panel and in
  `/cost-panel`'s text. Each turn after a compaction is credited with the context it no
  longer re-reads; the compaction's own cost (the summarizer, and writing the new context to
  the cache) is taken off first, so a fresh compaction shows a small loss until it pays back.
  A compaction after the cache expired is priced against the full re-write the next turn
  would have needed anyway: it isn't charged for writing the new context, and the next turn
  is credited with the re-write it avoided.
  Your `/compact` counts; autocompact doesn't, since it would have run anyway. An all-time
  total across sessions earns levels, from Cache Rookie ($0) to Compaction Legend ($500),
  with a toast when you reach one. The total is kept in the plugin's own store under
  `~/.claude`: dollar amounts and counts only, one entry per session.

See [the decision flow](../../diagrams/architecture.md#plugin-decision-flow-compactly).

## Install and configure

Requires Claude Code 2.1.295 or later. Install and settings are covered in the top-level
[README](../../README.md#install), [installation](../../docs/installation.md) and
[configuration](../../docs/configuration.md).

## Develop

```bash
claude plugin validate plugin/compactly
claude plugin test plugin/compactly
```

`.claude-plugin/types/` is generated by the Claude Code plugin tooling and is not committed;
`tsconfig.json` extends it.
