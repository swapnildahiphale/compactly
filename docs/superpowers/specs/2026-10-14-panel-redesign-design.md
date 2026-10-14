# compactly panel redesign: design spec (stat tiles, cache clock, action hints)

Status: approved design; built per docs/superpowers/plans/2026-10-14-panel-redesign.md. Uncommitted.
Supersedes the old rename plan (done).

## Intent
Rebuild the cost & cache panel (`plugin/compactly/hooks/register.tsx`, `ui.render` for `Pane`) so it reads
at a glance, with three ideas the user picked: **stat tiles with sparklines**, a **cache clock**, and
**hints as actions** (Compact now · Snooze 10 min · Not this session, hotkeys 1/2/3).
Constraints: works on the **terminal and the desktop app**; only elements the docs say each surface has;
text fallback (`report.ts`) kept; no new dependencies; no commit or push without approval; no AI attribution.
Success: the same numbers on both surfaces, and a clean degrade wherever a style is not drawn.

## Grounded in the docs
Sources: the plugin-authoring reference and `claude-code.d.ts` of this build (2.1.299), and the public
mods docs (https://code.claude.com/docs/en/plugins/mods/overview, `/reference`, `/interface`,
`/docs/en/fullscreen`), read by a subagent and not re-read by me.

| Fact | Source | Design consequence |
|---|---|---|
| Desktop elements: Box, Text, Button, Svg, Link, Code, Markdown, Input, Select, Client. `Raster` and `Image` are terminal-only; `Svg` is desktop-only | types `Elements`; public `/reference#elements` | No `Raster`. Desktop graphics are `Svg`, terminal graphics are text |
| `borderStyle` list (`single`, `double`, `round`, …) is "the terminal's"; an unknown style draws no border and the rest still draws; desktop border drawing not documented | reference.md; public `/reference#box-border-styles` | Use `round`; accept a missing border on desktop; check live |
| Text has `mono` and `tabular`; "the terminal is always monospaced"; desktop monospace not documented | types `TextProps` | Bars use `mono` or Svg; numbers use `tabular` |
| `Space` is cells on the terminal, its own scale on desktop | types `Space` | Use `gap` and `'xs'..'xl'` tokens, not raw numbers |
| `hotkey` is one digit or lowercase letter, works while the pane holds focus; two on one hotkey: the later wins | types `ButtonProps`; public `/interface` | Hotkeys only on the top hint's three buttons |
| `Svg`: `alt` required, at most 131072 chars, presses cannot sit inside it | types `SvgProps` | Svg only for graphics; Buttons stay `Button`s |
| Terminal clicks need `/tui fullscreen`; whether mod clicks need it is not documented publicly, confirmed by our own test | public `/fullscreen`; session test | Hotkeys are the no-click path; the README fullscreen note stays a separate follow-up |
| The test kit checks hooks under each surface's rules, not paint; loop one body over both surfaces | reference.md | Tests prove structure and behaviour; paint is a live check |

## Units
| Unit | Purpose | Depends on |
|---|---|---|
| `hooks/model.ts` (new, pure) | `panelModel(s, now, ttl)` → 4 tiles `{label, value, series}`, clock `{remainingMs, ttlMs, windowMs, zone, compactAt?}`, ranked hints | `hints.ts`, `pricing.ts`, `PanelState` |
| `hooks/svg.ts` (new) | Svg strings for a tile sparkline and the clock bar; `SERIES` palette and the dark-mode CSS from `chart.ts` | model output |
| `hooks/panel-view.tsx` (new) | `Tiles`, `Clock`, `HintRow`: each a text branch and an Svg branch, picked by `hasSvg`. Also moves ~150 lines out of `register.tsx` | model, `svg.ts`, `chart.ts` text helpers |
| `register.tsx` | Composes the pane, owns state and handlers, sets/clears `compactAt` where the pre-expiry timer is armed (~L483-495) and cancelled (`cancel()`) | the above |
| `hooks/hints.ts` | Drop a hint while `now < snoozed[id]`; export `SNOOZE_MS = 10 * 60_000` | `PanelState` |
| `types/index.d.ts` | `PanelState` += `snoozed: Record<string, number>`, `compactAt?: number` (the time the timer fires) | none |

Reuse, don't rewrite: `meter`, `sparkline`, `costChart`, `cacheState`, `hitRatio`, `minutes`, `kTokens`,
`usd`, `writePrice`, `compactAndLog`, `beforeExpiryMs`, `hints()`.

## Behaviour
- **Tiles** (Box `borderStyle="round"`, both surfaces): Session cost (running sum per turn), Cache hit
  (`readTokens/(readTokens+writeTokens)` per turn), Re-read per turn (`ctx × read price`), Rebuild if cold
  (`ctx × write price`). A series with fewer than 2 points shows the value only.
  Terminal sparkline = `Text mono` blocks; desktop = small `Svg` line with `alt`.
- **Clock**: axis is minutes remaining, 0..TTL. Zones: cold (≤0), compact window (last `min(5 min, ttl/5)`,
  same maths as `beforeExpiryMs`), warm (rest). Terminal: text bar plus a zone label row.
  Desktop: one Svg with the zones, a "now" marker and a `<title>` tooltip (`isInteractive`).
  The "Next: auto-compact … (saves ≈ $X)" line shows only while `compactAt` is set; `X = rebuild − compactNow`
  already computed in `hints.ts`.
- **Hints**: top hint shows `[1 Compact now] [2 Snooze 10 min] [3 Not this session]` with hotkeys; lower hints
  show the same buttons without hotkeys. Keys: `compact-<id>`, `snooze-<id>`, `dismiss-<id>`
  (existing keys unchanged). Compact only on hints with `action: 'compact'`. Empty state unchanged.
- **Header**: model, TTL, and an always-visible `Compact` Button (`compactAndLog`). The engine's own close
  mark is not ours.
- **Narrow** (`bodyColumns < 70`): tiles wrap with the pane's width (`flexWrap`); bars shrink as `meter` already does.
- **Compat**: `snoozed ?? {}` so an old session's state survives a hot reload. Unpriced model or no turns:
  existing placeholder. `report.ts` untouched.

## Tests (`claude plugin test`, bodies looped over `terminal` and `desktop`)
- `model.test.ts`: series maths, zone boundaries (5m and 1h TTL), snooze expiry, `compactAt` line condition.
- `panel.test.ts` (updated for the new text): tile labels and clock text on both; no `Svg` on terminal, `Svg`
  present on desktop; `compact-expiring` still compacts with the handoff prompt; `snooze-large` hides then
  returns after 10 min on the mocked clock; `dismiss-large` hides for good; `Next: auto-compact` appears after a
  commit turn arms the timer and disappears after a new prompt.
- Existing 42 tests keep passing.

## Verify
1. `claude plugin validate plugin/compactly` and `claude plugin test plugin/compactly`.
2. Live, terminal in `/tui fullscreen`: `/cost-panel` at ≥110 columns and at a narrow width; press `1/2/3`.
3. Live, desktop app (Code tab): same, plus the two live checks the docs leave open: do the tile borders draw,
   and do the text bars line up. If either fails, fall back to the Svg branch or drop the border.
   Report the result plainly.

## Out of scope
Images/GIFs in `images/` (paused), commit and push (wait for approval), pane side or size (host-controlled),
`CLAUDE_CODE_NO_FLICKER` default and README fullscreen note (waiting for a yes), other feature candidates
(tunables as settings, custom handoff text, per-project overrides). README text for the panel changes only after
the build is verified.

## Self-review
No placeholders. The clock axis is minutes remaining, which differs from the user's mock (window near 0) because
that is when auto-compact runs. The header `Compact` button replaces the mock's `[ x ]`, which the engine draws.
Scope fits one plan: 4 files new or changed in `hooks/`, one type edit, two test files.
