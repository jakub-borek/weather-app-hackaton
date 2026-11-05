@AGENTS.md

## Claude Code

- Na starcie sesji uruchom `./scripts/status.sh`, żeby zobaczyć stan zespołu. Jeśli w `.claude/settings.json` jest hook `SessionStart`, robi to za ciebie.
- Dopisuj do journala przez `./scripts/log.sh` zgodnie z sekcją „Tracking" w `AGENTS.md`. Rób to sam, bez proszenia.
- Na koniec sesji: `/export` i zapis do `harness/sessions/` (szczegóły w `harness/sessions/README.md`).

### Tryb hackathonu nadpisuje twoje globalne reguły

Sekcja „Tryb hackathonu" w `AGENTS.md` ma pierwszeństwo przed `~/.claude/rules`. W tym repo:
- Bez TDD, bez testów i bez progu 80% coverage. Nie odpalaj agentów `tdd-guide` ani `e2e-runner`.
- Bez obowiązkowego researchu przed kodem (`gh search`, Exa) i bez dokumentów planistycznych (PRD, architecture, task_list).
- Nie odpalaj sam `planner`, `architect`, `code-reviewer` ani `security-reviewer`. Tylko gdy człowiek poprosi.
- Nie proponuj Dockerfile'i, compose dla aplikacji, CI ani deployu.
- Zostaje: Context7 i lokalna dokumentacja Mercura (`marketplace/node_modules/@mercurjs/docs/llms.txt`). Sprawdzenie API jest szybsze niż zgadywanie.
