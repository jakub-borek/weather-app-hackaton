# Agenci (S3)

Skrypty Bun bez zależności. Rozmawiają tylko z API Mercura z kontraktu `docs/rfq-contract.md`, nigdy bezpośrednio ze sobą.

## Agent sprzedawcy (F05)

```bash
bun agents/seller-agent.ts                    # 3 sklepy demo: techhurt, laptopol, istacja
bun agents/seller-agent.ts istacja laptopol   # wybrane sklepy
```

- Loguje się jako członek sklepu (`/auth/member/emailpass`, hasło z seeda), co 2 s czyta `GET /vendor/rfq-negotiations?status=awaiting_seller` i odpowiada przez `POST /vendor/rfq-negotiations/:id/messages`.
- **Grok:** ustaw `XAI_API_KEY` w `.env` w katalogu repo (jest w `.gitignore`). Opcjonalnie `XAI_MODEL` i `XAI_BASE_URL` (każde API zgodne z OpenAI chat completions). Model dostaje negocjację z prywatnym `pricing` i narzędzia `send_offer` / `decline`. Błąd 422 z backendu (np. `BELOW_MIN_PRICE`) wraca do modelu i model poprawia ofertę.
- **Grok z subskrypcji, bez klucza:** gdy nie ma `XAI_API_KEY`, a jest polecenie `grok` (Grok Build CLI), każdy ruch to `grok -p --output-format json` w pustym katalogu tymczasowym (runtime z `poc-grok/llm.ts`). Model dostaje pełny stan negocjacji i zwraca jeden JSON `{reasoning, kind, lines, text}`, a skrypt wysyła ruch do backendu. Błąd 422 wraca do modelu w następnym prompcie, po 2 nieudanych próbach przejmuje reguła. `reasoning` trafia tylko do logu jako „myśl agenta”. Ruch trwa ok. 7 s, a jedno wywołanie zużywa ok. 25 tys. tokenów z puli subskrypcji. Instalacja jednorazowa: `curl -fsSL https://x.ai/cli/install.sh | bash`, potem `grok` i logowanie kontem z subskrypcją. Opcjonalnie `GROK_MODEL` i `GROK_EFFORT` (np. `low`, żeby było szybciej).
- **Bez klucza i bez `grok`** albo gdy Grok się wysypie: reguła z `lib/seller-strategy.ts`. Startuje od ceny katalogowej minus rabat wolumenowy i schodzi do minimum w `max_rounds` krokach. Nie przekracza stanu.
- Inne zmienne: `API_URL` (domyślnie `http://localhost:9000`), `SELLER_PASSWORD` (domyślnie `supersecret` z seeda).

Pliki: `lib/mercur.ts` (klient vendor API), `lib/grok.ts` (function calling), `lib/seller-strategy.ts` (reguła zapasowa).

## Dostęp dla Grok Botów: `/agents/*`

Bot loguje się jednym wywołaniem i w odpowiedzi dostaje token oraz manifest: bazowy URL, nagłówki, listę akcji z przykładowymi body, `rfq_access`, reguły i kody błędów. Trasy są w `marketplace/packages/api/src/api/agents/`.

| Trasa | Kto | Co |
|---|---|---|
| `GET /agents/manifest?role=buyer\|seller` | każdy | opis API bez logowania |
| `POST /agents/login` `{ email, password, role }` | bot | `buyer` = konto klienta, `seller` = członek sklepu (zwraca też `seller_id`). Odpowiedź: `token` + manifest |
| `POST /agents/rfqs` `{ need_text, max_rounds?, items? }` | bot kupującego (Bearer) | tworzy RFQ i od razu je rozsyła. **Bot nie dostaje `accept_token`**, token trafia do `metadata.rfq_accept_tokens[rfq_id]` klienta-właściciela |

Konto bota kupującego (klient z `metadata.agent = true` i `owner_email`):

```bash
bun agents/create-bot-account.ts <email> <hasło> [email_właściciela]   # domyślny właściciel: zakupy@firma-demo.pl
API_URL=https://<tunel>.ngrok-free.app bun agents/create-bot-account.ts ...   # na wspólnym backendzie
```

Boty sprzedawców logują się kontami sklepów z seeda (`role: "seller"`), nic nie trzeba zakładać.

Test:

```bash
curl -s -X POST $API/agents/login -H 'content-type: application/json' \
  -d '{"email":"<bot>","password":"<hasło>","role":"buyer"}'
```
