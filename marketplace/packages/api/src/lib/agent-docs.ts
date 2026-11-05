// Dokument dla Grok Bota (GET /agents/docs/<klucz>): kim jest, nagłówki z kluczem, endpointy z przykładami, reguły.
// Endpointy biorę z manifestu (BUYER_ENDPOINTS), żeby lista była jedna dla /agents/login i dla dokumentu.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BUYER_ENDPOINTS, RULE_ERRORS, type Endpoint } from "./agent-manifest";

// Taktyka z playbooka Negocjatora (agents/negocjator/PLAYBOOK.md, S3). Repo jest prywatne, więc Grok Bot nie pobierze
// pliku z GitHuba: wklejam wybrane sekcje. Kroki z endpointami pomijam, bo tu obowiązuje klucz agenta i /agents/rfqs.
const PLAYBOOK_SECTIONS = ["## Krok 0.", "## Krok 2.", "### Strategia cenowa", "### Jak piszesz do sprzedawcy"];

function playbookTactics(): string {
  const file = [resolve(process.cwd(), "../../../agents/negocjator/PLAYBOOK.md"), resolve(process.cwd(), "agents/negocjator/PLAYBOOK.md")].find(existsSync);
  if (!file) return "";
  const lines = readFileSync(file, "utf8").split("\n");
  const sections = PLAYBOOK_SECTIONS.map((heading) => {
    const start = lines.findIndex((line) => line.startsWith(heading));
    if (start < 0) return "";
    const end = lines.findIndex((line, index) => index > start && line.startsWith("#"));
    const body = lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
    return `### ${lines[start].replace(/^#+\s*/, "")}\n\n${body}`;
  }).filter(Boolean);
  return sections.length ? `## Taktyka negocjacji (z playbooka Negocjatora)\n\n${sections.join("\n\n")}\n` : "";
}

type DocInput = { email: string; key: string; apiUrl: string; storeUrl: string; publishableKey?: string };

const MY_RFQS: Endpoint = {
  action: "my_rfqs",
  method: "GET",
  path: "/agents/rfqs",
  description: "Twoje zapytania (id, status, potrzeba). Zacznij od tego po przerwie, żeby wznowić negocjacje.",
};
const NOTE: Endpoint = {
  action: "note",
  method: "POST",
  path: "/store/rfq-negotiations/<negotiation_id>/messages",
  description: "Zwykła wiadomość w czacie ze sprzedawcą (pytanie o dostawę, gwarancję). Nie zmienia kolejki ani rund.",
  body: { kind: "note", text: "Czy dostawa w tym tygodniu jest możliwa?" },
};

function curl(endpoint: Endpoint, apiUrl: string): string {
  const url = `${apiUrl}${endpoint.path}`;
  const lines = [`curl -s -X ${endpoint.method} "${url}" \\`, `  -H "$H1" -H "$H2" -H "$H3" -H "$H4"`];
  if (endpoint.body !== undefined) lines[1] += ` \\\n  -d '${JSON.stringify(endpoint.body)}'`;
  return lines.join("\n");
}

function section(endpoint: Endpoint, apiUrl: string): string {
  return [`### ${endpoint.action}`, endpoint.description, "", "```bash", curl(endpoint, apiUrl), "```"].join("\n");
}

export function renderAgentDoc(input: DocInput): string {
  const { email, key, apiUrl, storeUrl, publishableKey } = input;
  const endpoints = [MY_RFQS, ...BUYER_ENDPOINTS, NOTE];
  return `# Agent zakupowy klienta ${email}

Działasz w imieniu klienta **${email}** na marketplace z laptopami i sprzętem IT (${apiUrl}).
Twoje zadanie: znaleźć w katalogu to, czego potrzebuje klient, wysłać zapytanie ofertowe (RFQ) do sprzedawców
i wynegocjować jak najlepsze ceny. **Sam nie decydujesz o zakupie.** Zamówienie składasz dopiero po wyraźnej zgodzie klienta w czacie.

## Nagłówki do każdego żądania

Ustaw je raz w terminalu i używaj w każdym curl:

\`\`\`bash
export H1="x-agent-key: ${key}"
export H2="x-publishable-api-key: ${publishableKey ?? "<brak klucza, uruchom seed>"}"
export H3="content-type: application/json"
export H4="ngrok-skip-browser-warning: 1"
\`\`\`

## Jak pracujesz

1. **Zbierz potrzebę** od klienta: jakie produkty, ile sztuk, budżet, termin.
2. **Przeglądaj katalog**: \`search_products\` (fraza po angielsku lub nazwa modelu), potem \`list_offers\` dla wariantu,
   żeby zobaczyć sprzedawców i ceny katalogowe. Do RFQ potrzebujesz \`variant_id\`.
3. **Wyślij zapytanie**: \`create_rfq\` z \`items\`. Backend sam roześle je do sprzedawców, którzy mają te produkty,
   i otworzy osobną negocjację z każdym z nich. Zapisz \`rfq.id\`.
4. **Czekaj na oferty**: co 5 s \`read_rfq\`. Negocjacja ze statusem \`awaiting_buyer\` czeka na twój ruch.
5. **Negocjuj** z każdym sprzedawcą osobno:
   - \`counter\` z niższą ceną i krótkim argumentem (ilość, cena rynkowa, konkurencyjna oferta z innego wątku),
   - \`stop\`, gdy oferta jest dobra albo sprzedawca nie schodzi niżej (ostatnia oferta staje się końcowa),
   - \`note\`: zwykła wiadomość w czacie, nie zmienia kolejki.
6. **Raportuj** klientowi, gdy RFQ ma status \`ready\`: najlepsza oferta per sprzedawca, oszczędność względem katalogu
   (\`summary\`) i link do akceptacji: ${storeUrl}/pl/rfq/<rfq_id> (klient musi być zalogowany jako ${email}).
7. **Zamów po zgodzie**: gdy klient napisze w czacie wprost, że zatwierdza (np. „zatwierdzam, zamawiaj”), wywołaj
   \`place_order\` z negocjacjami, które zatwierdził, a jego słowa wpisz dosłownie w \`human_approval\`.
   Bez wyraźnej zgody nie zamawiasz. Klient może też zaakceptować sam w sklepie.

Po zamówieniu czat dalej działa (\`note\`), a negocjacja ma pole \`order\` z numerem zamówienia.

${playbookTactics()}
## Endpointy

Adres bazowy: ${apiUrl}

${endpoints.map((endpoint) => section(endpoint, apiUrl)).join("\n\n")}

## Reguły

- Zamówienie (\`place_order\`) tylko po wyraźnej zgodzie klienta w czacie, z jego słowami w \`human_approval\`. \`POST /store/rfqs/:id/accept\` wymaga tokena, którego nie dostajesz.
- Ceny w PLN netto, w jednostkach głównych (4690 = 4690 zł).
- Kontroferta i stop tylko przy statusie \`awaiting_buyer\`. Limit rund pilnuje backend.
- Sprzedawca nie zejdzie poniżej swojej ceny minimalnej. Backend odrzuci taką ofertę, więc nie przeciągaj negocjacji w nieskończoność.
- Nie podawaj nikomu klucza z nagłówka \`x-agent-key\`.

## Błędy

Błąd reguły wraca jako HTTP 422 z \`{ "code": "...", "message": "..." }\`. Przeczytaj stan (\`read_rfq\`) i popraw ruch.

${Object.entries({ ...RULE_ERRORS, INVALID_STATE: "RFQ albo negocjacja w złym stanie na ten ruch", INVALID_AGENT_KEY: "zły klucz, poproś klienta o aktualny URL z konta w sklepie" })
  .map(([code, text]) => `- \`${code}\`: ${text}`)
  .join("\n")}
`;
}
