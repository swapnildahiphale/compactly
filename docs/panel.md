# The panel

Here is a session in the Claude Code CLI: the transcript on the left, the panel on the right.
The user asks Claude to commit, and the mod compacts when that turn ends. That is `auto`
mode with `judge=off`. Items 7 and 8 say what the default Sonnet judge does instead (see
[How it decides](how-it-works.md#how-it-decides)).

![compactly in the Claude Code CLI](../images/1-annotated.png)

Open the panel with `/cost-panel`, or press the footer line (item 10). In the terminal it
draws bars as text. In the desktop app it draws SVG.

1. **Header**: the model, the cache TTL (the `cacheTtl` setting), a **⚙ Settings** button (see
   [Settings](#settings)) and a **Compact** button.
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
8. **Compaction**: when the turn ends, the mod compacts with a handoff summary. The
   context drops from 29K to 3K tokens. The summarizer reads the 29K from the cache, which
   costs much less than reading it fresh. With the judge, this happens when you send the next
   prompt and the judge sees a natural break.
9. **Next task**: the next prompt ("push it") runs on the 3K summary, not the full 29K.

The footer line, whether the panel is open or not:

10. **Footer line**: a one-line summary at the right of the prompt footer, such as
    `● warm 59m · $0.012 if cold`. It shows the cache state (warm with minutes left, cold, or
    unknown) and drops in more only when they matter: the cost of a rebuild, `▲ N tips` when
    hints are waiting, and `ctx 85%` once the context passes 80%. It turns orange when the
    cache is in its compact window or cold, and red when the context is nearly full. Press it
    to open the panel.

Clicking the panel's buttons in the CLI needs `/tui fullscreen`. The hotkeys work without it.

## Saved by compacting

The panel right after one compaction on Claude Opus 5.5:

![The Saved by compacting section of the cost & cache panel](../images/3-annotated.png)

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

## Settings

Press **⚙ Settings** in the panel header to choose what the panel and the footer line show;
**← Back** returns to the stats. Choices apply at once and are kept across sessions.

```
Cost & cache settings                                   [← Back]

Panel sections
[x] Stat tiles  [x] Cache clock  [x] Context bar  [x] Hints
[x] Saved by compacting  [x] Cost per turn

Footer line
(•) standard  ( ) minimal  ( ) cost
[x] Cache state  [x] Rebuild cost  [x] Tip count  [x] Context % (from 80%)
Now: ● warm 59m · $0.012 if cold
```

- **Panel sections**: toggle the stat tiles, cache clock, context bar, hints, saved by
  compacting and the cost-per-turn chart.
- **Footer line**: pick a preset, then switch single fields on or off. `minimal` is the cache
  state alone, `cost` adds the rebuild cost, and `standard` (the default) also shows the tip
  count and, from 80% full, the context share. Switching a single field makes the preset
  `custom`; with every field off the footer line is hidden.

## Coming back after a break

When you return to an old session, Claude Code shows its own notice:

![Claude Code's idle notice](../images/2-annotated.png)

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
