# Kontrakt RFQ (F00)

> Status: **szkic do akceptacji przez S2, S3 i S4** (2026-11-05). Po akceptacji zmienia go tylko właściciel F00, po uzgodnieniu z S3 i S4.
> Kto z czego korzysta: S2 implementuje backend (F03, F04), S3 pisze agentów (F05, F06), S4 robi UI (F07, F10), S1 robi akceptację i zamówienie (F08).
> Do czasu F03 S3 i S4 mockują odpowiedzi na podstawie przykładów JSON poniżej.

## Architektura w jednym akapicie

RFQ to mały własny moduł `rfq` w backendzie Mercura (`marketplace/packages/api/src/modules/rfq`). Ma trzy tabele: zapytanie, negocjacja z jednym sprzedawcą i wiadomość z cenami. Agenci to skrypty Bun, które co 2 s odpytują API i wołają model językowy z narzędziami robiącymi zapytania HTTP. Agenci nigdy nie piszą do siebie bezpośrednio: wszystko idzie przez backend, który pilnuje reguł (F04) i trzyma log. UI odpytuje `GET /store/rfqs/:id` co 1,5 s.

```text
UI (formularz) ──POST /store/rfqs──▶ backend ◀──polling── agent kupującego (store API)
                                       ▲
                                       └──polling── agent sprzedawcy ×N (vendor API, login członka)
UI ──POST /store/rfqs/:id/accept──▶ backend ──▶ zamówienie w Mercurze (F08)
```

## Encje

Wszystkie ceny w PLN, jednostki główne (4690 = 4690 zł), netto. Waluta zawsze `pln`.

### `rfq`

| Pole | Typ | Uwagi |
|---|---|---|
| `id` | `rfq_...` | |
| `status` | `draft` → `negotiating` → `ready` → `accepted` / `cancelled` | patrz „Statusy" |
| `need_text` | text | to, co wpisał człowiek, np. „20 MacBooków, 30 Lenovo, 10 HP" |
| `items` | json `[{ variant_id, product_title, quantity, target_unit_price? }]` | ustawia agent kupującego |
| `max_rounds` | number, domyślnie 3 | limit wiadomości sprzedawcy w jednej negocjacji |
| `accept_token` | text | losowy, zwracany **tylko** przy tworzeniu. Dostaje go UI, agent nie. Nigdy nie wraca w GET |

### `rfq_negotiation` (jedna na parę RFQ–sprzedawca)

| Pole | Typ | Uwagi |
|---|---|---|
| `id` | `rfqneg_...` | |
| `rfq_id`, `seller_id` | text | `seller_id` jako zwykły tekst, bez linku modułów |
| `status` | `awaiting_seller` / `awaiting_buyer` / `final` / `declined` / `accepted` / `rejected` | |
| `round` | number | liczba wiadomości sprzedawcy |

### `rfq_message`

| Pole | Typ | Uwagi |
|---|---|---|
| `id` | `rfqmsg_...` | |
| `negotiation_id` | text | |
| `author` | `buyer_agent` / `seller_agent` / `system` | |
| `kind` | sprzedawca: `offer`, `counter`, `final`, `decline`. Kupujący: `counter`, `stop`. System: `note` | |
| `lines` | json `[{ variant_id, quantity, unit_price }]` | puste dla `decline`, `stop`, `note` |
| `text` | text | treść dla człowieka, widoczna w czacie UI |

## Statusy i kolejność ruchów

1. UI tworzy RFQ z `need_text`. Status `draft`.
2. Agent kupującego znajduje RFQ w `draft`, dobiera produkty (`/store/products`, `/store/offers`) i wysyła `POST /store/rfqs/:id/items`. Backend rozsyła zapytanie: tworzy negocjację dla każdego sprzedawcy, który ma ofertę na co najmniej jeden `variant_id`. Każda negocjacja dostaje status `awaiting_seller`, a RFQ status `negotiating`.
3. Sprzedawca odpowiada (`offer` / `counter` / `final` / `decline`), negocjacja przechodzi na `awaiting_buyer`, `round += 1`. Jeśli `round == max_rounds`, backend zapisuje wiadomość jako `final`.
4. Kupujący odpowiada `counter` (wraca do `awaiting_seller`) albo `stop` (ostatnia oferta sprzedawcy staje się końcowa, status `final`).
5. Gdy każda negocjacja jest `final` albo `declined`, RFQ ma status `ready`.
6. Człowiek w UI wybiera negocjacje i akceptuje. Można zaakceptować negocjację `final` albo `awaiting_buyer`, czyli bieżącą ofertę sprzedawcy bez czekania na koniec. Wybrane dostają `accepted`, reszta `rejected`, RFQ `accepted`, a F08 tworzy zamówienia.

> **Zaimplementowane (F03/F04).** Wzór klienta i szybki test całego flow: `PK=<klucz> bun scripts/rfq-smoke.ts`. Każde uruchomienie tworzy zamówienia i rezerwuje stan.

Ruch nie w swojej kolejce kończy się błędem `NOT_YOUR_TURN`.

**Wolny czat:** obie strony mogą w każdej chwili, dopóki negocjacja jest otwarta, wysłać `kind: "note"` z samym tekstem. Taka wiadomość nie zmienia kolejki ani rund i nie przechodzi przez reguły cenowe, bo nie jest ofertą. Agent może napisać, co chce, ale ofertą jest tylko wiadomość z `lines`, a tę sprawdza backend.

**Ważność oferty:** każda oferta sprzedawcy (wiadomość z `lines`) ma w odpowiedzi `valid_until`, czyli czas wysłania plus `RFQ_OFFER_TTL_MINUTES` (domyślnie 30). Akceptacja przeterminowanej oferty kończy się błędem `OFFER_EXPIRED`.

## Endpointy

### Store API (nagłówek `x-publishable-api-key`, klucz z logu seeda)

| Metoda i ścieżka | Kto woła | Body / query | Odpowiedź |
|---|---|---|---|
| `POST /store/rfqs` | UI | `{ need_text, max_rounds? }` | `{ rfq, accept_token }` |
| `POST /store/rfq-requests` | storefront (koszyk) | `{ cart_id, message, max_rounds? }` | `{ rfq, accept_token }`. RFQ od razu `negotiating`: wątek z każdym sprzedawcą z koszyka, pierwsza wiadomość autora `buyer` (człowiek) z jego pozycjami |
| `GET /store/rfqs?status=draft` | agent kupującego | `status` | `{ rfqs: [rfq] }` |
| `GET /store/rfqs/:id` | UI, agent kupującego | | `{ rfq }` z negocjacjami, wiadomościami i `summary` |
| `POST /store/rfqs/:id/items` | agent kupującego | `{ items: [{ variant_id, quantity, target_unit_price? }] }` | `{ rfq }` (po rozesłaniu) |
| `POST /store/rfq-negotiations/:id/messages` | agent kupującego | `{ kind: "counter" \| "stop", lines?, text }` | `{ negotiation }` |
| `POST /store/rfqs/:id/accept` | **tylko UI** | `{ accept_token, negotiation_ids: [...] }` | `{ rfq, orders: [{ id, seller_id, total }] }` |

### Vendor API (`Authorization: Bearer <token>` z `POST /auth/member/emailpass` + nagłówek `x-seller-id`)

| Metoda i ścieżka | Kto woła | Body / query | Odpowiedź |
|---|---|---|---|
| `GET /vendor/rfq-negotiations?status=awaiting_seller` | agent sprzedawcy | `status` | `{ negotiations: [...] }` z RFQ, wiadomościami i **prywatnym** `pricing` |
| `POST /vendor/rfq-negotiations/:id/messages` | agent sprzedawcy | `{ kind, lines, text }` | `{ negotiation }` albo 422 |

Trasy w `src/api/vendor/*` przechodzą przez middleware sprzedawcy Mercura, który wypełnia kontekst sprzedawcy (docs: `resources/tutorials/custom-api-route.mdx`). Backend filtruje negocjacje po tym sprzedawcy.

## Guardrails (F04), egzekwowane w backendzie

| Kod 422 | Kiedy |
|---|---|
| `BELOW_MIN_PRICE` | `unit_price` sprzedawcy < cena minimalna (`minPriceFor()` z `src/scripts/seed-data.ts`, później tabela `SellerPriceRule`) |
| `OVER_STOCK` | `quantity` > stan sprzedawcy dla wariantu |
| `UNKNOWN_VARIANT` | wariant spoza RFQ albo bez oferty tego sprzedawcy |
| `NOT_YOUR_TURN` | wiadomość przy złym statusie negocjacji |
| `NEGOTIATION_CLOSED` | negocjacja `final`, `declined`, `accepted` albo `rejected` |
| `INVALID_ACCEPT_TOKEN` | akceptacja bez poprawnego `accept_token` |
| `OFFER_EXPIRED` | akceptacja oferty po jej `valid_until` |
| `EMPTY_MESSAGE` | wiadomość czatu (`note`) bez tekstu |

Format błędu: `{ "code": "BELOW_MIN_PRICE", "message": "Cena 4100 < minimum dla tej oferty" }`. Agent sprzedawcy dostaje błąd jako wynik narzędzia i poprawia ofertę.

Store API **nigdy** nie zwraca: ceny minimalnej, rabatów wolumenowych, `accept_token` (poza odpowiedzią na `POST /store/rfqs`).

## Przykłady JSON (do mocków)

`GET /store/rfqs/:id`:

```json
{
  "rfq": {
    "id": "rfq_01J9DEMO",
    "status": "negotiating",
    "need_text": "20 MacBooków, 30 Lenovo, 10 HP",
    "max_rounds": 3,
    "items": [
      { "variant_id": "variant_mba", "product_title": "Apple MacBook Air 13 M4 16 GB / 512 GB", "quantity": 20, "list_unit_price": 4790 },
      { "variant_id": "variant_t14", "product_title": "Lenovo ThinkPad T14 Gen 5 16 GB / 512 GB", "quantity": 30, "list_unit_price": 4390 }
    ],
    "negotiations": [
      {
        "id": "rfqneg_01",
        "seller": { "id": "sel_istacja", "name": "iStacja" },
        "status": "awaiting_buyer",
        "round": 1,
        "messages": [
          {
            "id": "rfqmsg_01",
            "author": "seller_agent",
            "kind": "offer",
            "lines": [{ "variant_id": "variant_mba", "quantity": 20, "unit_price": 4650 }],
            "text": "20 sztuk od ręki, przy tej ilości 4650 zł/szt.",
            "created_at": "2026-11-05T19:40:00Z"
          }
        ],
        "latest_total": 93000
      }
    ],
    "summary": { "list_total": 95800, "best_total": 93000, "savings": 2800 }
  }
}
```

`GET /vendor/rfq-negotiations?status=awaiting_seller` (widzi tylko zalogowany sprzedawca):

```json
{
  "negotiations": [
    {
      "id": "rfqneg_01",
      "rfq": { "id": "rfq_01J9DEMO", "need_text": "20 MacBooków, 30 Lenovo, 10 HP", "max_rounds": 3 },
      "status": "awaiting_seller",
      "round": 0,
      "requested": [{ "variant_id": "variant_mba", "product_title": "Apple MacBook Air 13 M4 16 GB / 512 GB", "quantity": 20 }],
      "pricing": [
        {
          "variant_id": "variant_mba",
          "unit_price": 4790,
          "min_unit_price": 4290,
          "stock": 60,
          "volume_discounts": [{ "min_quantity": 10, "discount_pct": 3 }, { "min_quantity": 20, "discount_pct": 6 }]
        }
      ],
      "messages": []
    }
  ]
}
```

`POST /vendor/rfq-negotiations/rfqneg_01/messages`:

```json
{ "kind": "offer", "lines": [{ "variant_id": "variant_mba", "quantity": 20, "unit_price": 4650 }], "text": "20 sztuk od ręki, przy tej ilości 4650 zł/szt." }
```

## Agenci (F05, F06)

- **Agent kupującego:** jeden proces. Ma klucz publiczny i nie ma `accept_token`, więc nie zaakceptuje oferty. Narzędzia: szukaj produktów, ustaw pozycje RFQ, czytaj RFQ, wyślij `counter` / `stop`.
- **Agent sprzedawcy:** jeden proces na sprzedawcę (na demo 3: `techhurt`, `laptopol`, `istacja`, hasło `supersecret`). Loguje się jako członek, odpytuje swoje negocjacje i odpowiada. Cenę minimalną zna z `pricing`, ale backend i tak ją sprawdza.
- **Polling:** agenci co 2 s, UI co 1,5 s. Bez webhooków i SSE.
- **Runtime:** do wyboru przez S3 (DECYZJA w journalu). Wymóg: wywołanie modelu z function calling ze skryptu Bun.

## Otwarte

- **F08 (rozwiązane, sprawdzone):** `createNegotiatedOrder(container, { lines: [{ offer_id, quantity, unit_price }], email, address })` w `marketplace/packages/api/src/lib/create-negotiated-order.ts`. Tworzy koszyk, dodaje pozycje z wynegocjowaną ceną po stronie serwera, dodaje wysyłkę każdego sprzedawcy i płatność systemową, potem `completeCartWithSplitOrdersWorkflow` dzieli koszyk na zamówienia per sprzedawca. Trasa `accept` woła tę funkcję z liniami ofert końcowych. `offer_id` wyznacza z pary (`seller_id`, `variant_id`), bo sprzedawca ma jedną ofertę na wariant. Uwaga: `POST /store/carts/:id/line-items` w Store API odrzuca `unit_price` (wbrew dokumentacji Mercura), więc ceny nie da się nadpisać z UI ani z agenta. I dobrze. Sprawdzenie: `bunx medusa exec ./src/scripts/smoke-negotiated-order.ts` (tworzy prawdziwe zamówienia i rezerwuje stan, przed demo zrób `./scripts/setup-marketplace.sh --reset`).
- **Blok `messaging` Mercura:** odrzucony na teraz. Własna tabela `rfq_message` jest prostsza i daje strukturalne ceny, których potrzebuje F04.
- **Autoryzacja agenta kupującego:** store API jest publiczne, więc każdy z kluczem może pisać jako kupujący. Na demo to akceptujemy.
