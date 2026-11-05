# PoC: agenci RFQ na Groku z subskrypcji

Sprawdzamy przed F05 i F06 dwie rzeczy:

1. Czy agentów da się napędzać Grokiem z subskrypcji, czyli przez Grok Build CLI w trybie headless (`grok -p`), bez płatnego klucza xAI API.
2. Jak wygląda negocjacja agent–agent na danych z seeda, z guardrailami z kontraktu F00.

To spike S3, nie feature. Backend RFQ (F03) jeszcze nie stoi, więc zastępuje go mock zgodny z `docs/rfq-contract.md`.

## Uruchomienie

```bash
bun agents/poc-grok/negotiate.ts mock      # bez modelu, deterministycznie, poniżej sekundy
bun agents/poc-grok/negotiate.ts grok      # Grok Build CLI, konto z subskrypcją
GROKBOT_AGENT_ID=<id bota> SELLERS=techhurt MAX_ROUNDS=1 \
  bun agents/poc-grok/negotiate.ts grokbot # aplikacja Grok Bot, klik na każdy ruch
```

Runtime `grokbot` steruje aplikacją Grok Bot (desktop). Skrypt zapisuje pełny prompt ruchu do `.grokbot/req-*.md` i otwiera deep link `grokbot://app/v1/prompt?id=<bot>&text=...`. Aplikacja pokazuje kartę z poleceniem, a wysyła ją dopiero kliknięcie człowieka. To zabezpieczenie aplikacji, kodem się go nie obejdzie. Bot pracuje na tym komputerze, czyta plik i zapisuje odpowiedź do `.grokbot/res-*.json`, na który skrypt czeka (domyślnie 5 min, `GROKBOT_TIMEOUT_MS`). Ruchy idą po kolei, nie równolegle.

Grok jednorazowo: `curl -fsSL https://x.ai/cli/install.sh | bash`, potem `grok` i logowanie w przeglądarce kontem z subskrypcją.

| Zmienna | Domyślnie | Po co |
|---|---|---|
| `MAX_ROUNDS` | `3` | limit wiadomości sprzedawcy, jak `max_rounds` w kontrakcie |
| `SELLERS` | wszyscy 3 | np. `SELLERS=techhurt,istacja`, krócej i taniej |
| `GROK_MODEL` | domyślny CLI | `-m` dla `grok` |
| `GROK_EFFORT` | domyślny CLI | `--effort`, np. `low`, żeby było szybciej |
| `GROK_TIMEOUT_MS` | `120000` | limit na jedno wywołanie `grok` |

Wynik: przebieg na konsoli i `last-run.md` (tabela wyników i każdy ruch z „myślą” agenta).

## Pliki

| Plik | Co robi |
|---|---|
| `negotiate.ts` | pętla rund, jeden ruch agenta = model → parser → backend, ponowienie po odrzuceniu |
| `agents.ts` | prompty sprzedawcy i kupującego, parser odpowiedzi, strategia mocka |
| `backend-mock.ts` | stany negocjacji i guardrails F04 z kontraktu, dane z `seed-data.ts` |
| `llm.ts` | runtime `grok` (`grok -p --output-format json`) i `mock` |
| `grokbot.ts` | runtime `grokbot`: deep link do aplikacji Grok Bot i wymiana plików w `.grokbot/` |
| `report.ts` | linie na konsolę i raport `last-run.md` |

## Logika, czyli jak to myślałem

**1. Dlaczego Grok Build CLI, a nie aplikacja Grok Bot albo xAI API.**
Mamy zainstalowaną aplikację Grok Bot z planem Premium. Jej boty działają w chmurze, tworzy się je ręcznie w aplikacji, a uruchamia webhookiem albo cronem. Nie ma do tego CLI, a żeby bot dosięgnął naszego localhost, potrzebny byłby tunel. xAI API jest technicznie najprostsze, ale płatne osobno, nie z subskrypcji. Grok Build CLI ma tryb headless, zwraca JSON i loguje się kontem z subskrypcją, więc da się go wołać ze skryptu Bun jak zwykłą funkcję. Odrzucone: boty w aplikacji (ręczne tworzenie, chmura, tunel) i xAI API (osobne koszty).

**2. Agent jest bezstanowy.**
Każde wywołanie dostaje pełny stan negocjacji: zapytanie, cennik, historię wiadomości i ostatni błąd. Tak samo będzie go dostawał z `GET /vendor/rfq-negotiations` w kontrakcie. Nie używamy `--resume` ani sesji CLI. Powód: kontrakt zakłada polling, restart agenta niczego nie psuje, a cały kontekst widać w logu. Odrzucone: jedna sesja CLI na parę RFQ–sprzedawca (ukryty stan, trudniej debugować).

**3. Model nie dostaje narzędzi, zwraca jeden JSON.**
Format: `{ reasoning, kind, lines, text }`. Skrypt robi z niego ruch w backendzie, a w F05 i F06 będzie to `POST .../messages`. Grok Build to agent do kodowania z bashem i edycją plików, więc go odcinamy: pracuje w pustym katalogu tymczasowym (`--cwd`), ma limit `--max-turns`, a instrukcja zabrania narzędzi. Odrzucone: Grok sam woła API przez curl albo MCP (wolniej, trudniej kontrolować, MCP przez xAI wymaga publicznego URL).

**4. Guardrails w kodzie, nie w prompcie.**
Mock backendu odrzuca `BELOW_MIN_PRICE`, `OVER_STOCK`, `UNKNOWN_VARIANT`, `NOT_YOUR_TURN` i `NEGOTIATION_CLOSED` jak F04. Komunikat nie zdradza ceny minimalnej. Błąd wraca do agenta w kolejnym prompcie. Agent ma 3 próby, potem system zamyka negocjację (`declined` po stronie sprzedawcy, `final` po stronie kupującego). Tak samo traktujemy odpowiedź, która nie jest poprawnym JSON-em (`BAD_RESPONSE`).

**5. `reasoning` to myśl agenta.**
Trafia tylko do logu i `last-run.md`. Druga strona jej nie widzi. Na demo pokazuje jury, dlaczego agent dał taką cenę.

**6. Kto co widzi.**
Sprzedawca widzi swój prywatny cennik: cenę katalogową, minimum, stan i rabaty wolumenowe. Kupujący widzi ceny katalogowe i oferty wszystkich sprzedawców, bo to jego dane, więc może grać konkurencją. Cen minimalnych nie widzi, bo `buyerView()` je wycina, tak jak store API w kontrakcie.

**7. Kolejność ruchów.**
Rundy idą synchronicznie: najpierw wszyscy sprzedawcy naraz, potem kupujący wobec każdego z nich (`Promise.all`). Log jest czytelny, a przy wolnym modelu całość trwa tyle co najwolniejsze wywołanie w rundzie, a nie suma wszystkich. W prawdziwych agentach zamiast tego będzie polling co 2 s.

**8. Strategia mocka.**
Mock jest po to, żeby sprawdzić pętlę bez modelu i mieć punkt odniesienia dla Groka.
- Sprzedawca otwiera ceną z cennika po rabacie wolumenowym, ilość przycina do stanu. Potem oddaje część różnicy do kontroferty zależnie od stylu z seeda: twardy 30%, wolumenowy 50%, elastyczny 100%.
- Elastyczny celowo wpada w `BELOW_MIN_PRICE`, żeby było widać guardrail. W drugiej próbie podnosi cenę do minimum.
- Kupujący proponuje 6% mniej albo 10 zł poniżej najlepszej oferty konkurencji. Mówi `stop`, gdy sprzedawca ustąpi mniej niż 1%.

**9. Uproszczenia PoC.**
- Pozycje RFQ są na sztywno. W kontrakcie (krok 2) agent kupującego mapuje `need_text` na warianty przez `/store/products`.
- Nie ma HTTP ani logowania sprzedawców, wszystko dzieje się w jednym procesie.

## Wyniki

| Runtime | Wynik | Uwagi |
|---|---|---|
| `mock` | 3 negocjacje, po 3 rundy, wszystkie `final`, 4 ruchy odrzucone przez `BELOW_MIN_PRICE` i poprawione w drugiej próbie | oszczędność względem cennika 5,8–10,4% |
| `grok` (sam test CLI) | `grok -p ... --output-format json` działa bez `XAI_API_KEY`, na koncie z subskrypcją (grok 1.0.70, model `grok-4.7-build`) | jedno wywołanie ok. 7 s ze startem procesu. Każde wywołanie to 21–26 tys. tokenów wejścia, bo Grok Build dokleja własny prompt i narzędzia (`--tools none` ich nie usuwa). CLI liczy równowartość ok. 0,05 USD za wywołanie. JSON ma pole `thought` (skrót rozumowania modelu), raport je zapisuje. Pełnej negocjacji jeszcze nie puszczaliśmy |
| `grokbot` | czeka na bota | test: jeden ruch TechHurt na nowym bocie |

## Co dalej w F05 i F06

- Podmienić `MockRfqBackend` na HTTP z kontraktu: store API dla kupującego, vendor API z logowaniem członka dla sprzedawców, polling co 2 s.
- Dodać krok 2 kontraktu: agent kupującego dobiera warianty z `need_text`.
- Jeśli `grok -p` okaże się za wolny na demo, przejść na xAI API z tymi samymi promptami i parserem. Zmienia się tylko `llm.ts`.
