# Journale

Jeden plik na osobę: `harness/journal/<twój-git-user>.md`. Tworzy go `./scripts/log.sh` przy pierwszym wpisie. Nazwę pliku bierze z `git config user.name`. Inną ustawisz tak: `HARNESS_USER=jakub ./scripts/log.sh ...`.

Każdy pisze tylko do swojego pliku i tylko dopisuje, więc nie ma konfliktów w gicie. `./scripts/status.sh` zbiera z wszystkich journali ostatnie wpisy, decyzje i blokery.

## Tagi

| Tag | Kiedy |
|---|---|
| `START` | bierzesz feature |
| `KROK` | skończony sensowny kawałek, razem z tym, co sprawdziłeś |
| `DECYZJA` | wybór techniczny lub produktowy: co, dlaczego, co odrzuciliśmy |
| `BLOKER` | coś blokuje dłużej niż 10 minut |
| `ODBLOK` | blokada zdjęta, czym |
| `PROMPT` | prompt, który wygenerował dużą część kodu albo ważną decyzję agenta (skrót) |
| `DONE` | feature gotowy, z evidence |
| `NOTE` | wszystko inne warte zapamiętania |

## Przykłady

```bash
./scripts/log.sh START "F03: zaczynam moduł RFQ"
./scripts/log.sh DECYZJA "F03: cena minimalna w metadata wariantu, bo nie ruszamy schematu Mercura. Odrzucone: osobna tabela"
./scripts/log.sh BLOKER "F01: backend nie startuje, brak Redisa"
./scripts/log.sh ODBLOK "F01: Redis z docker compose"
./scripts/log.sh PROMPT "F06: system prompt negocjatora kupującego, limit 3 rund, nigdy nie akceptuje"
./scripts/log.sh DONE "F03: endpointy z kontraktu działają, curl w evidence"
```

Wpis w pliku wygląda tak:

```text
- 2026-11-05 18:52 [DECYZJA] F03: cena minimalna w metadata wariantu ... _(main@517500e)_
```
