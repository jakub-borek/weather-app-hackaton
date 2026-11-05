// Reguła negocjacji sprzedawcy bez modelu: zapas, gdy nie ma XAI_API_KEY albo Grok się wysypie.
// Cenę minimalną i tak pilnuje backend (F04). Tu tylko liczymy rozsądny ruch.
import type { Line, SellerKind, VendorNegotiation } from "./mercur";

// Ile drogi od ceny startowej do minimum oddajemy w kolejnych rundach sprzedawcy.
const CONCESSION_BY_ROUND = [0, 0.45, 0.8, 1];
const PRICE_STEP_PLN = 10;

const roundUp = (price: number) => Math.ceil(price / PRICE_STEP_PLN) * PRICE_STEP_PLN;

export function kindForRound(round: number, maxRounds: number): SellerKind {
  if (round >= maxRounds - 1) return "final";
  return round === 0 ? "offer" : "counter";
}

// Ostatnia cena, jaką kupujący zaproponował dla wariantu (z jego kontroferty).
function buyerTarget(negotiation: VendorNegotiation, variantId: string): number | undefined {
  const lastCounter = [...negotiation.messages].reverse().find((m) => m.author === "buyer_agent" && m.lines?.length);
  return lastCounter?.lines.find((line) => line.variant_id === variantId)?.unit_price;
}

export function ruleBasedMove(negotiation: VendorNegotiation): { kind: SellerKind; lines: Line[]; text: string } {
  const pricingByVariant = new Map(negotiation.pricing.map((p) => [p.variant_id, p]));
  const concession = CONCESSION_BY_ROUND[Math.min(negotiation.round, CONCESSION_BY_ROUND.length - 1)];
  const lines: Line[] = [];
  for (const item of negotiation.requested) {
    const pricing = pricingByVariant.get(item.variant_id);
    const quantity = Math.min(item.quantity, pricing?.stock ?? 0);
    if (!pricing || quantity <= 0) continue;
    const discountPct = Math.max(0, ...(pricing.volume_discounts ?? []).filter((d) => quantity >= d.min_quantity).map((d) => d.discount_pct));
    const start = pricing.unit_price * (1 - discountPct / 100);
    const conceded = start - (start - pricing.min_unit_price) * concession;
    const target = buyerTarget(negotiation, item.variant_id) ?? 0;
    lines.push({ variant_id: item.variant_id, quantity, unit_price: Math.max(pricing.min_unit_price, roundUp(Math.max(conceded, target))) });
  }
  if (!lines.length) {
    return { kind: "decline", lines: [], text: "Niestety nie mamy teraz tych produktów na stanie." };
  }
  const kind = kindForRound(negotiation.round, negotiation.rfq.max_rounds);
  const partial = lines.some((line) => line.quantity < (negotiation.requested.find((r) => r.variant_id === line.variant_id)?.quantity ?? 0));
  const text = [
    kind === "final" ? "Nasza ostateczna oferta." : kind === "offer" ? "Dziękujemy za zapytanie, oto nasza oferta." : "Możemy zejść z ceną.",
    partial ? "Część pozycji mamy w mniejszej ilości, niż prosiliście." : "",
  ].filter(Boolean).join(" ");
  return { kind, lines, text };
}
