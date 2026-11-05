# Eksport sesji agentów

> **Uwaga:** organizatorzy wymagają eksportów w **`/sessions` w roocie repo**. Zapisuj tam, nie tutaj. Instrukcja: [`sessions/README.md`](../../sessions/README.md).

Tu trafiają wyeksportowane rozmowy z agentami. W rozmowie z jurorem padło, że sesje trzeba będzie wyeksportować. Nawet jeśli to nie jest wymóg, to najpełniejszy zapis tego, jak powstawał kod.

## Jak

- **Claude Code:** `/export`, zapis do pliku w tym folderze.
- **Codex, Cursor i inne:** skopiuj transkrypt do pliku w tym folderze.

Nazwa pliku: `<imię>-<HHMM>-<temat>.md`, np. `piotr-1930-rfq-api.md`.

## Zanim zacommitujesz

Przejrzyj plik pod kątem sekretów: klucze API, tokeny, hasła, zawartość `.env`. Szybki check:

```bash
grep -niE 'sk-[a-z0-9]|api[_-]?key|secret|token|password' harness/sessions/<plik>.md
```

Jeśli coś znajdziesz, zamaskuj to przed commitem. Commit: `chore(harness): sesja <imię> <temat>`.
