# compactly

A Claude Code plugin with two jobs:

- Compact your session when a task ends, with a summary written as a handoff for the next task.
- Show what each turn costs and when the prompt cache expires, in a cost & cache panel.

![Demo: an 840K context, the Sonnet judge finds a natural break, the plugin compacts 840K → 14K for $0.34, pays for itself in 3 turns, and saves $6.77 after the cache goes cold](images/demo-large-context.gif)

## Why

Claude Code re-reads the whole conversation on every request. A large context carried into
an unrelated task is paid for again on every turn. Compacting in the middle of a task saves
money but drops what the task still needs. compactly compacts in between: right after the
work is done.

The plugin is in [plugin/compactly/](plugin/compactly/).

## The panel

Here is a session in the Claude Code CLI: the transcript on the left, the panel on the right.
The user asks Claude to commit, and the plugin compacts when that turn ends. That is `auto`
mode with `judge=off`. Items 7 and 8 say what the default Sonnet judge does instead (see
[How it decides](#how-it-decides)).

![compactly in the Claude Code CLI](images/1-annotated.png)

Open the panel with `/cost-panel`. In the terminal it draws bars as text. In the desktop app
it draws SVG.

1. **Header**: the model, the cache TTL (the `cacheTtl` setting), and a **Compact** button.
2. **Stat tiles**, each with a sparkline over recent turns:
   - **Session cost**: the cost so far.
   - **Cache hit**: the share of input read from the cache.
   - **Re-read per turn**: what the current context costs on every request.
   - **Rebuild if cold**: what it costs to write the context to the cache again.
3. **Cache clock**: a bar that drains as the cache ages. It has three zones: warm, the
   compact window (the last 5 minutes of a 1-hour TTL, the last minute of a 5-minute one),
   and cold. A marker shows now, and a legend names the zones. While an automatic compaction
   is armed, a line below the clock says when it fires and what it saves.
4. **Context**: tokens in the context against the model's window (here 29K of 1M).
5. **Hints**: ranked suggestions, each one a set of actions: **1 Compact now**, **2 Snooze 10
   min**, **3 Not this session**. Hotkeys 1, 2 and 3 act on the top hint only. Hints cover a
   task boundary, an expiring or cold cache, an unexpected cache rebuild, a large context, a
   cheaper model and a large tool output. Here there is nothing to act on.
6. **Cost per turn**: the last turn split into cache read, cache write, output and uncached
   input.

The task boundary, as `judge=off` handles it:

7. **Boundary signal**: Claude runs a successful `git commit`. With `judge=off`, a commit,
   push or PR ends a task. With the default Sonnet judge it does not compact by itself. It
   only arms a compaction before the cache expires, in case no prompt follows.
8. **Compaction**: when the turn ends, the plugin compacts with a handoff summary. The
   context drops from 29K to 3K tokens. The summarizer reads the 29K from the cache, which
   costs much less than reading it fresh. With the judge, this happens when you send the next
   prompt and the judge sees a natural break.
9. **Next task**: the next prompt ("push it") runs on the 3K summary, not the full 29K.

Clicking the panel's buttons in the CLI needs `/tui fullscreen`. The hotkeys work without it.

### Saved by compacting

The panel right after one compaction on Claude Opus 5.5:

![The Saved by compacting section of the cost & cache panel](images/3-annotated.png)

1. **Net saving this session**: what compactions saved, minus what they cost. The cost is the
   summarizer's request plus writing the smaller context to the cache. Right after a
   compaction it is negative, here −$0.085.
2. **Per-turn saving**: the compaction took 38K tokens out of the context. Later turns no
   longer re-read them, which saves about $0.008 a turn.
3. **Payback**: how many more turns until the saving covers the cost, here 12. After that the
   net is positive.
4. **Level**: the all-time total across sessions sets the level, from Cache Rookie to
   Compaction Legend.
5. **Next level**: a bar and the amount left to reach it. Context Trimmer starts at $1, so
   $1.08 is left from −$0.085.

### Coming back after a break

When you return to an old session, Claude Code shows its own notice:

![Claude Code's idle notice](images/2-annotated.png)

1. **Idle time**: how long since your last message, here a day and two hours.
2. **Cache expired**: the prompt cache lasts for its TTL (5 minutes or 1 hour), so after a
   longer break it is gone.
3. **Re-cache**: your next message writes the whole context to the cache again. A cache write
   costs many times a cache read: 40 times on Claude Opus 5.5 with the 1-hour TTL.

The notice counts tokens. The panel's cache clock and its **Cache is cold** hint give the
price, and suggest `/clear` if you are starting something new. For a 133K context on Claude
Opus 5.5 they read:

```
○ Cold: the next message re-writes 133K ($1.06)
◆ Cache is cold (~$1.06 at stake). Your next message re-writes 133K ($1.06). Starting
  something new? /clear and restate the task instead.
```

## Install

The plugin works in the Claude Code CLI and the desktop app. It needs Claude Code 2.1.295 or
later.

### 1. Update Claude Code to 2.1.295 or later

**Claude Code CLI**

```bash
claude --version
```

If the version is lower and you installed with Homebrew, switch to the `claude-code@latest`
cask. The plain `claude-code` cask lags behind (2.1.286 at the time of writing), and the two
casks can't be installed side by side:

```bash
brew uninstall --cask claude-code
brew install --cask claude-code@latest
claude --version        # 2.1.295 (Claude Code) or later
```

Later updates: `brew upgrade --cask claude-code@latest`. If you used the native installer
instead of Homebrew, run `claude update`.

### 2. Install the plugin

**Claude Code CLI**

From a shell:

```bash
claude plugin install compactly --marketplace /path/to/compactly
```

or inside Claude Code:

```
/plugin marketplace add /path/to/compactly
/plugin install compactly@compactly
```

This adds the marketplace and enables the plugin in `~/.claude/settings.json`.

### 3. Set options (optional)

The CLI and the extension share these settings. The defaults (`auto` mode, the Sonnet judge,
150K tokens) work as they are. To change them, pass `--config` when installing:

```bash
claude plugin install compactly --marketplace /path/to/compactly \
  --config mode=suggest --config minTokens=100000
```

or run `/plugin configure compactly@compactly` inside the CLI, or edit
`~/.claude/settings.json` by hand. Add the `pluginConfigs` block next to the keys already in
the file; don't replace the file:

```json
{
  "pluginConfigs": {
    "compactly@compactly": {
      "options": {
        "mode": "suggest",
        "minTokens": 100000
      }
    }
  }
}
```

The key is `<plugin>@<marketplace>`, which is `compactly@compactly`. Start a new session for
changes to take effect. All options are in the [plugin README](plugin/compactly/README.md#settings).

### 4. Use it

- `/cost-panel` opens the cost & cache panel. In a window-less host it prints the same report
  as text.
- `/compactly` compacts now.
- In `auto` mode (the default), Claude Sonnet reads each new prompt once the context is
  large. If the prompt starts after a natural break, the plugin compacts first and then sends
  the prompt.
- After each automatic compaction, a band above the prompt asks **👍 Yes** or **👎 No, I was
  mid-task**. The judge learns from your answers.
- In `suggest` mode, the plugin tells you when a git commit, push or PR is a good moment to
  compact.

The panel also keeps score. **Saved by compacting** shows what your compactions saved this
session after their own cost, and an all-time total across sessions earns levels (Cache Rookie
→ Compaction Legend). See [Saved by compacting](#saved-by-compacting) and the
[plugin README](plugin/compactly/README.md#what-it-does).

## How it decides

In `auto` mode (the default):

1. You send a prompt and the context is at least `minTokens` (default 150K).
2. Claude Sonnet reads a short digest: how the session started, your last two prompts, the
   files edited since, the start of the last answer, and the new prompt. It says whether this
   is a natural break, and how confident it is. One check costs well under a cent.
3. At a break with enough confidence, the plugin holds your prompt back and compacts with a
   handoff summary. The summary keeps open work, paused work and why it stopped, decisions
   with their reasons, and file paths. Then it sends the prompt.
4. You rate the compaction 👍 or 👎. Each 👎 raises the confidence the judge needs. Every
   rating becomes an example the judge reads from then on, in that project only.

**If no prompt follows.** The judge can only decide when you send a prompt. After a long
break the cache has expired, and the summarizer would read the whole context at full price
instead of the cache-read price. With the 133K context from
[Coming back after a break](#coming-back-after-a-break), on Claude Opus 5.5 and the 1-hour
cache, that is about $0.17 for a warm compaction and up to $1.20 for a cold one. So after a
turn with a git commit, push or PR, if no prompt follows, the plugin compacts 5 minutes
before the cache expires (1 minute with the 5-minute cache). A prompt before then cancels
this, and the judge decides as usual.

**Paused work.** A commit does not always mean the work is done. You may commit half a
migration and pause the rest. If your last three prompts, or the answers since, say work is
paused, on hold, blocked or waiting, no git signal compacts automatically. The summary is
where "why we stopped" would get lost, so that compaction is left to you.

**`suggest` mode.** A successful `git commit`, `git push` or `gh pr create/merge` on a large
context makes the plugin suggest `/compactly`. With `judge` set to `off`, `auto` mode compacts
on those signals instead.

See the [decision flow](diagrams/architecture.md#plugin-decision-flow-compactly).

## How it compares

| Option | When it runs | Summary |
|---|---|---|
| `/compact` | when you type it | general history of the conversation |
| `/compact <instructions>` | when you type it | steered by your instructions |
| autocompact (built in) | when the context nears the window limit | general |
| idle compaction (built in) | after about 55 min idle, context ≥ 200K | general |
| `/clear`, new session | when you run it | none; only CLAUDE.md and memory remain |
| **compactly** | at a natural break, before the next prompt, context ≥ `minTokens` | handoff for the next task |

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
error rate is not measured here. Your 👍 and 👎 ratings are the labels the plugin learns from,
and they show how often the judge is right for you. Switch to `suggest` mode if mid-task
compactions cost you more than they save.

See the [judge's flow](diagrams/architecture.md#prompt-time-judge). Set `judge` to `haiku` for
a cheaper detector that starts at confidence 0.8 and compacts less often.

## Repository layout

```
compactly/
├── plugin/
│   └── compactly/           # the plugin
├── diagrams/
│   └── architecture.md            # plugin decision flows (Mermaid)
├── images/                        # screenshots
└── .claude-plugin/marketplace.json
```

## Privacy

The plugin makes no network calls of its own. The judge runs through Claude Code with the
model you pick. Ratings and savings totals are kept in the plugin's own store under
`~/.claude`, on your machine (see the [plugin README](plugin/compactly/README.md#what-it-does)
for what each one holds).

## Limitations

- Prices are list prices as of 2026-10. Other pricing changes the absolute numbers, not the
  ranking of policies.

## Contributing

Issues and pull requests are welcome. To work on the plugin from a clone, see
[Develop](plugin/compactly/README.md#develop).

## License

[Apache License 2.0](LICENSE)
