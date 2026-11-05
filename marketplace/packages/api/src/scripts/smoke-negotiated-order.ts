// Sprawdzenie F08 na danych demo: 20 MacBooków od TechHurt po 4400 zł i 10 HP od LaptoPolu po 4250 zł.
// Oczekiwane: jedna grupa zamówień, dwa zamówienia (po jednym na sprzedawcę), ceny pozycji = wynegocjowane.
// Uruchomienie: bun run medusa exec ./src/scripts/smoke-negotiated-order.ts (w packages/api), po seedzie.
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createNegotiatedOrder } from "../lib/create-negotiated-order";

const DEMO_LINES = [
  { seller: "TechHurt", product: "Apple MacBook Air 13 M4 16 GB / 512 GB", quantity: 20, unit_price: 4400 },
  { seller: "LaptoPol", product: "HP EliteBook 840 G11 16 GB / 512 GB", quantity: 10, unit_price: 4250 },
];

export default async function smokeNegotiatedOrder({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const findOfferId = async (sellerName: string, productTitle: string): Promise<string> => {
    const { data: sellers } = await query.graph({ entity: "seller", fields: ["id"], filters: { name: sellerName } });
    const { data: products } = await query.graph({ entity: "product", fields: ["variants.id"], filters: { title: productTitle } });
    const variantId = products[0]?.variants?.[0]?.id;
    const { data: offers } = await query.graph({
      entity: "offer",
      fields: ["id"],
      filters: { seller_id: sellers[0]?.id, variant_id: variantId },
    });
    if (!offers[0]) {
      throw new Error(`Brak oferty ${sellerName} na ${productTitle}. Uruchom seed.`);
    }
    return offers[0].id as string;
  };

  let lines: { offer_id: string; quantity: number; unit_price: number }[] = [];
  for (const line of DEMO_LINES) {
    lines = [...lines, { offer_id: await findOfferId(line.seller, line.product), quantity: line.quantity, unit_price: line.unit_price }];
  }

  const result = await createNegotiatedOrder(container, {
    lines,
    email: "zakupy@firma-demo.pl",
    address: {
      first_name: "Jan",
      last_name: "Zakupowy",
      company: "Firma Demo sp. z o.o.",
      address_1: "ul. Prosta 1",
      city: "Warszawa",
      postal_code: "00-001",
      country_code: "pl",
    },
    metadata: { source: "smoke-negotiated-order" },
  });

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "total", "items.product_title", "items.quantity", "items.unit_price", "items.metadata"],
    filters: { id: result.order_ids },
  });
  logger.info(`Grupa zamówień ${result.order_group_id}, zamówień: ${orders.length}`);
  for (const order of orders as Record<string, any>[]) {
    const items = (order.items ?? []).map((i: Record<string, any>) => `${i.quantity} x ${i.product_title} @ ${i.unit_price}`);
    logger.info(`Zamówienie #${order.display_id} (${order.id}), suma ${order.total}: ${items.join("; ")}`);
  }
}
