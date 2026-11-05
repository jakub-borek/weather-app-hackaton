# Mercur dla zespołu przez ngrok

Jeden backend Mercura na jednym laptopie, wystawiony przez tunel ngrok. Reszta zespołu dostaje storefront, panel admina, panel sprzedawcy i API, na wspólnej bazie i wspólnym seedzie. Backend (API + panele) idzie jednym tunelem, storefront drugim.

## Jak to odpalić

Wymagane: `ngrok` z authtokenem (`brew install ngrok`, potem `ngrok config add-authtoken <token>` z https://dashboard.ngrok.com/get-started/your-authtoken).

```bash
cd marketplace/packages/api && bun run dev   # sam backend, NIE turbo z katalogu marketplace
cd marketplace/apps/storefront && bun run dev # storefront na :3000 (osobny terminal), potrzebuje .env.local z PK i regionem pl
./scripts/share-marketplace.sh               # tunel + build paneli + linki i klucz publiczny
./scripts/share-marketplace.sh --stop        # koniec: oba tunele stop, build paneli usunięty
```

Skrypt na końcu wypisuje gotowe linki do wysłania:

```
Storefront:        https://<domena-2>/pl
Panel admina:      https://<domena>/dashboard   admin@example.com / supersecret
Panel sprzedawcy:  https://<domena>/seller      techhurt@example.com / supersecret
Store API:         https://<domena>/store/...   x-publishable-api-key: pk_...
```

Inspektor ruchu (każdy request przez tunel): http://127.0.0.1:4040 dla backendu, :4041 dla storefrontu.

## Co robi skrypt

1. Sprawdza, czy backend odpowiada na `localhost:9000/health`.
2. Startuje `ngrok http 9000` w tle (log w `ngrok-9000.log`) albo bierze już działający tunel.
3. Jeśli na :3000 chodzi storefront, startuje dla niego drugi agent `ngrok http 3000`. Storefront woła backend tylko po stronie serwera Next (`MEDUSA_BACKEND_URL=localhost:9000`), więc w nim nic się nie przebudowuje. Next 16 w trybie dev blokuje `/_next/*` dla obcych domen, dlatego `next.config.ts` ma `allowedDevOrigins` dla domen ngrok.
4. Buduje panele `apps/admin` i `apps/vendor` przez `vite build` z `MERCUR_BACKEND_URL=<adres tunelu>`. Adres backendu trafia do paneli przy buildzie (`__BACKEND_URL__`), więc bez tego panel u kolegi woła `localhost:9000`, czyli jego własny komputer. Gdy Vite dev nie chodzi, backend sam serwuje `apps/*/dist` pod `/dashboard` i `/seller`.
5. Loguje się jako admin i wypisuje klucz publiczny do Store API.

Darmowy ngrok daje losową domenę przy każdym starcie. Skrypt zapisuje adres w `dist/.backend-url` i przebudowuje panele tylko wtedy, gdy domena się zmieniła. `--rebuild` wymusza build.

## Dla reszty zespołu

- **Storefront i panele:** link ze skryptu (`/pl`, `/dashboard`, `/seller`). Przy pierwszym wejściu ngrok może pokazać ekran „You are about to visit". Kliknij Visit, potem przez 7 dni jest spokój.
- **Agent albo skrypt na wspólnym backendzie:** base URL `https://<domena>`, Store API z nagłówkiem `x-publishable-api-key`. Programy (Bun, curl) ekranu ngrok nie dostają. Gdyby jednak przyszedł HTML zamiast JSON-a, dodaj nagłówek `ngrok-skip-browser-warning: 1`.
- **Lokalny storefront lub panel na wspólnej bazie:** `MEDUSA_BACKEND_URL` / `MERCUR_BACKEND_URL` ustaw na adres tunelu. CORS backendu przepuszcza lokalne panele (`localhost:7001`, `7010`). Storefront z `localhost:3000` trzeba dopisać do `STORE_CORS` na laptopie z backendem, jeśli woła API z przeglądarki.

## Pułapki (dlaczego jest tak, a nie inaczej)

- **Port 7000 zajmuje macOS (AirPlay Receiver).** Mercur traktował go jak serwer Vite panelu admina i proxował `/dashboard` do AirPlay, a ten odpowiadał 403. Dev serwer admina chodzi teraz na 7010 (`apps/admin/package.json` i `viteDevServerPort` w `medusa-config.ts`).
- **`i18next` musi być w zależnościach roota `marketplace/`.** Plugin Mercura do paneli robi `dedupe` dla `i18next`, czyli szuka go w roocie workspace'u. Bez tego `vite build` paneli się wywala.
- **Nie wystawiaj paneli w trybie Vite dev.** Vite blokuje obcy host (domena ngrok), a każde wejście ładuje setki modułów i zjada limit requestów. Dlatego backend odpalamy sam (`packages/api`), a nie przez `turbo`. Skrypt ostrzega, gdy na 7010 albo 7001 coś słucha.
- **Limity darmowego ngrok:** 20 000 requestów i 1 GB transferu na miesiąc. Bundle panelu to ok. 8 MB bez kompresji przy pierwszym wejściu, potem przeglądarka dostaje 304. Agenci z pollingiem co 2 s robią ok. 1800 requestów na godzinę każdy, a otwarta strona RFQ w storefroncie (polling co 1,5 s) ok. 2400. Nie zostawiajcie jej otwartej w tle przez tunel. Agentów puszczaj na laptopie z backendem (`localhost:9000`), a przez tunel tylko UI i ręczne testy. Zużycie widać na https://dashboard.ngrok.com/usage.
- **Bezpieczeństwo:** kto ma link, ten loguje się domyślnym hasłem jako admin. Wystarczy na hackathon z danymi demo. Po demo `--stop`.
- **Panele z buildu lokalnie:** dopóki działa tunel, `localhost:9000/dashboard` też woła adres ngrok. Po `--stop` build jest usuwany, a do pracy lokalnej wraca `cd marketplace && bun run dev`.

Plan B, gdy ngrok padnie albo skończy się limit: `cloudflared tunnel --url http://localhost:9000` (jest w Homebrew, bez konta i bez limitu requestów), potem build paneli z `MERCUR_BACKEND_URL` na nowy adres, tak jak w kroku 3.
