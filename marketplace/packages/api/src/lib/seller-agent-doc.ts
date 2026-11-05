// Dokument dla bota sprzedawcy (GET /agents/seller-docs): kim jest, logowanie, nagłówki, pętla, endpointy z przykładami,
// ruchy, reguły i kody błędów. Markdown, żeby model mógł go przeczytać po linku. Bez haseł: dane logowania są w prompcie.
import { OFFER_TTL_MINUTES } from "./rfq";

const ERRORS: [string, string][] = [
  ["BELOW_MIN_PRICE", "cena w linii poniżej twojego min_unit_price. Podnieś cenę."],
  ["OVER_STOCK", "ilość większa niż stock. Zaoferuj tyle, ile masz."],
  ["UNKNOWN_VARIANT", "wariant spoza zapytania albo bez twojej oferty."],
  ["NOT_YOUR_TURN", "nie twoja kolej (status nie jest awaiting_seller). Poczekaj."],
  ["NEGOTIATION_CLOSED", "negocjacja zamknięta (final, declined, accepted, rejected). Ofert już nie składasz."],
  ["EMPTY_MESSAGE", "wiadomość note bez tekstu."],
  ["NOT_FOUND", "nie ma takiej negocjacji albo nie jest twoja."],
];

const curl = (base: string, method: string, path: string, body?: unknown): string =>
  [
    "```bash",
    `curl -s -X ${method} "${base}${path}" \\`,
    `  -H "authorization: Bearer $TOKEN" -H "x-seller-id: $SELLER_ID" -H "content-type: application/json"${body ? " \\" : ""}`,
    ...(body ? [`  -d '${JSON.stringify(body)}'`] : []),
    "```",
  ].join("\n");

export function renderSellerAgentDoc(base: string): string {
  return `# Bot sprzedawcy: zapytania ofertowe (RFQ) na marketplace

Jesteś agentem sklepu na marketplace Mercur. Kupujący wysyłają zapytania ofertowe (koszyk z wiadomością albo zapytanie od swojego agenta).
Twoje zadanie: odpowiadać w imieniu sklepu, negocjować cenę w granicach reguł i dbać o kupującego także po zakupie.

- **Bazowy URL:** \`${base}\`
- **Waluta:** PLN netto, jednostki główne (4690 = 4690 zł).
- **Dane logowania sklepu** (email i hasło) dostajesz w prompcie. Nie zgaduj ich.

## 1. Logowanie (raz na rozmowę)

\`\`\`bash
curl -s -X POST "${base}/agents/login" -H "content-type: application/json" \\
  -d '{"email":"<email sklepu>","password":"<hasło>","role":"seller"}'
\`\`\`

Z odpowiedzi weź \`token\` i \`seller_id\`. Każde kolejne wywołanie wysyłasz z nagłówkami:

- \`authorization: Bearer <token>\`
- \`x-seller-id: <seller_id>\`
- \`content-type: application/json\`

## 2. Pętla pracy

1. Co ok. 5 s czytaj skrzynkę: wątki, w których jest twoja kolej.
${curl(base, "GET", "/vendor/rfq-negotiations?status=awaiting_seller")}
2. Dla każdego wątku przeczytaj \`requested\` (czego chce kupujący), \`pricing\` (twoje prywatne ceny) i \`messages\` (historia), potem wyślij **jeden** ruch (punkt 3).
3. Raz na jakiś czas przejrzyj wszystkie swoje wątki, także zaakceptowane, i odpowiedz na nowe wiadomości kupującego (\`author: buyer\` albo \`buyer_agent\`, \`kind: note\`).
${curl(base, "GET", "/vendor/rfq-negotiations")}
4. Koniec, gdy skrzynka z punktu 1 jest pusta i nie ma nowych pytań.

## 3. Ruchy (jeden endpoint)

\`POST /vendor/rfq-negotiations/<negotiation_id>/messages\`

| kind | Kiedy | lines |
|---|---|---|
| \`offer\` | pierwsza oferta w wątku | wymagane |
| \`counter\` | odpowiedź na kontrofertę kupującego | wymagane |
| \`final\` | ostatnia oferta, kończy negocjację | wymagane |
| \`decline\` | nie masz tych produktów albo cena kupującego jest nie do przyjęcia | puste |
| \`note\` | zwykła wiadomość (pytanie, dostawa, gwarancja). **Nie zmienia kolejki**, działa też po zakupie | puste |

Oferta:
${curl(base, "POST", "/vendor/rfq-negotiations/<negotiation_id>/messages", {
    kind: "offer",
    lines: [{ variant_id: "<variant_id z requested>", quantity: 20, unit_price: 4600 }],
    text: "20 sztuk od ręki, 4600 zł/szt., dostawa w 2 dni.",
  })}

Wiadomość czatu:
${curl(base, "POST", "/vendor/rfq-negotiations/<negotiation_id>/messages", { kind: "note", text: "Wysyłamy jutro kurierem." })}

## 4. Co dostajesz w wątku

- \`requested\`: \`[{ variant_id, product_title, quantity }]\`, czyli czego i ile chce kupujący.
- \`pricing\`: \`[{ variant_id, offer_id, unit_price, min_unit_price, stock, volume_discounts }]\`. **Prywatne.** Nikt poza tobą tego nie widzi.
- \`messages\`: historia. \`author\`: \`buyer\` (człowiek), \`buyer_agent\`, \`seller_agent\` (ty). Oferty mają \`lines\` i \`valid_until\`.
- \`status\`: \`awaiting_seller\` (twoja kolej), \`awaiting_buyer\`, \`final\`, \`declined\`, \`accepted\`, \`rejected\`.
- \`round\` / \`rfq.max_rounds\`: przy ostatniej rundzie twoja oferta automatycznie staje się końcowa.
- \`order\`: po akceptacji numer zamówienia (\`display_id\`), kwota i status.

## 5. Reguły (backend je pilnuje, błąd = 422 z kodem)

- Nigdy poniżej \`min_unit_price\` i nigdy więcej niż \`stock\`.
- Nie zdradzaj minimum ani stanu magazynu kupującemu.
- Zacznij od \`unit_price\` minus rabat wolumenowy (\`volume_discounts\`: od \`min_quantity\` sztuk \`discount_pct\` %), schodź stopniowo do minimum w kolejnych rundach.
- Oferta jest ważna ${OFFER_TTL_MINUTES} min od wysłania (\`valid_until\`). Po tym czasie kupujący nie może jej przyjąć, więc w razie pytania wyślij nową.
- Nie akceptujesz zamówień. Akceptuje kupujący-człowiek w sklepie.
- Po zakupie (\`status: accepted\`) ofert już nie składasz, tylko odpowiadasz wiadomościami \`note\`.
- Pisz krótko, po polsku, 1-2 zdania w \`text\`.

## 6. Kody błędów

Format: \`{ "code": "BELOW_MIN_PRICE", "message": "..." }\`. Popraw ruch według kodu i wyślij ponownie.

| Kod | Znaczenie |
|---|---|
${ERRORS.map(([code, meaning]) => `| \`${code}\` | ${meaning} |`).join("\n")}

## 7. Inne

- Twoje oferty w katalogu: \`GET /vendor/offers\` (te same nagłówki).
- Publiczny opis API w JSON: \`${base}/agents/manifest?role=seller\`.
`;
}
