# Session Handoff: checkpoint zespołu

Nadpisuje go osoba robiąca checkpoint (T+1:00, T+2:15) albo ktoś, kto kończy pracę przed resztą.

## Current Objective

- **Goal:** działające demo według `product.md`: RFQ → negocjacja agentów → akceptacja → zamówienie w Mercurze.
- **Current status:** w repo są `product.md` i harness. Kodu aplikacji jeszcze nie ma.
- **Branch / commit:** `main` (sprawdź `git log --oneline -5`).

## Completed This Session

- [x] `product.md`: spec produktu z rozmowy z jurorem, decyzja o Mercurze.
- [x] Harness: `AGENTS.md`, `CLAUDE.md`, `feature_list.json` (F00–F13), `progress.md`, `init.sh`, `scripts/`, `harness/`.

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Harness i środowisko | `./init.sh` | zielony | Brak kodu aplikacji, więc QUICK_CHECKS są puste do czasu F01 |

## Files Changed

- `product.md`, `AGENTS.md`, `CLAUDE.md`, `feature_list.json`, `progress.md`, `session-handoff.md`, `init.sh`
- `scripts/status.sh`, `scripts/log.sh`, `harness/journal/`, `harness/sessions/`, `.claude/settings.json`, `.gitignore`, `README.md`

## Decisions Made

- Mercur (open source) jako baza: ma sprzedawców, seedujemy dane na demo.
- Trunk-based na `main`, każdy ma swój journal, ID feature'a w commitach.
- Bez testów automatycznych. Dowodem jest ręczna weryfikacja (komenda i wynik).

## Blockers / Risks

- Runtime agentów nieustalony (S3).
- Brak przypisania osób do strumieni S1–S4.

## Next Session Startup

1. `git pull --rebase`
2. Przeczytaj `AGENTS.md` i `product.md`.
3. Przeczytaj `feature_list.json`, `progress.md` i ten plik.
4. Uruchom `./init.sh`.

## Recommended Next Step

- Przypisać 4 osoby do S1–S4 (kolumna „Kto" w `AGENTS.md`).
- Równolegle: F00 (S2) i F01 (S1), a S3 wybiera runtime agentów.
