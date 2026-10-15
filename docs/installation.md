# Installation

compactly is a Claude Code mod, installed through Claude Code's plugin system. It works in
the Claude Code CLI and the desktop app, and needs Claude Code 2.1.295 or later.

## Check your Claude Code version

```bash
claude --version
```

Update with `claude update`. If you installed through Homebrew, use the `claude-code@latest`
cask: the plain `claude-code` cask lags behind, and the two casks can't be installed side by
side.

```bash
brew uninstall --cask claude-code
brew install --cask claude-code@latest
```

Later updates: `brew upgrade --cask claude-code@latest`.

## From GitHub

Inside Claude Code:

```
/plugin marketplace add swapnildahiphale/compactly
/plugin install compactly@compactly
```

Or from a shell, in one command:

```bash
claude plugin install compactly --marketplace swapnildahiphale/compactly
```

This adds the marketplace and enables the mod in `~/.claude/settings.json`. Start a new
session afterwards.

## From a local clone

```bash
git clone https://github.com/swapnildahiphale/compactly.git
claude plugin install compactly --marketplace ./compactly
```

To try it for one shell without installing:

```bash
export CLAUDE_CODE_PLUGIN_DIRS="$PWD/compactly/plugin/compactly"
claude
```

## Scope

Installs are per user by default. Add `--scope project` to share the mod with a
repository's collaborators, or `--scope local` to keep it to yourself in that repository.

## Update and uninstall

```bash
claude plugin update compactly@compactly
claude plugin uninstall compactly@compactly
```
