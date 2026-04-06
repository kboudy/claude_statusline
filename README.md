# claude_statusline

## installing

- add this to `~/.claude/settings.json`:

```json
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh"
  },
```

- create `~/.claude/statusline.sh` with the following content:

```bash
#!/bin/bash

# Read JSON data that Claude Code sends to stdin
input=$(cat)

bun /home/keith/keith_apps/claude_statusline/index.ts "$input"
```

## crontab entry to run every minute:

```
* * * * * /home/keith/keith_apps/claude_statusline/setCachedUsage_ifClaudeRunning.ts
```
