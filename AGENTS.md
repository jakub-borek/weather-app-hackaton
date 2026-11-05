# AGENTS.md

Hackathon, 4 osoby, ok. 2,5 h. Budujemy marketplace na open source Mercurze, w którym agenci negocjują zapytania ofertowe (RFQ). Co i po co: `product.md`.

Ten plik czytają wszyscy agenci (Claude Code, Codex, Cursor). Krótko: jak zacząć, kto co robi, co zapisywać, kiedy coś jest gotowe.

## Startup Workflow (zanim napiszesz kod)

1. `git pull --rebase`
2. Przeczytaj ten plik i `product.md`.
3. Uruchom `./init.sh`. Sprawdza środowisko i pliki harnessu, a na końcu pokazuje stan zespołu.
4. W `feature_list.json` weź feature ze swojego strumienia, którego zależności mają status `done`. Wpisz `owner`, `status: "in-progress"`, `started_at`. Od razu commit i push, żeby inni widzieli, że jest zajęty.
5. `./scripts/log.sh START "F03: zaczynam moduł RFQ"`

Jeśli `./init.sh` jest czerwony, najpierw go napraw albo zgłoś BLOKER. Nie dokładaj nowego zakresu na zepsutym main.

## Zespół i strumienie (ownership)

| Strumień | Zakres | Feature'y | Kto |
|---|---|---|---|
| S1 Platforma | Mercur, seed, zamówienia | F01, F02, F08 | — |
| S2 Backend RFQ | kontrakt, moduł RFQ, guardrails, MCP | F00, F03, F04, F09, F13 | — |
| S3 Agenci | agent kupującego i agenci sprzedawców | F05, F06, F12 | — |
| S4 Storefront i demo | UI RFQ, porównanie ofert, licznik, demo | F07, F10, F11 | — |

Wpisz swoje imię w kolumnie „Kto" przy pierwszym commicie.

Plan pierwszych 15 minut:
- **S1:** F01, czyli Mercur lokalnie.
- **S2:** F00, kontrakt RFQ w `docs/rfq-contract.md`. To odblokowuje S3 i S4.
- **S3:** wybór runtime'u agentów i sposobu nasłuchiwania, zapisany jako DECYZJA. Potem F05 i F06 na mocku kontraktu.
- **S4:** pomaga S1 postawić storefront Mercura. Potem F07 na mocku kontraktu.

### Mapa repo

Uzupełnia właściciel F01 po postawieniu Mercura: gdzie jest backend, storefront, panel admina, panel sprzedawcy i agenci, oraz jak każde z nich uruchomić.

## Working Rules

- **One feature at a time.** Jedna osoba ma naraz jeden feature `in-progress`.
- **Stay in scope.** Ruszasz tylko kod swojego strumienia. Jeśli musisz zmienić cudzy, powiedz właścicielowi i zapisz NOTE w journalu.
- **Trunk-based.** Pracujemy na `main`. Małe commity, `git pull --rebase` przed każdym push, push co 15–20 minut.
- **Nie psuj main.** `./init.sh` przed każdym push.
- **Commity z ID feature'a:** `feat(F03): endpoint tworzenia RFQ`, `fix(F07): odświeżanie logu`, `chore(harness): F03 in-progress`.
- **Kontrakt RFQ** (`docs/rfq-contract.md`) zmienia tylko właściciel F00, po uzgodnieniu z S3 i S4.
- **Zero sekretów w repo.** Klucze API tylko w lokalnym `.env`, który jest w `.gitignore`. Przed commitem eksportu sesji sprawdź, czy nie ma w nim kluczy.
- **Bez `git push --force` na main** i bez `git add .`. Dodawaj pliki po nazwie.

## Tracking (co i gdzie zapisujemy)

Chcemy wiedzieć jak najwięcej o tym, co się działo. Agent zapisuje to sam, bez proszenia.

| Plik | Co | Kto edytuje | Jak |
|---|---|---|---|
| `feature_list.json` | status, owner, evidence feature'ów (źródło prawdy) | właściciel feature'a | tylko swoje wpisy |
| `harness/journal/<ty>.md` | pełna historia twojej pracy | ty, przez `./scripts/log.sh` | tylko dopisujesz |
| `progress.md` | stan na teraz | każdy w swoim bloku | nadpisujesz swój blok |
| `session-handoff.md` | checkpoint całego zespołu | osoba robiąca checkpoint | nadpisujesz |
| `harness/sessions/` | wyeksportowane sesje agentów | każdy | nowy plik na sesję |
| `git log` | oś czasu | wszyscy | ID feature'a w każdym commicie |

Każdy ma swój journal, więc dopisywanie nie robi konfliktów w gicie.

**Kiedy agent dopisuje do journala** (`./scripts/log.sh TAG "opis"`):
- `START`: bierzesz feature.
- `KROK`: skończony sensowny kawałek (endpoint działa, ekran się renderuje). Dopisz, co sprawdziłeś.
- `DECYZJA`: każdy wybór techniczny lub produktowy, razem z powodem i odrzuconą alternatywą.
- `BLOKER` / `ODBLOK`: coś cię blokuje dłużej niż 10 minut / blokada zdjęta.
- `PROMPT`: prompt, który wygenerował dużą część kodu albo ważną decyzję agenta (skrót, nie cała treść).
- `DONE`: feature gotowy, z evidence.
- `NOTE`: wszystko inne, co warto pamiętać, np. zmiana w cudzym strumieniu albo dziwne zachowanie Mercura.

Stan zespołu w każdej chwili: `./scripts/status.sh`.

## Definition of Done

Feature jest gotowy dopiero wtedy, gdy wszystkie punkty są spełnione:

- [ ] Spełnione wszystkie `done_when` z `feature_list.json`.
- [ ] Weryfikacja faktycznie uruchomiona: `./init.sh` zielony + ręczne sprawdzenie (komenda i wynik, np. `curl` z odpowiedzią albo opis tego, co kliknięto).
- [ ] Evidence wpisane w `feature_list.json`, a w journalu jest `DONE` z hashem commita.
- [ ] Wypchnięte na `main`, a main nadal startuje według Mapy repo.

Testów automatycznych nie piszemy (hackathon, decyzja zespołu). Dowodem jest ręczna weryfikacja z zapisaną komendą i wynikiem.

## Verification Commands

```bash
./init.sh            # pełna szybka weryfikacja: narzędzia, harness, sekrety, QUICK_CHECKS, status
./scripts/status.sh  # sam stan zespołu
```

`init.sh` sprawdza:
- `git` i `node` (>= 20),
- poprawność `feature_list.json`: statusy, zależności, `done` ma evidence, `in-progress` ma ownera,
- czy żaden `.env` nie trafił do repo,
- `QUICK_CHECKS`, czyli lint/build aplikacji. Uzupełnia je właściciel F01.

## End of Session (Before ending)

1. `./scripts/log.sh DONE "..."` albo `NOTE "przerywam w trakcie, zostało: ..."`.
2. Zaktualizuj swój blok w `progress.md`.
3. Zaktualizuj swoje wpisy w `feature_list.json`.
4. Wyeksportuj sesję agenta do `harness/sessions/` (szczegóły w `harness/sessions/README.md`).
5. `./init.sh`, potem commit, `git pull --rebase`, push.
6. Zostaw repo clean i restartable: następna osoba odpala `./init.sh` i może pracować.

## Checkpointy zespołu

| Kiedy | Co |
|---|---|
| T+0:15 | kontrakt F00 na main, runtime agentów wybrany |
| T+1:00 | checkpoint: jedna osoba aktualizuje `session-handoff.md` |
| T+2:00 | feature freeze: tylko poprawki i demo |
| T+2:15 | próba generalna demo (F11), ostatni `session-handoff.md` |

## Escalation

- **Konflikt w `feature_list.json` lub `progress.md`:** zachowaj obie strony. Nigdy nie nadpisuj cudzych wpisów.
- **Blokada dłuższa niż 10 minut:** `BLOKER` w journalu i powiedz zespołowi.
- **Decyzja architektoniczna:** `DECYZJA` w journalu i powiedz zespołowi. Jeśli zmienia produkt, popraw `product.md`.
- **Niejasne wymagania:** najpierw `product.md`, potem pytasz człowieka. Nie zgadujesz.
