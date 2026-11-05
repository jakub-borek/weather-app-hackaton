@AGENTS.md

## Claude Code

- Hook `SessionStart` w `.claude/settings.json` uruchamia `scripts/status.sh`, więc na starcie sesji widzisz stan zespołu. Nie musisz go odpalać ręcznie.
- Dopisuj do journala przez `./scripts/log.sh` zgodnie z sekcją „Tracking" w `AGENTS.md`. Rób to sam, bez proszenia.
- Na koniec sesji: `/export` i zapis do `harness/sessions/` (szczegóły w `harness/sessions/README.md`).
