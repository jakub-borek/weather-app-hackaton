// Dolne limity negocjacji (F02/F04): dla każdej oferty w bazie zapisuje SellerPriceRule z ceną minimalną
// i rabatami wolumenowymi z seed-data.ts (DEMO_OFFERS albo cena oferty minus max_discount_pct sprzedawcy).
// Idempotentne: dopisuje tylko brakujące reguły, istniejących nie nadpisuje.
// Uruchomienie: bun run seed:price-rules (w packages/api). Woła je też bun run seed.
import { ExecArgs, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { rfqService, toJson } from "../lib/rfq";
import { CURRENCY, DEMO_OFFERS, minPriceFor } from "./seed-data";

type OfferRow = {
  id: string;
  variant_id: string;
  seller_id: string;
  seller?: { email?: string };
  prices?: { amount: number; currency_code: string }[];
};
type ProductRow = { title: string; variants?: { id: string }[] };

export type PriceRuleInput = {
  offer_id: string;
  seller_id: string;
  variant_id: string;
  min_unit_price: number;
  // model.json() przyjmuje obiekt, tablicę rabatów rzutujemy jak items w RFQ.
  volume_discounts: Record<string, unknown>;
};

async function loadTitlesByVariant(container: MedusaContainer): Promise<Map<string, string>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "product", fields: ["title", "variants.id"] });
  return new Map(
    (data as ProductRow[]).flatMap((product) => (product.variants ?? []).map((variant) => [variant.id, product.title]))
  );
}

function toRule(offer: OfferRow, title: string): PriceRuleInput {
  const handle = (offer.seller?.email ?? "").split("@")[0];
  const price = Number(offer.prices?.find((entry) => entry.currency_code === CURRENCY)?.amount ?? 0);
  const discounts = DEMO_OFFERS[title]?.find((demo) => demo.seller === handle)?.volume_discounts ?? [];
  return {
    offer_id: offer.id,
    seller_id: offer.seller_id,
    variant_id: offer.variant_id,
    min_unit_price: minPriceFor(handle, title, price),
    volume_discounts: toJson(discounts.map((discount) => ({ ...discount }))),
  };
}

export async function seedPriceRules(container: MedusaContainer): Promise<{ created: number; total: number }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const service = rfqService(container);
  const { data } = await query.graph({
    entity: "offer",
    fields: ["id", "variant_id", "seller_id", "seller.email", "prices.amount", "prices.currency_code"],
  });
  const offers = data as OfferRow[];
  const titles = await loadTitlesByVariant(container);
  const existing = await service.listSellerPriceRules({}, { select: ["offer_id"], take: null });
  const seeded = new Set(existing.map((rule) => rule.offer_id));
  const missing = offers
    .filter((offer) => !seeded.has(offer.id))
    .map((offer) => toRule(offer, titles.get(offer.variant_id) ?? ""));
  if (missing.length) {
    await service.createSellerPriceRules(missing);
  }
  return { created: missing.length, total: offers.length };
}

export default async function seedPriceRulesScript({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const { created, total } = await seedPriceRules(container);
  logger.info(`Reguły cenowe: ${created} nowych, ofert w bazie ${total}.`);
}
