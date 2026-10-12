# Claude Code mods

Nine mods for Claude Code (2.1.287 or newer), written from the walkthrough video. Each lives in `mods/<name>`.

Install one, or all, from a terminal session:

```
/plugin install <name> --marketplace KianaVega/KianaVega
```

| Mod | What it does | Extra model usage |
| --- | --- | --- |
| savvy-progress | Progress bar above the prompt and a live list of subagents with model, tokens and rough cost | none |
| tool-skins | Icons and colors for tool calls in seven themes, switch with `/skin <name>` | none |
| you-should-know | A second, small model reads long answers and flags anything important you might miss | one small call per long answer |
| file-tree | Pane showing files Claude reads and edits, green once committed (`/file-tree`) | none |
| cache-tax | Holds a prompt that would reload a cold cache and shows an estimate. `/keepwarm` pings before the cache expires | none, except keep-warm pings |
| blast-radius | Stops recursive deletes, `git clean`, hard resets and shows the affected files before you press Proceed | none |
| reflect | Offers to save corrections as a rule in CLAUDE.md | one small call when you save |
| terminal-browser | `/browse <url or file>` opens a pane with a screenshot (kitty or Ghostty) and the page text | none |
| replay-theater | Replay button after a turn that steps through each edit as a diff (`/replay`) | none |

## Notes

- Settings such as trigger phrases, price tables, skins and which model the watcher uses are constants at the top of each `hooks/register.tsx`. Edit and reload.
- Cost figures are estimates from a built-in price table.
- terminal-browser is a viewer built from a headless screenshot and page text. It is not a live, clickable browser.
- Mods run in the terminal and the desktop app's Code tab, not the VS Code extension.
