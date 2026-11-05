// Wspólne elementy RFQ (F03/F04): typy, błędy reguł, prywatne ceny sprzedawcy i widoki odpowiedzi.
// Kontrakt: docs/rfq-contract.md. Store API nigdy nie dostaje ceny minimalnej ani accept_token.
import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { RFQ_MODULE } from "../modules/rfq";
import type RfqModuleService from "../modules/rfq/service";
import { DEMO_OFFERS, minPriceFor, type VolumeDiscount } from "../scripts/seed-data";

export type RfqItem = {
  variant_id: string;
  product_title: string;
  quantity: number;
  list_unit_price: number;
  target_unit_price?: number;
  // Ustawione, gdy RFQ powstało z koszyka: pozycja należy do tego sprzedawcy.
  seller_id?: string;
};
export type RfqLine = { variant_id: string; quantity: number; unit_price: number };
export type SellerPricing = {
  offer_id: string;
  variant_id: string;
  unit_price: number;
  min_unit_price: number;
  stock: number;
  volume_discounts: VolumeDiscount[];
};

export type RuleCode =
  | "BELOW_MIN_PRICE"
  | "OVER_STOCK"
  | "UNKNOWN_VARIANT"
  | "NOT_YOUR_TURN"
  | "NEGOTIATION_CLOSED"
  | "INVALID_ACCEPT_TOKEN"
  | "INVALID_STATE"
  | "OFFER_EXPIRED"
  | "EMPTY_MESSAGE"
  | "NOT_FOUND";

// Ważność oferty sprzedawcy: czas wysłania + TTL. Bez osobnej kolumny, bez migracji.
export const OFFER_TTL_MINUTES = Number(process.env.RFQ_OFFER_TTL_MINUTES ?? 30);
export const offerValidUntil = (createdAt: Date | string): Date =>
  new Date(new Date(createdAt).getTime() + OFFER_TTL_MINUTES * 60_000);

// Kod reguły jedzie w treści błędu, bo workflow gubi własne pola błędów. Trasa go odczytuje.
export const ruleError = (code: RuleCode, message: string): Error => new Error(`${code}: ${message}`);

// Workflow rzuca błąd kroku jako zwykły obiekt { message, ... }, nie jako Error.
const errorText = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return String(error);
};

export function parseRuleError(error: unknown): { status: number; code: string; message: string } {
  const text = errorText(error);
  const match = /^([A-Z_]+): ([\s\S]*)$/.exec(text);
  if (!match) {
    return { status: 500, code: "INTERNAL", message: text };
  }
  return { status: match[1] === "NOT_FOUND" ? 404 : 422, code: match[1], message: match[2] };
}

export const rfqService = (container: MedusaContainer): RfqModuleService =>
  container.resolve<RfqModuleService>(RFQ_MODULE);

export const asItems = (value: unknown): RfqItem[] => (Array.isArray(value) ? (value as RfqItem[]) : []);
export const asLines = (value: unknown): RfqLine[] => (Array.isArray(value) ? (value as RfqLine[]) : []);
export const toJson = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

type OfferRow = {
  id: string;
  variant_id: string;
  seller?: { email?: string };
  prices?: { amount: number; currency_code: string }[];
  inventory_item_link?: {
    inventory_item?: { location_levels?: { stocked_quantity: number; reserved_quantity: number }[] };
  }[];
};

const availableStock = (offer: OfferRow): number =>
  (offer.inventory_item_link ?? [])
    .flatMap((link) => link.inventory_item?.location_levels ?? [])
    .reduce((sum, level) => sum + Number(level.stocked_quantity ?? 0) - Number(level.reserved_quantity ?? 0), 0);

type PriceRule = { min_unit_price: number; volume_discounts: VolumeDiscount[] | null };

async function loadPriceRules(container: MedusaContainer, offerIds: string[]): Promise<Map<string, PriceRule>> {
  if (!offerIds.length) return new Map();
  const rules = await rfqService(container).listSellerPriceRules({ offer_id: offerIds }, { take: null });
  return new Map(
    rules.map((rule) => [
      rule.offer_id,
      {
        min_unit_price: Number(rule.min_unit_price),
        volume_discounts: Array.isArray(rule.volume_discounts) ? (rule.volume_discounts as VolumeDiscount[]) : null,
      },
    ])
  );
}

// Prywatne ceny sprzedawcy dla pozycji RFQ. Cena minimalna i rabaty z tabeli seller_price_rule.
export async function loadSellerPricing(
  container: MedusaContainer,
  sellerId: string,
  items: RfqItem[]
): Promise<Map<string, SellerPricing>> {
  if (!items.length) return new Map();
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "offer",
    fields: [
      "id",
      "variant_id",
      "seller.email",
      "prices.amount",
      "prices.currency_code",
      "inventory_item_link.inventory_item.location_levels.stocked_quantity",
      "inventory_item_link.inventory_item.location_levels.reserved_quantity",
    ],
    filters: { seller_id: sellerId, variant_id: items.map((item) => item.variant_id) },
  });
  const offers = data as OfferRow[];
  const rules = await loadPriceRules(container, offers.map((offer) => offer.id));
  const titleByVariant = new Map(items.map((item) => [item.variant_id, item.product_title]));
  return new Map(
    offers.map((offer) => {
      const handle = (offer.seller?.email ?? "").split("@")[0];
      const title = titleByVariant.get(offer.variant_id) ?? "";
      const unitPrice = Number(offer.prices?.find((price) => price.currency_code === "pln")?.amount ?? 0);
      const rule = rules.get(offer.id);
      const pricing: SellerPricing = {
        offer_id: offer.id,
        variant_id: offer.variant_id,
        unit_price: unitPrice,
        // Dolny limit z bazy (seller_price_rule). Brak reguły (oferta dodana po seedzie): wyliczenie z seed-data.ts.
        min_unit_price: rule?.min_unit_price ?? minPriceFor(handle, title, unitPrice),
        stock: availableStock(offer),
        volume_discounts:
          rule?.volume_discounts ?? DEMO_OFFERS[title]?.find((demo) => demo.seller === handle)?.volume_discounts ?? [],
      };
      return [offer.variant_id, pricing];
    })
  );
}

type MessageRow = { id: string; author: string; kind: string; lines: unknown; text: string | null; created_at: Date | string };
type NegotiationRow = { id: string; seller_id: string; status: string; round: number; messages?: MessageRow[] };

const lineTotal = (lines: RfqLine[]): number => lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);

const isSellerOffer = (message: { author: string; lines: RfqLine[] }): boolean =>
  message.author === "seller_agent" && message.lines.length > 0;

const sortedMessages = (negotiation: NegotiationRow) =>
  [...(negotiation.messages ?? [])]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((message) => {
      const lines = asLines(message.lines);
      const offer = isSellerOffer({ author: message.author, lines });
      return { ...message, lines, valid_until: offer ? offerValidUntil(message.created_at).toISOString() : null };
    });

// Ostatnia oferta sprzedawcy (wiadomość z cenami). Wiadomości czatu (note) bez cen są pomijane.
export const latestSellerOffer = (negotiation: NegotiationRow) => {
  const offers = sortedMessages(negotiation).filter(isSellerOffer);
  return offers.length ? offers[offers.length - 1] : null;
};

export const latestSellerLines = (negotiation: NegotiationRow): RfqLine[] => latestSellerOffer(negotiation)?.lines ?? [];

export type RfqOrder = { id: string; display_id: number; total: number; status: string };
type OrderWithVariants = { order: RfqOrder; variants: Set<string> };

// Zamówienia z akceptacji (grupa zamówień) z wariantami, żeby przypiąć je do wątków sprzedawców.
async function loadGroupOrders(container: MedusaContainer, orderGroupId: string | null): Promise<OrderWithVariants[]> {
  if (!orderGroupId) return [];
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: groups } = await query.graph({ entity: "order_group", fields: ["orders.id"], filters: { id: orderGroupId } });
  const ids = ((groups[0]?.orders ?? []) as { id: string }[]).map((order) => order.id);
  if (!ids.length) return [];
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "total", "status", "items.variant_id"],
    filters: { id: ids },
  });
  return (data as Record<string, any>[]).map((order) => ({
    order: { id: order.id, display_id: order.display_id, total: Number(order.total), status: order.status },
    variants: new Set((order.items ?? []).map((item: { variant_id: string }) => item.variant_id)),
  }));
}

const orderForNegotiation = (orders: OrderWithVariants[], negotiation: NegotiationRow): RfqOrder | null => {
  if (negotiation.status !== "accepted") return null;
  const lines = latestSellerLines(negotiation);
  return orders.find((entry) => lines.some((line) => entry.variants.has(line.variant_id)))?.order ?? null;
};

async function sellerNames(container: MedusaContainer, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "seller", fields: ["id", "name"], filters: { id: ids } });
  return new Map((data as { id: string; name: string }[]).map((seller) => [seller.id, seller.name]));
}

// Najtańsza bieżąca oferta na każdą pozycję vs cena katalogowa (licznik F10).
function buildSummary(items: RfqItem[], negotiations: NegotiationRow[]) {
  const listTotal = items.reduce((sum, item) => sum + item.quantity * item.list_unit_price, 0);
  const offered = negotiations.filter((n) => n.status !== "declined").flatMap(latestSellerLines);
  const bestTotal = items.reduce((sum, item) => {
    const prices = offered.filter((line) => line.variant_id === item.variant_id).map((line) => line.unit_price);
    return sum + item.quantity * (prices.length ? Math.min(...prices) : item.list_unit_price);
  }, 0);
  return { list_total: listTotal, best_total: bestTotal, savings: listTotal - bestTotal };
}

export async function loadRfqView(container: MedusaContainer, rfqId: string) {
  const rfq = await rfqService(container)
    .retrieveRfq(rfqId, { relations: ["negotiations", "negotiations.messages"] })
    .catch(() => null);
  if (!rfq) {
    throw ruleError("NOT_FOUND", `Nie ma RFQ ${rfqId}`);
  }
  const negotiations = (rfq.negotiations ?? []) as unknown as NegotiationRow[];
  const names = await sellerNames(container, negotiations.map((n) => n.seller_id));
  const orders = await loadGroupOrders(container, rfq.order_group_id);
  const items = asItems(rfq.items);
  return {
    id: rfq.id,
    status: rfq.status,
    need_text: rfq.need_text,
    max_rounds: rfq.max_rounds,
    order_group_id: rfq.order_group_id,
    created_at: rfq.created_at,
    items,
    negotiations: negotiations.map((negotiation) => ({
      id: negotiation.id,
      seller: { id: negotiation.seller_id, name: names.get(negotiation.seller_id) ?? negotiation.seller_id },
      status: negotiation.status,
      round: negotiation.round,
      messages: sortedMessages(negotiation),
      latest_total: lineTotal(latestSellerLines(negotiation)),
      order: orderForNegotiation(orders, negotiation),
    })),
    summary: buildSummary(items, negotiations),
  };
}

export async function loadVendorNegotiations(container: MedusaContainer, sellerId: string, status?: string) {
  const negotiations = await rfqService(container).listRfqNegotiations(
    { seller_id: sellerId, ...(status ? { status } : {}) } as Record<string, unknown>,
    { relations: ["rfq", "messages"], order: { created_at: "ASC" } }
  );
  return Promise.all(
    negotiations.map(async (negotiation) => {
      const rfq = negotiation.rfq as unknown as {
        id: string;
        need_text: string;
        max_rounds: number;
        items: unknown;
        order_group_id: string | null;
      };
      const items = asItems(rfq.items);
      const pricing = await loadSellerPricing(container, sellerId, items);
      const orders = await loadGroupOrders(container, rfq.order_group_id);
      return {
        id: negotiation.id,
        rfq: { id: rfq.id, need_text: rfq.need_text, max_rounds: rfq.max_rounds },
        status: negotiation.status,
        round: negotiation.round,
        requested: items
          .filter((item) => (item.seller_id ? item.seller_id === sellerId : pricing.has(item.variant_id)))
          .map(({ variant_id, product_title, quantity }) => ({ variant_id, product_title, quantity })),
        pricing: [...pricing.values()],
        messages: sortedMessages(negotiation as unknown as NegotiationRow),
        order: orderForNegotiation(orders, negotiation as unknown as NegotiationRow),
      };
    })
  );
}
