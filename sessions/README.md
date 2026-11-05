# AI coding session exports

Exports of the team's AI coding sessions (Claude Code, Codex, Cursor, Grok Bot), as required by the hackathon
submission guidelines. Commit history and the per-person journals in `harness/journal/` show when the work was done.

## For the team

Organizers' requirement: session exports go **here, in `/sessions` at the repo root** (not in `harness/sessions/`).

- **Claude Code:** `/export`, save the file in this folder.
- **Codex, Cursor, Grok Bot and others:** copy the transcript into a file in this folder.
- File name: `<name>-<HHMM>-<topic>.md`, e.g. `piotr-1930-rfq-api.md`.

Before committing, check for secrets (API keys, tokens, passwords, `.env` contents):

```bash
grep -niE 'sk-[a-z0-9]|xai-[a-z0-9]|api[_-]?key|secret|token|password' sessions/<file>.md
```

Mask anything you find. Commit: `chore(harness): session <name> <topic>`.
