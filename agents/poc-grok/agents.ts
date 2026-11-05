// Agenci PoC: prompty, parser decyzji modelu i deterministyczna strategia dla runtime'u "mock".
// Agent jest bezstanowy: każdy ruch dostaje pełny stan negocjacji, tak jak z polling API z kontraktu.
import {
  NEED_TEXT,
  buyerView,
  latestBuyerCounter,
  latestSellerOffer,
  sellerOffers,
  type BuyerView,
  type Line,
  type MoveError,
  type Negotiation,
  type Pricing,
  type Seller,
} from "./backend-mock.ts";
import type { AskInput } from "./llm.ts";

export const SELLER_KINDS = ["offer", "counter", "final", "decline"] as const;
export const BUYER_KINDS = ["counter", "stop"] as const;

export interface CompetitorOffer {
  seller: string;
  lines: Line[];
}

export interface SellerContext {
  kind: "seller";
  needText: string;
  negotiation: Negotiation;
  lastError: MoveError | null;
}

export interface BuyerContext {
  kind: "buyer";
  needText: string;
  negotiation: BuyerView;
  competitors: CompetitorOffer[];
  lastError: MoveError | null;
}

export type AgentContext = SellerContext | BuyerContext;

// reasoning to "myśl" agenta: idzie tylko do logu, druga strona jej nie widzi.
export interface Decision {
  reasoning: string;
  kind: string;
  lines: Line[];
  text: string;
}

export type ParseResult = { ok: true; decision: Decision } | { ok: false; error: MoveError };

const STYLE_HINTS: Record<string, string> = {
  twardy: "trzymasz marżę, ustępujesz małymi krokami",
  elastyczny: "chcesz domknąć sprzedaż, chętnie schodzisz z ceny",
  wolumenowy: "ustępujesz głównie za dużą ilość, rabaty wolumenowe dajesz od razu",
};

const JSON_FORMAT = (kinds: readonly string[]): string =>
  `{"reasoning":"1-3 zdania: dlaczego taki ruch (tylko do logu, druga strona tego nie widzi)","kind":"${kinds.join("|")}","lines":[{"variant_id":"...","quantity":1,"unit_price":1}],"text":"krótka wiadomość do drugiej strony po polsku"}`;

function sellerSystem(seller: Seller): string {
  return [
    `Jesteś agentem sprzedaży sklepu ${seller.name} na marketplace B2B z elektroniką. Negocjujesz zapytanie ofertowe (RFQ) z agentem kupującego.`,
    `Twój styl: ${seller.style} (${STYLE_HINTS[seller.style] ?? "rozsądny"}).`,
    "Zasady:",
    "- Oferujesz tylko warianty z twojego cennika i najwyżej tyle sztuk, ile masz na stanie (stock).",
    "- Nigdy nie schodzisz poniżej min_unit_price. Backend i tak odrzuci taką ofertę.",
    "- Nie zdradzasz kupującemu ceny minimalnej ani rabatów, których nie dajesz.",
    "- Ustępujesz stopniowo. Liczba rund jest ograniczona, a ostatnia runda to oferta końcowa.",
    "- Ceny w PLN netto za sztukę, pełne złote.",
    "Nie używaj żadnych narzędzi ani plików. Odpowiadasz WYŁĄCZNIE jednym obiektem JSON, bez markdownu:",
    JSON_FORMAT(SELLER_KINDS),
  ].join("\n");
}

function buyerSystem(): string {
  return [
    "Jesteś agentem zakupowym firmy na marketplace B2B z elektroniką. Negocjujesz w imieniu człowieka, który na końcu sam akceptuje ofertę. Ty niczego nie akceptujesz.",
    "Cel: najniższa łączna cena za potrzebne ilości przy realnej dostępności.",
    "Widzisz oferty innych sprzedawców i możesz się na nie powoływać, ale tylko z prawdziwymi cenami, bez zmyślania.",
    "Gdy oferta jest dobra albo sprzedawca przestał ustępować, odpowiedz kind \"stop\": jego ostatnia oferta staje się końcowa.",
    "Dla \"counter\" lines to twoja propozycja cen dla pozycji z ostatniej oferty sprzedawcy. Dla \"stop\" lines może być puste.",
    "Nie używaj żadnych narzędzi ani plików. Odpowiadasz WYŁĄCZNIE jednym obiektem JSON, bez markdownu:",
    JSON_FORMAT(BUYER_KINDS),
  ].join("\n");
}

const history = (negotiation: Pick<Negotiation, "messages">) =>
  negotiation.messages.map(({ author, kind, lines, text }) => ({ author, kind, lines, text }));

const errorHint = (error: MoveError | null): string[] =>
  error ? [`Twój poprzedni ruch został odrzucony: ${error.code}: ${error.message}. Popraw go.`] : [];

function sellerPrompt(context: SellerContext): string {
  const { negotiation } = context;
  const round = negotiation.round + 1;
  const state = {
    zapytanie_kupujacego: context.needText,
    czego_chce_od_ciebie: negotiation.requested.map(({ variant_id, product_title, quantity }) => ({ variant_id, product_title, quantity })),
    twoj_cennik_prywatny: negotiation.pricing,
    historia: history(negotiation),
  };
  return [
    `Twój ruch: runda ${round} z ${negotiation.max_rounds}${round >= negotiation.max_rounds ? " (ostatnia, to będzie oferta końcowa)" : ""}.`,
    `Stan negocjacji:\n${JSON.stringify(state, null, 2)}`,
    ...errorHint(context.lastError),
    "Odpowiedz jednym obiektem JSON w formacie z instrukcji.",
  ].join("\n\n");
}

function buyerPrompt(context: BuyerContext): string {
  const { negotiation } = context;
  const state = {
    zapytanie: context.needText,
    sprzedawca: negotiation.seller.name,
    rundy_sprzedawcy: `${negotiation.round} z ${negotiation.max_rounds}`,
    pozycje_i_ceny_katalogowe: negotiation.requested,
    historia: history(negotiation),
    oferty_konkurencji: context.competitors,
  };
  return [
    `Twój ruch wobec sprzedawcy ${negotiation.seller.name}.`,
    `Stan negocjacji:\n${JSON.stringify(state, null, 2)}`,
    ...errorHint(context.lastError),
    "Odpowiedz jednym obiektem JSON w formacie z instrukcji.",
  ].join("\n\n");
}

export function sellerInput(negotiation: Negotiation, lastError: MoveError | null): AskInput<AgentContext> {
  const context: SellerContext = { kind: "seller", needText: NEED_TEXT, negotiation, lastError };
  return { role: "seller", system: sellerSystem(negotiation.seller), prompt: sellerPrompt(context), context };
}

export function buyerInput(negotiation: Negotiation, all: Negotiation[], lastError: MoveError | null): AskInput<AgentContext> {
  const competitors = all
    .filter((other) => other.id !== negotiation.id)
    .flatMap((other) => {
      const offer = latestSellerOffer(other);
      return offer ? [{ seller: other.seller.name, lines: offer.lines }] : [];
    });
  const context: BuyerContext = { kind: "buyer", needText: NEED_TEXT, negotiation: buyerView(negotiation), competitors, lastError };
  return { role: "buyer", system: buyerSystem(), prompt: buyerPrompt(context), context };
}

function toLine(value: unknown): Line | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const line = { variant_id: String(raw.variant_id ?? ""), quantity: Number(raw.quantity), unit_price: Number(raw.unit_price) };
  const valid = line.variant_id !== "" && Number.isFinite(line.quantity) && Number.isFinite(line.unit_price);
  return valid ? line : null;
}

// Model bywa gadatliwy albo owija JSON w markdown: bierzemy od pierwszej { do ostatniej }.
export function parseDecision(raw: string, allowedKinds: readonly string[]): ParseResult {
  const bad = (message: string): ParseResult => ({ ok: false, error: { code: "BAD_RESPONSE", message } });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return bad(`Odpowiedź bez obiektu JSON: ${raw.slice(0, 120)}`);
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return bad("Niepoprawny JSON w odpowiedzi");
  }
  const record = (data ?? {}) as Record<string, unknown>;
  const kind = String(record.kind ?? "");
  if (!allowedKinds.includes(kind)) return bad(`kind musi być jednym z: ${allowedKinds.join(", ")}`);
  const lines = (Array.isArray(record.lines) ? record.lines : []).map(toLine);
  if (lines.some((line) => line === null)) return bad("Każda pozycja w lines potrzebuje variant_id, quantity i unit_price");
  return {
    ok: true,
    decision: { reasoning: String(record.reasoning ?? ""), kind, lines: lines as Line[], text: String(record.text ?? "") },
  };
}

// ---------- Strategia mocka (bez modelu) ----------

const round10 = (value: number): number => Math.round(value / 10) * 10;

// Jaką część różnicy do kontroferty sprzedawca oddaje w rundzie. Elastyczny oddaje całość
// i celowo wpada w BELOW_MIN_PRICE, żeby było widać guardrail i poprawkę agenta.
const CONCESSION: Record<string, number> = { twardy: 0.3, wolumenowy: 0.5, elastyczny: 1 };

function volumePrice(pricing: Pricing, quantity: number): number {
  const discounts = pricing.volume_discounts.filter((tier) => quantity >= tier.min_quantity).map((tier) => tier.discount_pct);
  return round10(pricing.unit_price * (1 - Math.max(0, ...discounts) / 100));
}

function mockSeller(context: SellerContext): Decision {
  const { negotiation, lastError } = context;
  const ownOffer = latestSellerOffer(negotiation);
  const counter = latestBuyerCounter(negotiation);
  const share = CONCESSION[negotiation.seller.style] ?? 0.5;
  const lines = negotiation.requested.flatMap((item) => {
    const pricing = negotiation.pricing.find((candidate) => candidate.variant_id === item.variant_id);
    if (!pricing) return [];
    const quantity = Math.min(item.quantity, pricing.stock);
    const current = ownOffer?.lines.find((line) => line.variant_id === item.variant_id)?.unit_price ?? volumePrice(pricing, quantity);
    const wanted = counter?.lines.find((line) => line.variant_id === item.variant_id)?.unit_price;
    const proposal = wanted === undefined ? current : Math.min(current, round10(current - (current - wanted) * share));
    const unit_price = lastError?.code === "BELOW_MIN_PRICE" ? Math.max(proposal, pricing.min_unit_price) : proposal;
    return [{ variant_id: item.variant_id, quantity, unit_price }];
  });
  const isLast = negotiation.round + 1 >= negotiation.max_rounds;
  const kind = negotiation.round === 0 ? "offer" : isLast ? "final" : "counter";
  const reasoning = !counter
    ? `Styl ${negotiation.seller.style}: otwieram cennikiem z rabatem wolumenowym, ilość ograniczam do stanu.`
    : `Styl ${negotiation.seller.style}: oddaję ${Math.round(share * 100)}% różnicy do kontroferty${lastError ? ", po odrzuceniu podnoszę do minimum" : ""}.`;
  const summary = lines.map((line) => `${line.quantity} szt. po ${line.unit_price} zł`).join(", ");
  return { reasoning, kind, lines, text: `${isLast ? "Ostateczna propozycja" : "Proponujemy"}: ${summary}.` };
}

function bestRivalPrice(competitors: CompetitorOffer[], variantId: string): number | undefined {
  const prices = competitors.flatMap((offer) => offer.lines.filter((line) => line.variant_id === variantId).map((line) => line.unit_price));
  return prices.length > 0 ? Math.min(...prices) : undefined;
}

function mockBuyer(context: BuyerContext): Decision {
  const offers = sellerOffers(context.negotiation);
  const latest = offers.at(-1);
  const previous = offers.at(-2);
  if (!latest) return { reasoning: "Brak oferty, nie ma czego negocjować.", kind: "stop", lines: [], text: "Dziękujemy." };
  const drop = previous ? 1 - latest.lines.reduce((s, l) => s + l.unit_price, 0) / previous.lines.reduce((s, l) => s + l.unit_price, 0) : 1;
  if (drop < 0.01) {
    return { reasoning: "Sprzedawca ustąpił mniej niż 1%, kolejna runda nic nie da.", kind: "stop", lines: [], text: "Dziękujemy, bierzemy tę ofertę pod uwagę jako końcową." };
  }
  const lines = latest.lines.map((line) => {
    const rival = bestRivalPrice(context.competitors, line.variant_id);
    return { ...line, unit_price: round10(Math.min(line.unit_price * 0.94, rival !== undefined ? rival - 10 : Infinity)) };
  });
  const reasoning = lines
    .map((line, index) => `${line.variant_id}: oferta ${latest.lines[index]?.unit_price}, konkurencja ${bestRivalPrice(context.competitors, line.variant_id) ?? "brak"}, proponuję ${line.unit_price}`)
    .join("; ");
  return { reasoning, kind: "counter", lines, text: `Konkurencja daje lepiej. Proponujemy: ${lines.map((l) => `${l.unit_price} zł`).join(", ")}.` };
}

export function mockDecide(input: AskInput<AgentContext>): Decision {
  return input.context.kind === "seller" ? mockSeller(input.context) : mockBuyer(input.context);
}
