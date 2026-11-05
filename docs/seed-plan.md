# Seed demo (F02): plan i ustalenia

> Przygotowane przed F01, na podstawie kodu `mercurjs/mercur` v2.4.1 (release 2026-11-04).
> Pliki: `docs/seed/rfq-demo-data.json` (dane), `docs/seed/seed-rfq.ts` (skrypt), `docs/seed/db-reset.sh` (jedna komenda).
> Skrypt i reset to szkice. Przenosimy je do backendu Mercura po F01 i dopiero wtedy uruchamiamy.

## TL;DR

- W Mercurze 2.x produkt jest wspólny dla całego katalogu, a sprzedawca ma do niego **ofertę** (`offer`): cenę, stan, SKU i czas wysyłki. Jeden „MacBook Air" może mieć oferty od kilku sklepów. To dokładnie model, którego potrzebuje RFQ.
- Seedujemy własnym skryptem zamiast domyślnego seeda. Domyślny wrzuca 3 sklepy z butami, które zaśmiecają panele i dopasowanie RFQ.
- **Cena minimalna nie może być w `offer.metadata`**, bo `/store/offers` zwraca `metadata` każdemu, także agentowi kupującego. Proponuję tabelę reguł w module RFQ (F03). To trzeba wpisać do kontraktu F00.
- Dane w JSON-ie są gotowe już teraz. S3 i S4 mogą ich używać w mockach, zanim Mercur wstanie.

## Co jest w Mercurze 2.4.1 (sprawdzone w kodzie)

| Temat | Ustalenie | Źródło w `mercurjs/mercur` |
|---|---|---|
| Instalacja | `bun create mercur-app@latest <dir>`, potem `bun run dev`. Backend :9000, admin :7000 (też `:9000/dashboard`), panel sprzedawcy :7001 (też `:9000/seller`) | `README.md`, `templates/basic/README.md` |
| Struktura | `packages/api` (Medusa 2.22.3 + `@mercurjs/core`), `apps/admin`, `apps/vendor`. **Storefrontu w szablonie nie ma** | `templates/basic/` |
| Seed | `bun run seed` = `medusa exec ./src/scripts/seed.ts`. Pomija wszystko, jeśli istnieje `seller@mercur.dev` | `templates/basic/packages/api/src/scripts/seed.ts` |
| Oferta | `seller_id`, `variant_id`, `product_id`, `sku` (unikalne per sprzedawca), `leadtime_to_ship`, `metadata`, `prices[]` (z `min_quantity`/`max_quantity`), `inventory_items[]` ze stanem per magazyn | `packages/core/src/modules/offer/models/offer.ts`, `packages/types/src/offer/mutations.ts` |
| Workflowy seeda | `createSellerAccountWorkflow` → `approveSellerWorkflow` → `createSellerStockLocationsWorkflow` → `createSellerShippingOptionsWorkflow` → `createProductsWorkflow` → `createOffersWorkflow` | `@mercurjs/core/workflows` |
| API sklepu | `GET /store/offers` z filtrami `product_id`, `variant_id`, `seller_id`, `sku`. Domyślnie zwraca `metadata`, ceny i stany | `packages/core/src/api/store/offers/query-config.ts` |
| API sprzedawcy | `/vendor/offers` (CRUD, batch stanów). Agent sprzedawcy może tu czytać swoje oferty jako członek sprzedawcy | `packages/core/src/api/vendor/offers/` |
| Reset bazy | Medusa CLI nie ma `db:reset`. Robi się to przez `DROP DATABASE` + `medusa db:setup --db <nazwa>` | docs Medusy 2.22.3 (Context7) |

## Decyzje (propozycje do potwierdzenia)

1. **Własny seed `seed-rfq.ts` na czystej bazie.** Odrzucone: dopisanie laptopów do domyślnego seeda. Buty i 3 dodatkowe sklepy psują demo i dopasowanie RFQ do asortymentu.
2. **PLN, region „Polska", ceny netto, podatek 0.** Demo jest po polsku, a licznik oszczędności w złotówkach czyta się lepiej. Gdyby PLN sprawiał kłopoty w F08, wracamy do EUR z szablonu.
3. **Cena minimalna i rabaty wolumenowe w module RFQ (F03), nie w Mercurze.** Proponowany model `SellerPriceRule` (moduł `rfq`): `offer_id`, `seller_id`, `variant_id`, `currency_code`, `min_unit_price`, `volume_discounts` (json). Guardrail F04 czyta stąd cenę minimalną. Odrzucone: `offer.metadata`, bo jest publiczne.
4. **Jedna cena katalogowa na ofertę, bez progów `min_quantity` w Mercurze.** Rabaty wolumenowe są prywatną regułą agenta sprzedawcy. Odrzucone: progi cenowe w Mercurze. Wyglądają dobrze, ale dokładają ryzyko w koszyku i w F08.
5. **Jeden wariant na produkt** (16 GB / 512 GB). Mercur 2.4 wymaga atrybutu-osi wariantu, więc seed zakłada atrybut „Konfiguracja".
6. **Hasło sprzedawców `supersecret`** jak w szablonie Mercura. To dane lokalnego demo, nie sekret.

## Dane demo

Sprzedawcy (logowanie do panelu sprzedawcy, hasło `supersecret`):

| Sklep | Login | Miasto | Profil |
|---|---|---|---|
| TechHurt | `techhurt@example.com` | Warszawa | hurtownia, wszystkie marki, najniższe ceny katalogowe, małe stany |
| LaptoPol | `laptopol@example.com` | Kraków | Lenovo i HP, duże stany |
| iStacja | `istacja@example.com` | Gdańsk | tylko Apple |

Oferty (PLN netto, „min" jest prywatne):

| Produkt | Sklep | Cena katalogowa | Min | Stan | Rabat wolumenowy |
|---|---|---|---|---|---|
| MacBook Air 13" M4 16/512 | TechHurt | 4690 | 4390 | 25 | 10+ 2%, 20+ 4% |
| | iStacja | 4790 | 4290 | 60 | 10+ 3%, 20+ 6% |
| ThinkPad T14 Gen 5 16/512 | TechHurt | 4290 | 3990 | **15** | 10+ 3% |
| | LaptoPol | 4390 | 3950 | 80 | 10+ 3%, 25+ 7% |
| EliteBook 840 G11 16/512 | TechHurt | 4490 | 4250 | **8** | brak |
| | LaptoPol | 4590 | 4190 | 40 | 10+ 4% |

Dane są ustawione pod scenariusz demo „20 MacBooków, 30 Lenovo, 10 HP":

- **MacBooki:** iStacja ma wyższą cenę katalogową, ale niżej schodzi w negocjacji (4290 vs 4390). Wygrywa „droższy" sklep.
- **Lenovo:** TechHurt jest tańszy, ale ma tylko 15 sztuk. Albo całość z LaptoPolu, albo podział 15 + 15.
- **HP:** tylko LaptoPol ma 10 sztuk.
- Wynik to naturalne zamówienie dzielone (F09): Maki od iStacji, Lenovo i HP od LaptoPolu.
- Licznik (F10): katalog u zwycięzców 273 400 zł. Przy cenach minimalnych 246 200 zł, czyli najwyżej 27 200 zł (ok. 10%) oszczędności.
- iStacja nie dostaje RFQ na Lenovo ani HP, więc widać dopasowanie do asortymentu (F03).

## Jedna komenda (po F01)

Backend Mercura jest w `marketplace/packages/api` (F01, Mercur 2.4.1, Postgres i Redis z `docker-compose.yml`).

```bash
API=marketplace/packages/api
cp docs/seed/seed-rfq.ts docs/seed/rfq-demo-data.json $API/src/scripts/
cp docs/seed/db-reset.sh $API/scripts/
# w $API/package.json:
#   "seed:rfq": "medusa exec ./src/scripts/seed-rfq.ts",
#   "db:reset": "bash ./scripts/db-reset.sh"
cd $API && bun run db:reset
```

`db:reset` kasuje bazę z `DATABASE_URL` (odmawia, jeśli to nie localhost), robi `medusa db:setup`, seed RFQ i admina `admin@example.com` / `supersecret`. Bez `psql` na hoście używa kontenera `rfq-postgres`. Alternatywa bez skryptu: `docker compose down -v && docker compose up -d --wait`, potem `db:setup` i `seed:rfq`. Seed jest idempotentny: drugi raz pomija sprzedawców i dopisuje tylko reguły cenowe. Dzięki temu można go puścić ponownie po F03.

## Checklista F02 po F01

- [ ] Przenieść pliki (wyżej), poprawić importy, jeśli wersja Mercura różni się od 2.4.1.
- [ ] `bun run db:reset` przechodzi bez błędów.
- [ ] Logowanie na każdego sprzedawcę w panelu (:7001) pokazuje jego oferty i stany.
- [ ] `curl -H "x-publishable-api-key: <klucz z logu seeda>" "localhost:9000/store/offers?product_id=<id>"` zwraca 2 oferty i **nie ma** w nich `min_unit_price`.
- [ ] Po F03: seed zapisuje reguły w module `rfq` (bez ostrzeżenia w logu).
- [ ] Evidence i `DONE` w journalu.

## Do uzgodnienia z S2 (kontrakt F00)

- Nazwa modułu (`rfq`) i model reguł (`SellerPriceRule` → metoda `createSellerPriceRules`). Seed już tego oczekuje, patrz `seedPriceRules` w `seed-rfq.ts`.
- RFQ dopasowuje sprzedawców po `product_id`/`variant_id` ofert (`/store/offers?product_id=...`), a nie po kategorii. Kategoria „Laptopy" jest jedna, więc nie rozróżnia marek.
- Agent sprzedawcy czyta stan i cenę z `/vendor/offers`, a cenę minimalną z modułu RFQ. Cenę minimalną egzekwuje backend (F04), nie prompt.

## Ryzyka

- **Storefront (S4, F01):** szablon nie ma storefrontu. `mercurjs/b2c-marketplace-storefront` ostatnio zmieniany 2026-07-28, na `@medusajs/js-sdk` ^2.12.5. Może nie znać modelu ofert z 2.4. Najbezpieczniej postawić prostą własną stronę RFQ (Next.js albo Vite) na `/store/offers` i API RFQ zamiast pełnego storefrontu.
- **Produkt „należy" do jednego sprzedawcy:** `createProductsWorkflow` wymaga `created_by` (członek sprzedawcy). Seed zakłada produkt przez pierwszego sklepu, który go oferuje. Do sprawdzenia po F01, czy drugi sklep widzi ten produkt w panelu jako swoją ofertę.
- **F08, zamówienie po wynegocjowanej cenie:** do sprawdzenia. Opcje: workflow w backendzie, który tworzy koszyk z `unit_price` nadpisanym na wynegocjowaną cenę i go domyka, albo draft order (`@medusajs/draft-order` jest w zależnościach szablonu). Mercur ma własne `/store/carts/:id/line-items` i dzieli zamówienia per sprzedawca (`order-groups`).
- **`db:setup` może pytać interaktywnie.** Jeśli tak, dodać flagę non-interactive albo `createdb` + `medusa db:migrate`.
