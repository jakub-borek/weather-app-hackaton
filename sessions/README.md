# AI coding session exports

Exports of the team's AI coding sessions (Claude Code, Codex, Cursor, Grok Bot), as required by the hackathon
submission guidelines. Commit history and the per-person journals in `harness/journal/` show when the work was done.

## Dla zespołu

Wymóg organizatorów: eksporty sesji mają być **tutaj, w `/sessions` w roocie repo** (nie w `harness/sessions/`).

- **Claude Code:** `/export`, zapis do pliku w tym folderze.
- **Codex, Cursor, Grok Bot i inne:** skopiuj transkrypt do pliku w tym folderze.
- Nazwa pliku: `<imię>-<HHMM>-<temat>.md`, np. `piotr-1930-rfq-api.md`.

Przed commitem sprawdź, czy nie ma sekretów (klucze API, tokeny, hasła, `.env`):

```bash
grep -niE 'sk-[a-z0-9]|xai-[a-z0-9]|api[_-]?key|secret|token|password' sessions/<plik>.md
```

Zamaskuj znalezione wartości. Commit: `chore(harness): sesja <imię> <temat>`.
