# Seed demo (F02): jak działa i co ustaliliśmy

> Stan na 2026-11-05 ok. 19:15. Seed: `marketplace/packages/api/src/scripts/seed.ts` + `seed-data.ts` (a36a928).
> Mercur 2.4.1 (Medusa 2.22.3). Dane demo w JSON-ie dla mocków agentów: `docs/seed/rfq-demo-data.json`.

## Jedna komenda

```bash
./scripts/setup-marketplace.sh --reset   # kasuje lokalną bazę, migracje, seed, admin
cd marketplace && bun run dev            # API :9000, admin :9000/dashboard, sprzedawca :9000/seller
```

- Admin: `admin@example.com` / `supersecret`.
- Sprzedawcy: `<handle>@example.com` / `supersecret`, np. `techhurt@example.com`.
- Publishable API key jest w logu seeda albo w bazie: `docker exec rfq-postgres psql -U postgres -d mercur -tAc "select token from api_key where type='publishable'"`.

## Co jest w bazie

- 15 sprzedawców, 92 produkty, 302 oferty, waluta PLN, region Polska.
- 12 sklepów z losowym (deterministycznym) katalogiem elektroniki, żeby marketplace wyglądał realnie.
- 3 sklepy demo i 3 laptopy demo z **ustalonymi** ofertami (`DEMO_SELLERS`, `DEMO_OFFERS` w `seed-data.ts`). Te laptopy nie dostają ofert losowych, więc scenariusz demo zawsze kończy się tak samo.

| Produkt | Sklep | Cena | Min (prywatne) | Stan | Rabat wolumenowy |
|---|---|---|---|---|---|
| Apple MacBook Air 13 M4 16 GB / 512 GB | TechHurt | 4690 | 4390 | 25 | 10+ 2%, 20+ 4% |
| | iStacja | 4790 | 4290 | 60 | 10+ 3%, 20+ 6% |
| Lenovo ThinkPad T14 Gen 5 16 GB / 512 GB | TechHurt | 4290 | 3990 | **15** | 10+ 3% |
| | LaptoPol | 4390 | 3950 | 80 | 10+ 3%, 25+ 7% |
| HP EliteBook 840 G11 16 GB / 512 GB | TechHurt | 4490 | 4250 | **8** | brak |
| | LaptoPol | 4590 | 4190 | 40 | 10+ 4% |

Scenariusz „20 MacBooków, 30 Lenovo, 10 HP":

- **MacBooki:** iStacja ma wyższą cenę katalogową, ale schodzi niżej (4290 vs 4390). Wygrywa „droższy" sklep.
- **Lenovo:** TechHurt jest tańszy, ale ma tylko 15 sztuk. Albo całość z LaptoPolu, albo podział 15 + 15.
- **HP:** tylko LaptoPol ma 10 sztuk.
- Wynik to zamówienie dzielone (F09): Maki od iStacji, Lenovo i HP od LaptoPolu.
- Licznik (F10): katalog u zwycięzców 273 400 zł, przy cenach minimalnych 246 200 zł, czyli najwyżej 27 200 zł (ok. 10%) oszczędności.

## Cena minimalna: gdzie jest i gdzie nie może być

- **Nie w `metadata`.** Mercur 2.4.1 zwraca `metadata` oferty w `/store/offers` i `metadata` sprzedawcy w `/store/sellers` domyślnie (`packages/core/src/api/store/{offers,sellers}/query-config.ts` w `mercurjs/mercur`). Każdy, także agent kupującego, zobaczyłby cenę minimalną.
- **Teraz:** tabela `seller_price_rule` w module RFQ, jeden wiersz na `offer_id` (`min_unit_price`, `volume_discounts`). Zasila ją `bun run seed` (i osobno `bun run seed:price-rules`, idempotentnie) z `DEMO_OFFERS`/`minPriceFor()` w `seed-data.ts`. Guardrail F04 i `pricing` w Vendor API czytają stąd, nie z promptu. Żaden endpoint sklepu tego nie zwraca.

W `metadata` zostaje tylko to, co publiczne: `list_price_pln` (oferta) oraz `city` i `categories` (sprzedawca).

## Jak agenci czytają dane (Mercur 2.4.1)

- **Kupujący / RFQ:** `GET /store/offers?product_id=<id>` z nagłówkiem `x-publishable-api-key`. Zwraca sprzedawcę, cenę (`prices[]`) i stan (`inventory_item_link.inventory_item.location_levels`). Dopasowanie RFQ do sprzedawców idzie po `product_id`/`variant_id` ofert, nie po kategorii.
- **Sprzedawca:** `POST /auth/member/emailpass` (email, hasło) → token. `GET /vendor/sellers` → `seller_members[0].seller_id`. `GET /vendor/offers` z `Authorization: Bearer <token>` i `x-seller-id: <seller_id>` → tylko własne oferty.

## Weryfikacja (2026-11-05, backend z `bun run dev`)

| Check | Wynik |
|---|---|
| `GET /health` | `OK` |
| `GET /store/offers` (wszystkie strony) | 302 oferty, klucze metadata: `list_price_pln`, 0 pól prywatnych, także z `fields=*metadata` |
| `GET /store/sellers` | 15 sprzedawców, klucze metadata: `city`, `categories`, 0 pól prywatnych |
| `GET /store/offers?product_id=...` dla 3 laptopów demo | po 2 oferty, ceny i stany 1:1 z tabeli wyżej |
| login + `GET /vendor/offers` | TechHurt 3, LaptoPol 2, iStacja 1 oferta, tylko własne, 0 pól prywatnych w metadata |

Nie sprawdzone: klik w panelu sprzedawcy w przeglądarce, storefront (`marketplace/apps/storefront` jeszcze nieskonfigurowany).

## Otwarte

- **F00:** wpisać do kontraktu, gdzie leży cena minimalna (propozycja wyżej). Do tego czasu F02 zostaje `in-progress` (ostatni punkt `done_when`).
- **F08, zamówienie po wynegocjowanej cenie:** do sprawdzenia. Opcje: workflow w backendzie, który tworzy koszyk z `unit_price` nadpisanym na wynegocjowaną cenę i go domyka, albo draft order (`@medusajs/draft-order` jest w zależnościach). Mercur ma własne `/store/carts/:id/line-items` i dzieli zamówienia per sprzedawca (`order-groups`).
- **Storefront:** subskryber `storefront-cache-revalidate` loguje `fetch failed`, gdy storefront nie stoi. Niegroźne.
