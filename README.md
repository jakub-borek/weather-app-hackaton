# RFQ marketplace with agent negotiation

> **Judges, start here: [Pitch deck (PDF, 5 slides)](pitch/pitch.pdf)**. Interactive version: [`pitch/index.html`](pitch/index.html) (download and open locally, arrow keys to navigate).
>
> AI coding session exports: [`sessions/`](sessions/). Product spec: [`product.md`](product.md).

Hackathon project. A marketplace built on open-source Mercur, where the buyer's agent negotiates with sellers' agents, the human approves the result, and a real order is created.

- **What we build:** [`product.md`](product.md)
- **How we work (humans and agents):** [`AGENTS.md`](AGENTS.md)

## Start

```bash
git clone https://github.com/jakub-borek/weather-app-hackaton.git
cd weather-app-hackaton
./init.sh
```

`./init.sh` checks the environment and shows the team status: who is doing what, what is done, what is free to take.

## Marketplace locally (Mercur 2.4.1)

Requires Docker, Node >= 22 and Bun.

```bash
./scripts/setup-marketplace.sh            # Postgres + Redis, .env, migrations, seed, admin account
./scripts/setup-marketplace.sh --reset    # the same on a clean database
cd marketplace && bun run dev             # API :9000, admin :9000/dashboard, seller panel :9000/seller
```

- **Admin:** `admin@example.com` / `supersecret`
- **Sellers:** password `supersecret`, logins in `marketplace/packages/api/src/scripts/seed-data.ts`, e.g. `techhub@example.com`. The demo shops are `techhurt@`, `laptopol@` and `istacja@example.com`.
- **Seed:** 15 sellers, 92 electronics products in 6 categories (laptops, computers, monitors, peripherals, components, accessories), about 300 offers in PLN. The demo scenario "20 MacBooks, 30 Lenovo, 10 HP" has fixed offers (`DEMO_OFFERS`).
- **Minimum prices are not in `metadata`,** because the Store API returns metadata publicly. They live in `minPriceFor()` in `seed-data.ts`.
- **The storefront publishable key** is printed at the end of the seed log.
- **Product images:** `bun scripts/product-images.ts` with the backend running (also after `--reset`). It downloads images from Wikimedia Commons to `packages/api/static/products/` (not in git) and attaches them to products.
- **The admin panel dev server runs on :7010,** not :7000, because macOS AirPlay Receiver uses :7000.

## Sharing with the team (ngrok)

```bash
cd marketplace/packages/api && bun run dev   # backend only
./scripts/share-marketplace.sh               # tunnels (backend + storefront if it runs on :3000), panel builds, links
./scripts/share-marketplace.sh --stop        # stop
```

Details, free ngrok limits and pitfalls: [`docs/share-ngrok.md`](docs/share-ngrok.md).

## What is where

| File | Purpose |
|---|---|
| `feature_list.json` | features F00–F13: status, owner, dependencies, evidence |
| `progress.md` | current state, one block per stream |
| `session-handoff.md` | whole-team checkpoint |
| `harness/journal/` | each person's work history (`./scripts/log.sh`) |
| `sessions/` | exported AI coding sessions (organizers' requirement, instructions in `sessions/README.md`) |
| `pitch/` | pitch deck: `index.html` (source), `pitch.pdf` (`./scripts/pitch-pdf.sh`) |
| `scripts/status.sh` | team status in one view |
