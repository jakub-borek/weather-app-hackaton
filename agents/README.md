# Agenci (S3)

Skrypty Bun bez zależności. Rozmawiają tylko z API Mercura z kontraktu `docs/rfq-contract.md`, nigdy bezpośrednio ze sobą.

## Agent sprzedawcy (F05)

```bash
bun agents/seller-agent.ts                    # 3 sklepy demo: techhurt, laptopol, istacja
bun agents/seller-agent.ts istacja laptopol   # wybrane sklepy
```

- Loguje się jako członek sklepu (`/auth/member/emailpass`, hasło z seeda), co 2 s czyta `GET /vendor/rfq-negotiations?status=awaiting_seller` i odpowiada przez `POST /vendor/rfq-negotiations/:id/messages`.
- **Grok:** ustaw `XAI_API_KEY` w `.env` w katalogu repo (jest w `.gitignore`). Opcjonalnie `XAI_MODEL` i `XAI_BASE_URL` (każde API zgodne z OpenAI chat completions). Model dostaje negocjację z prywatnym `pricing` i narzędzia `send_offer` / `decline`. Błąd 422 z backendu (np. `BELOW_MIN_PRICE`) wraca do modelu i model poprawia ofertę.
- **Bez klucza** albo gdy Grok się wysypie: reguła z `lib/seller-strategy.ts`. Startuje od ceny katalogowej minus rabat wolumenowy i schodzi do minimum w `max_rounds` krokach. Nie przekracza stanu.
- Inne zmienne: `API_URL` (domyślnie `http://localhost:9000`), `SELLER_PASSWORD` (domyślnie `supersecret` z seeda).

Pliki: `lib/mercur.ts` (klient vendor API), `lib/grok.ts` (function calling), `lib/seller-strategy.ts` (reguła zapasowa).
