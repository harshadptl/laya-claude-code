# laya-router

Claude Code plugin (function hooks) that asks a local [laya-mlx](https://github.com/mizorewww/laya-mlx)
typed-decision model, at runtime, two things:

- **Routing** (`turn.start` → `turn.step`): a `score` question rates how much reasoning the prompt
  needs (0–2). Below `haikuBelow` (0.9) → haiku tier, above `opusAbove` (1.25) → opus tier, else sonnet.
  Only the main loop is rerouted; subagents keep their own model. If the context holds more than
  `haikuMaxTokens`, the prompt is never sent to haiku.
- **Compaction** (`turn.complete`): once the context is at least `compactMinPercent` full, a `noul` question
  asks whether the task just finished. If P ≥ `compactMinProb`, the plugin calls `$.session.compact()`
  at that breakpoint, so compaction happens between tasks and auto-compact doesn't cut in mid-task.

The model stays loaded in a small Python server on `/tmp/laya-router-$USER.sock`. `session.start`
starts that server with `uv run --with laya-mlx`, and it stops when the session ends. Each decision
takes about 10–60 ms. If the server can't be reached, the plugin makes no decision: it keeps
the session's model and doesn't compact.

## Requirements

Apple Silicon, macOS 14+, `uv` on PATH. The first run downloads `aac6fef/laya-mlx` (~0.9 GB).

## Install

From GitHub (run inside Claude Code):

```
/plugin marketplace add harshadptl/laya-claude-code
/plugin install laya-router@laya-claude-code
```

Function hooks must be enabled, so start Claude Code with:

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude
```

Or set it once in your shell profile, then restart the terminal:

```bash
echo 'export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1' >> ~/.zshrc
```

Update later with `/plugin marketplace update laya-claude-code`.

From a local checkout, for one session only:

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir ./laya-router
```

The options are listed in `.claude-plugin/plugin.json` (`userConfig`) and can be changed in `/config`
or under `pluginConfigs["laya-router@laya-claude-code"].options` in settings
(`laya-router@inline` when loaded with `--plugin-dir`).

## Checks

```bash
claude plugin validate laya-router
claude plugin test laya-router
```

## Notes

- Changing the model on a turn invalidates the prompt cache for that turn.
- `$.session.compact` is refused in headless (`-p`/SDK) sessions. There the plugin logs the
  decision and carries on.
- The cutoffs come from probing a small set of prompts (see `hooks/decide.ts`). Tune them for your own workload.
