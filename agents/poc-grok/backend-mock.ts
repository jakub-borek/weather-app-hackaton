// Mock backendu RFQ według docs/rfq-contract.md (F00): stany negocjacji i guardrails z F04.
// Zastępuje moduł RFQ (F03), dopóki go nie ma. Ceny, stany i minima bierze z prawdziwego seeda.
import {
  DEMO_OFFERS,
  DEMO_SELLERS,
  minPriceFor,
  sellerHandle,
  type VolumeDiscount,
} from "../../marketplace/packages/api/src/scripts/seed-data.ts";

export type NegotiationStatus = "awaiting_seller" | "awaiting_buyer" | "final" | "declined";
export type Author = "buyer_agent" | "seller_agent" | "system";

export interface Line {
  variant_id: string;
  quantity: number;
  unit_price: number;
}

export interface Message {
  author: Author;
  kind: string;
  lines: Line[];
  text: string;
  round: number;
}

export interface RequestedItem {
  variant_id: string;
  product_title: string;
  quantity: number;
  list_unit_price: number;
}

export interface Pricing {
  variant_id: string;
  unit_price: number;
  min_unit_price: number;
  stock: number;
  volume_discounts: VolumeDiscount[];
}

export interface Seller {
  id: string;
  name: string;
  style: string;
}

export interface Negotiation {
  id: string;
  seller: Seller;
  status: NegotiationStatus;
  round: number;
  max_rounds: number;
  requested: RequestedItem[];
  pricing: Pricing[];
  messages: Message[];
}

// To, co widzi kupujący (store API): bez prywatnego cennika sprzedawcy.
export type BuyerView = Omit<Negotiation, "pricing">;

export interface MoveError {
  code: string;
  message: string;
}

export interface Move {
  kind: string;
  lines: Line[];
  text: string;
}

export type MoveResult = { ok: true; negotiation: Negotiation } | { ok: false; error: MoveError };

export const NEED_TEXT = "20 MacBooków, 30 Lenovo, 10 HP";

// Krok 2 kontraktu (agent kupującego mapuje need_text na warianty) jest w PoC na sztywno.
const RFQ_ITEMS = [
  { variant_id: "variant_mba", product_title: "Apple MacBook Air 13 M4 16 GB / 512 GB", quantity: 20 },
  { variant_id: "variant_t14", product_title: "Lenovo ThinkPad T14 Gen 5 16 GB / 512 GB", quantity: 30 },
  { variant_id: "variant_hp840", product_title: "HP EliteBook 840 G11 16 GB / 512 GB", quantity: 10 },
];

const CLOSED: NegotiationStatus[] = ["final", "declined"];

export function createDemoNegotiations(maxRounds: number, onlySellers: string[] = []): Negotiation[] {
  return DEMO_SELLERS.map((config) => ({ config, handle: sellerHandle(config) }))
    .filter(({ handle }) => onlySellers.length === 0 || onlySellers.includes(handle))
    .map(({ config, handle }): Negotiation => {
      const matches = RFQ_ITEMS.flatMap((item) => {
        const offer = DEMO_OFFERS[item.product_title]?.find((candidate) => candidate.seller === handle);
        return offer ? [{ item, offer }] : [];
      });
      return {
        id: `rfqneg_${handle}`,
        seller: { id: `sel_${handle}`, name: config.name, style: config.negotiation_style },
        status: "awaiting_seller",
        round: 0,
        max_rounds: maxRounds,
        requested: matches.map(({ item, offer }) => ({ ...item, list_unit_price: offer.price })),
        pricing: matches.map(({ item, offer }) => ({
          variant_id: item.variant_id,
          unit_price: offer.price,
          min_unit_price: minPriceFor(handle, item.product_title, offer.price),
          stock: offer.stock,
          volume_discounts: offer.volume_discounts,
        })),
        messages: [],
      };
    })
    .filter((negotiation) => negotiation.requested.length > 0);
}

const fail = (code: string, message: string): MoveResult => ({ ok: false, error: { code, message } });

function turnError(negotiation: Negotiation, expected: NegotiationStatus): MoveResult | null {
  if (CLOSED.includes(negotiation.status)) return fail("NEGOTIATION_CLOSED", `Negocjacja ma status ${negotiation.status}`);
  if (negotiation.status !== expected) return fail("NOT_YOUR_TURN", `Teraz ruch ma druga strona (${negotiation.status})`);
  return null;
}

// Guardrails F04: w kodzie, nie w prompcie. Komunikat nie zdradza ceny minimalnej.
function sellerLinesError(negotiation: Negotiation, lines: Line[]): MoveResult | null {
  if (lines.length === 0) return fail("UNKNOWN_VARIANT", "Oferta bez pozycji. Podaj lines albo wyślij decline.");
  for (const line of lines) {
    const pricing = negotiation.pricing.find((candidate) => candidate.variant_id === line.variant_id);
    if (!pricing) return fail("UNKNOWN_VARIANT", `Wariant ${line.variant_id} nie należy do tej negocjacji`);
    if (line.quantity < 1 || line.quantity > pricing.stock) {
      return fail("OVER_STOCK", `Ilość ${line.quantity} poza dostępnym stanem dla ${line.variant_id}`);
    }
    if (line.unit_price < pricing.min_unit_price) {
      return fail("BELOW_MIN_PRICE", `Cena ${line.unit_price} < minimum dla ${line.variant_id}`);
    }
  }
  return null;
}

export class MockRfqBackend {
  private negotiations: ReadonlyMap<string, Negotiation>;

  constructor(initial: Negotiation[]) {
    this.negotiations = new Map(initial.map((negotiation) => [negotiation.id, negotiation]));
  }

  list(): Negotiation[] {
    return [...this.negotiations.values()];
  }

  get(id: string): Negotiation {
    const negotiation = this.negotiations.get(id);
    if (!negotiation) throw new Error(`Brak negocjacji ${id}`);
    return negotiation;
  }

  allClosed(): boolean {
    return this.list().every((negotiation) => CLOSED.includes(negotiation.status));
  }

  sellerMove(id: string, move: Move): MoveResult {
    const negotiation = this.get(id);
    const blocked = turnError(negotiation, "awaiting_seller") ?? (move.kind === "decline" ? null : sellerLinesError(negotiation, move.lines));
    if (blocked) return blocked;
    const round = negotiation.round + 1;
    // Kontrakt: wiadomość w ostatniej rundzie backend zapisuje jako final.
    const kind = move.kind !== "decline" && round >= negotiation.max_rounds ? "final" : move.kind;
    const status: NegotiationStatus = kind === "decline" ? "declined" : kind === "final" ? "final" : "awaiting_buyer";
    const message: Message = { author: "seller_agent", kind, lines: kind === "decline" ? [] : move.lines, text: move.text, round };
    return { ok: true, negotiation: this.save({ ...negotiation, round, status, messages: [...negotiation.messages, message] }) };
  }

  buyerMove(id: string, move: Move): MoveResult {
    const negotiation = this.get(id);
    const blocked = turnError(negotiation, "awaiting_buyer");
    if (blocked) return blocked;
    const unknown = move.lines.find((line) => !negotiation.requested.some((item) => item.variant_id === line.variant_id));
    if (move.kind === "counter" && unknown) return fail("UNKNOWN_VARIANT", `Wariant ${unknown.variant_id} nie należy do tej negocjacji`);
    // stop: ostatnia oferta sprzedawcy staje się końcowa.
    const status: NegotiationStatus = move.kind === "stop" ? "final" : "awaiting_seller";
    const message: Message = { author: "buyer_agent", kind: move.kind, lines: move.lines, text: move.text, round: negotiation.round };
    return { ok: true, negotiation: this.save({ ...negotiation, status, messages: [...negotiation.messages, message] }) };
  }

  forceClose(id: string, status: NegotiationStatus, text: string): Negotiation {
    const negotiation = this.get(id);
    const note: Message = { author: "system", kind: "note", lines: [], text, round: negotiation.round };
    return this.save({ ...negotiation, status, messages: [...negotiation.messages, note] });
  }

  private save(negotiation: Negotiation): Negotiation {
    this.negotiations = new Map([...this.negotiations, [negotiation.id, negotiation]]);
    return negotiation;
  }
}

export function buyerView(negotiation: Negotiation): BuyerView {
  const { pricing: _private, ...visible } = negotiation;
  return visible;
}

export function sellerOffers(negotiation: Pick<Negotiation, "messages">): Message[] {
  return negotiation.messages.filter((message) => message.author === "seller_agent" && message.lines.length > 0);
}

export function latestSellerOffer(negotiation: Pick<Negotiation, "messages">): Message | undefined {
  return sellerOffers(negotiation).at(-1);
}

export function latestBuyerCounter(negotiation: Pick<Negotiation, "messages">): Message | undefined {
  return negotiation.messages.filter((message) => message.author === "buyer_agent" && message.kind === "counter").at(-1);
}

export function linesTotal(lines: Line[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
}
