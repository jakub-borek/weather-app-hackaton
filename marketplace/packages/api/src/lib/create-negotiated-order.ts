// F08: zamówienie w Mercurze po wynegocjowanych cenach.
// Store API (POST /store/carts/:id/line-items) odrzuca unit_price, więc cenę nadpisujemy po stronie
// serwera tym samym addToCartWorkflow, którego używa trasa Mercura (pozycja dostaje is_custom_price).
// Potem wysyłka każdego sprzedawcy, płatność systemowa i completeCartWithSplitOrdersWorkflow,
// który dzieli koszyk na osobne zamówienia per sprzedawca w jednej grupie zamówień.
import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  addToCartWorkflow,
  createCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  addSellerShippingMethodToCartWorkflow,
  completeCartWithSplitOrdersWorkflow,
  listSellerShippingOptionsForCartWorkflow,
} from "@mercurjs/core/workflows";

export type NegotiatedLine = { offer_id: string; quantity: number; unit_price: number };

export type BuyerAddress = {
  first_name: string;
  last_name: string;
  company?: string;
  address_1: string;
  city: string;
  postal_code: string;
  country_code: string;
};

export type NegotiatedOrderInput = {
  lines: NegotiatedLine[];
  email: string;
  address: BuyerAddress;
  metadata?: Record<string, unknown>;
};

export type NegotiatedOrderResult = { cart_id: string; order_group_id: string; order_ids: string[] };

const PAYMENT_PROVIDER = "pp_system_default";

async function resolveCartContext(container: MedusaContainer): Promise<{ regionId: string; salesChannelId: string }> {
  const regionService = container.resolve(Modules.REGION);
  const storeService = container.resolve(Modules.STORE);
  const regions = await regionService.listRegions({}, { relations: ["countries"] });
  const region = regions.find((candidate) => candidate.countries?.some((country) => country.iso_2 === "pl"));
  const [store] = await storeService.listStores();
  if (!region || !store?.default_sales_channel_id) {
    throw new Error("Brak regionu Polska albo domyślnego kanału sprzedaży. Uruchom seed.");
  }
  return { regionId: region.id, salesChannelId: store.default_sales_channel_id };
}

async function variantIdsByOffer(container: MedusaContainer, offerIds: string[]): Promise<Map<string, string>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "offer", fields: ["id", "variant_id"], filters: { id: offerIds } });
  const variants = new Map((data as { id: string; variant_id: string }[]).map((offer) => [offer.id, offer.variant_id]));
  const missing = offerIds.filter((id) => !variants.has(id));
  if (missing.length) {
    throw new Error(`Nie ma ofert: ${missing.join(", ")}`);
  }
  return variants;
}

// Zbiera ID opcji wysyłki z mapy sprzedawca → opcje (kształt wyniku workflow Mercura).
const shippingOptionIds = (result: unknown): string[] => {
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.id === "string" && record.id.startsWith("so_")) {
        found.add(record.id);
        return;
      }
      Object.values(record).forEach(walk);
    }
  };
  walk(result);
  return [...found];
};

async function addShippingForAllSellers(container: MedusaContainer, cartId: string): Promise<void> {
  const { result } = await listSellerShippingOptionsForCartWorkflow(container).run({
    input: { cart_id: cartId, is_return: false },
  });
  const ids = shippingOptionIds(result);
  if (!ids.length) {
    throw new Error(`Brak opcji wysyłki dla koszyka ${cartId}`);
  }
  await addSellerShippingMethodToCartWorkflow(container).run({
    input: { cart_id: cartId, options: ids.map((id) => ({ id })) },
  });
}

async function addSystemPayment(container: MedusaContainer, cartId: string): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cartId } });
  const { data } = await query.graph({ entity: "cart", fields: ["payment_collection.id"], filters: { id: cartId } });
  const paymentCollectionId = data[0]?.payment_collection?.id;
  if (!paymentCollectionId) {
    throw new Error(`Nie powstała kolekcja płatności dla koszyka ${cartId}`);
  }
  await createPaymentSessionsWorkflow(container).run({
    input: { payment_collection_id: paymentCollectionId, provider_id: PAYMENT_PROVIDER },
  });
}

export async function createNegotiatedOrder(
  container: MedusaContainer,
  input: NegotiatedOrderInput
): Promise<NegotiatedOrderResult> {
  if (!input.lines.length || input.lines.some((line) => line.quantity <= 0 || line.unit_price <= 0)) {
    throw new Error("Zamówienie wymaga co najmniej jednej pozycji z dodatnią ilością i ceną");
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { regionId, salesChannelId } = await resolveCartContext(container);
  const variants = await variantIdsByOffer(container, input.lines.map((line) => line.offer_id));

  const { result: cart } = await createCartWorkflow(container).run({
    input: {
      region_id: regionId,
      sales_channel_id: salesChannelId,
      email: input.email,
      shipping_address: input.address,
      billing_address: input.address,
      metadata: input.metadata,
    },
  });

  await addToCartWorkflow(container).run({
    input: {
      cart_id: cart.id,
      items: input.lines.map((line) => ({
        variant_id: variants.get(line.offer_id) as string,
        quantity: line.quantity,
        unit_price: line.unit_price,
        offer_id: line.offer_id,
        requires_shipping: true,
        metadata: { offer_id: line.offer_id, negotiated: true },
      })),
    },
  });

  await addShippingForAllSellers(container, cart.id);
  await addSystemPayment(container, cart.id);

  const { result } = await completeCartWithSplitOrdersWorkflow(container).run({ input: { cart_id: cart.id } });
  const orderGroupId = (result as { order_group_id?: string }).order_group_id;
  if (!orderGroupId) {
    throw new Error(`Koszyk ${cart.id} nie utworzył grupy zamówień`);
  }
  const { data } = await query.graph({ entity: "order_group", fields: ["id", "orders.id"], filters: { id: orderGroupId } });
  const orderIds = ((data[0]?.orders ?? []) as { id: string }[]).map((order) => order.id);
  return { cart_id: cart.id, order_group_id: orderGroupId, order_ids: orderIds };
}
