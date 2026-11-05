# Marketplace RFQ z negocjacją agentów

Hackathon. Marketplace na open source Mercurze, w którym agent kupującego negocjuje z agentami sprzedawców, a człowiek akceptuje wynik i powstaje zamówienie.

- **Co budujemy:** [`product.md`](product.md)
- **Jak pracujemy (ludzie i agenci):** [`AGENTS.md`](AGENTS.md)

## Start

```bash
git clone https://github.com/jakub-borek/weather-app-hackaton.git
cd weather-app-hackaton
./init.sh
```

`./init.sh` sprawdza środowisko i pokazuje stan zespołu: kto co robi, co jest gotowe, co można wziąć.

## Marketplace lokalnie (Mercur 2.4.1)

Wymagane: Docker, Node >= 22, Bun.

```bash
./scripts/setup-marketplace.sh            # Postgres + Redis, .env, migracje, seed, konto admina
./scripts/setup-marketplace.sh --reset    # to samo na czystej bazie
cd marketplace && bun run dev             # API :9000, admin :9000/dashboard, sprzedawca :9000/seller
```

- **Admin:** `admin@example.com` / `supersecret`
- **Sprzedawcy:** hasło `supersecret`, loginy w `marketplace/packages/api/src/scripts/seed-data.ts`, np. `techhub@example.com`. Sklepy demo to `techhurt@`, `laptopol@` i `istacja@example.com`.
- **Seed:** 15 sprzedawców, 92 produkty elektroniczne w 6 kategoriach (laptopy, komputery, monitory, peryferia, podzespoły, akcesoria), ok. 300 ofert w PLN. Scenariusz demo „20 MacBooków, 30 Lenovo, 10 HP" ma stałe oferty (`DEMO_OFFERS`).
- **Ceny minimalne nie są w `metadata`,** bo Store API zwraca je publicznie. Są w `minPriceFor()` w `seed-data.ts`.
- **Klucz publiczny dla storefrontu** wypisuje seed na końcu logu.

## Co gdzie jest

| Plik | Po co |
|---|---|
| `feature_list.json` | feature'y F00–F13: status, owner, zależności, evidence |
| `progress.md` | stan na teraz, blok na każdy strumień |
| `session-handoff.md` | checkpoint całego zespołu |
| `harness/journal/` | historia pracy każdej osoby (`./scripts/log.sh`) |
| `harness/sessions/` | wyeksportowane sesje agentów |
| `scripts/status.sh` | stan zespołu w jednym widoku |
