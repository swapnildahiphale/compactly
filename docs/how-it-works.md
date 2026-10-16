# How it works

## How it decides

In `auto` mode (the default):

1. You send a prompt and the context is at least `minTokens` (default 150K).
2. Claude Sonnet reads a short digest: how the session started, your last two prompts, the
   files edited since, the start of the last answer, and the new prompt. It says whether this
   is a natural break, and how confident it is. One check costs well under a cent.
3. At a break with enough confidence, the mod holds your prompt back and compacts with a
   handoff summary. The summary keeps open work, paused work and why it stopped, decisions
   with their reasons, and file paths. Then it sends the prompt.
4. You rate the compaction 👍 or 👎. Each 👎 raises the confidence the judge needs. Every
   rating becomes an example the judge reads from then on, in that project only.

**If no prompt follows.** The judge can only decide when you send a prompt. After a long
break the cache has expired, and the summarizer would read the whole context at full price
instead of the cache-read price. With the 133K context from
[Coming back after a break](panel.md#coming-back-after-a-break), on Claude Opus 5.5 and the 1-hour
cache, that is about $0.17 for a warm compaction and up to $1.20 for a cold one. So after a
turn with a git commit, push or PR, if no prompt follows, the mod compacts 5 minutes
before the cache expires (1 minute with the 5-minute cache). A prompt before then cancels
this, and the judge decides as usual. This needs a judge (`judge` not `off`), a context of at
least `minTokens`, and recent prompts that don't say work is paused (see below).

**Paused work.** A commit does not always mean the work is done. You may commit half a
migration and pause the rest. If your last three prompts, or the answers since, say work is
paused, on hold, blocked or waiting, no git signal compacts automatically. The summary is
where "why we stopped" would get lost, so that compaction is left to you.

**`suggest` mode.** A successful `git commit`, `git push` or `gh pr create/merge` on a large
context makes the mod suggest `/compactly`. With `judge` set to `off`, `auto` mode compacts
on those signals instead.

See the [decision flow](../diagrams/architecture.md#plugin-decision-flow-compactly).

## How it compares

| Option | When it runs | Summary |
|---|---|---|
| `/compact` | when you type it | general history of the conversation |
| `/compact <instructions>` | when you type it | steered by your instructions |
| autocompact (built in) | when the context nears the window limit | general |
| idle compaction (built in) | after about 55 min idle, context ≥ 200K | general |
| `/clear`, new session | when you run it | none; only CLAUDE.md and memory remain |
| **`/compactly`** (or automatic) | when you type it, or at a natural break before the next prompt, context ≥ `minTokens` | handoff for the next task |

compactly uses the same compaction engine as `/compact`, with handoff instructions, at a
moment you would otherwise have to notice yourself.

- Autocompact waits until the window is nearly full. On a 1M-context model you pay for a very
  large context on every turn before it fires, and it often fires mid-task.
- Idle compaction depends on time, not on work.
- compactly compacts right after a piece of work is done, earlier than either, and keeps the
  open work, decisions and file paths.

The trade-off: the judge is sometimes wrong, so some automatic compactions land mid-task. How
often is not measured yet (see [Why these defaults](#why-these-defaults)). Rate them, and the
judge becomes more careful. Set `mode` to `suggest` if you would rather confirm each one. Use
`/clear` when the next task needs no history, and leave autocompact on as a safety net.

## Why these defaults

Git signals (commit, push, PR) mark the end of a task only loosely, so the default `auto` mode
lets the judge decide at prompt time instead. The judge is Claude Sonnet 5.5 by default. Its
error rate is not measured here. Your 👍 and 👎 ratings are the labels the mod learns from,
and they show how often the judge is right for you. Switch to `suggest` mode if mid-task
compactions cost you more than they save.

See the [judge's flow](../diagrams/architecture.md#prompt-time-judge). Set `judge` to `haiku` for
a cheaper detector that starts at confidence 0.8 and compacts less often.

## Limitations

- Prices are list prices as of 2026-10. Other pricing changes the absolute numbers, not the
  ranking of policies.
