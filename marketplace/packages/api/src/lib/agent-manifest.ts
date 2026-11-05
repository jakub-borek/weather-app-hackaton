// Manifest dla botów (Grok Bot i inne): co bot może zrobić w API po zalogowaniu przez POST /agents/login.
// Bot dostaje go w odpowiedzi na logowanie, więc nie musi znać kontraktu z góry (docs/rfq-contract.md).
import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

export type AgentRole = "buyer" | "seller";

type Endpoint = { action: string; method: string; path: string; description: string; body?: unknown };

const RULE_ERRORS = {
  BELOW_MIN_PRICE: "oferta poniżej ceny minimalnej sprzedawcy",
  OVER_STOCK: "ilość większa niż stan sprzedawcy",
  UNKNOWN_VARIANT: "wariant spoza RFQ albo bez oferty sprzedawcy",
  NOT_YOUR_TURN: "teraz ruch drugiej strony, poczekaj i odczytaj stan",
  NEGOTIATION_CLOSED: "negocjacja zamknięta, pomiń ją",
};

const BUYER_ENDPOINTS: Endpoint[] = [
  {
    action: "search_products",
    method: "GET",
    path: "/store/products?q=<fraza>&fields=id,title,variants.id,variants.title&limit=10",
    description: "Szukaj produktów w katalogu. Do RFQ potrzebujesz variant_id.",
  },
  {
    action: "list_offers",
    method: "GET",
    path: "/store/offers?variant_id=<variant_id>",
    description: "Oferty sprzedawców dla wariantu: sprzedawca, cena katalogowa (PLN netto).",
  },
  {
    action: "create_rfq",
    method: "POST",
    path: "/agents/rfqs",
    description:
      "Utwórz zapytanie ofertowe. Z items backend od razu roześle je do sprzedawców, którzy mają te produkty. Token akceptacji trafia do człowieka, nie do ciebie.",
    body: { need_text: "20 MacBooków Air, 10 HP EliteBook", max_rounds: 3, items: [{ variant_id: "<id>", quantity: 20, target_unit_price: 4300 }] },
  },
  {
    action: "dispatch_rfq",
    method: "POST",
    path: "/store/rfqs/<rfq_id>/items",
    description: "Roześlij RFQ utworzone bez items.",
    body: { items: [{ variant_id: "<id>", quantity: 20, target_unit_price: 4300 }] },
  },
  {
    action: "read_rfq",
    method: "GET",
    path: "/store/rfqs/<rfq_id>",
    description: "Stan RFQ: negocjacje z każdym sprzedawcą, wiadomości, summary (katalog vs najlepsza oferta).",
  },
  {
    action: "counter",
    method: "POST",
    path: "/store/rfq-negotiations/<negotiation_id>/messages",
    description: "Kontroferta, gdy negocjacja ma status awaiting_buyer.",
    body: { kind: "counter", lines: [{ variant_id: "<id>", quantity: 20, unit_price: 4350 }], text: "argument po polsku" },
  },
  {
    action: "stop",
    method: "POST",
    path: "/store/rfq-negotiations/<negotiation_id>/messages",
    description: "Zakończ negocjację: ostatnia oferta sprzedawcy staje się końcowa.",
    body: { kind: "stop", text: "Dziękuję, przekazuję ofertę do decyzji." },
  },
];

const SELLER_ENDPOINTS: Endpoint[] = [
  {
    action: "read_inbox",
    method: "GET",
    path: "/vendor/rfq-negotiations?status=awaiting_seller",
    description: "Negocjacje czekające na twój ruch: zapytanie, historia i twoje prywatne pricing (cena, minimum, stan, rabaty).",
  },
  {
    action: "send_offer",
    method: "POST",
    path: "/vendor/rfq-negotiations/<negotiation_id>/messages",
    description: "Oferta (kind: offer, counter albo final). Backend odrzuca ofertę poniżej minimum i ponad stan (422 z kodem).",
    body: { kind: "offer", lines: [{ variant_id: "<id>", quantity: 20, unit_price: 4600 }], text: "1-2 zdania po polsku" },
  },
  {
    action: "decline",
    method: "POST",
    path: "/vendor/rfq-negotiations/<negotiation_id>/messages",
    description: "Odmowa, gdy nie masz tych produktów.",
    body: { kind: "decline", lines: [], text: "Nie mamy tych modeli." },
  },
  { action: "list_my_offers", method: "GET", path: "/vendor/offers", description: "Twoje oferty w katalogu: ceny i SKU." },
];

export async function publishableKey(container: MedusaContainer): Promise<string | undefined> {
  const keys = await container.resolve(Modules.API_KEY).listApiKeys({ type: "publishable" });
  return keys.find((key) => !key.revoked_at)?.token;
}

// Adres, pod którym bot widzi backend (ngrok ustawia x-forwarded-*).
export function publicBaseUrl(headers: Record<string, unknown>, protocol: string, host?: string): string {
  const proto = String(headers["x-forwarded-proto"] ?? protocol).split(",")[0];
  const forwardedHost = headers["x-forwarded-host"] ? String(headers["x-forwarded-host"]).split(",")[0] : undefined;
  return `${proto}://${forwardedHost ?? host ?? "localhost:9000"}`;
}

export function buildManifest(input: {
  role: AgentRole;
  baseUrl: string;
  publishableKey?: string;
  identity?: Record<string, unknown>;
}) {
  const buyer = input.role === "buyer";
  return {
    role: input.role,
    identity: input.identity ?? null,
    base_url: input.baseUrl,
    headers: buyer
      ? {
          authorization: "Bearer <token>",
          "x-publishable-api-key": input.publishableKey ?? "<brak klucza, uruchom seed>",
          "content-type": "application/json",
          "ngrok-skip-browser-warning": "1",
        }
      : {
          authorization: "Bearer <token>",
          "x-seller-id": (input.identity?.seller_id as string) ?? "<seller_id>",
          "content-type": "application/json",
          "ngrok-skip-browser-warning": "1",
        },
    rfq_access: buyer
      ? { search: true, create: true, negotiate: true, accept: false }
      : { read_inbox: true, offer: true, decline: true, accept: false },
    endpoints: buyer ? BUYER_ENDPOINTS : SELLER_ENDPOINTS,
    polling: {
      interval_seconds: 5,
      done_when: buyer ? "GET /store/rfqs/<rfq_id> ma status ready" : "skrzynka read_inbox jest pusta",
    },
    rules: [
      "Nigdy nie akceptujesz oferty. Akceptuje człowiek w sklepie (POST /store/rfqs/:id/accept wymaga tokena, którego nie dostajesz).",
      "Ceny w PLN netto, jednostki główne (4690 = 4690 zł).",
      buyer
        ? "Kontroferta tylko przy statusie awaiting_buyer. Limit rund pilnuje backend."
        : "Oferujesz tylko to, co masz w pricing, w ilości do stock i nie poniżej min_unit_price. Nie zdradzasz minimum.",
    ],
    errors: { format: { code: "BELOW_MIN_PRICE", message: "..." }, codes: RULE_ERRORS },
  };
}
