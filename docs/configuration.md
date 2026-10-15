# Configuration

The defaults (`auto` mode, the Sonnet judge, 150K tokens) work as they are. To change them,
pass `--config` when installing:

```bash
claude plugin install compactly --marketplace swapnildahiphale/compactly \
  --config mode=suggest --config minTokens=100000
```

or run `/plugin configure compactly@compactly` inside the CLI, or edit
`~/.claude/settings.json` by hand. Add the `pluginConfigs` block next to the keys already in
the file; don't replace the file:

```json
{
  "pluginConfigs": {
    "compactly@compactly": {
      "options": { "mode": "suggest", "minTokens": 100000 }
    }
  }
}
```

The key is `<name>@<marketplace>`, which is `compactly@compactly`. When the mod is loaded
from a local folder with `CLAUDE_CODE_PLUGIN_DIRS`, the key is the bare name, `compactly`.
Start a new session after changing settings.

| Setting | Default | Meaning |
|---|---|---|
| `mode` | `auto` | `suggest`: notify only; `auto`: compact at a natural break; `off`: do nothing |
| `judge` | `sonnet` | who decides in `auto` mode: `sonnet` (starts at confidence 0.5), `haiku` (starts at 0.8, cheaper, compacts less often), or `off` (the `signals` decide) |
| `minTokens` | `150000` | act only when the context is at least this large |
| `cacheTtl` | `1h` | your main conversation's cache TTL (`5m` or `1h`) |
| `openPanel` | `true` | open the panel when a session starts (no effect where no window can be drawn) |
| `signals` | `git` | `git`, `git+deploy`, or `all` (adds tests, validate, build, finished todo lists) |

Git signals alone are a weak proxy for a natural break, so the default `signals` is `git` and
the default `mode` is `auto`, where the judge decides. Wider signal sets tend to add
compactions in the middle of a task; use `suggest` mode if you widen them. Each judge check
waits up to 15 s before the prompt goes on unjudged. The judge's cost is subtracted from
**Saved by compacting**.
