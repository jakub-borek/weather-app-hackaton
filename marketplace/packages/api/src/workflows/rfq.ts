// Workflowy RFQ (F03) z regułami negocjacji (F04). Każda zmiana danych idzie przez workflow.
// Kontrakt: docs/rfq-contract.md. Błędy reguł: ruleError("KOD", "opis") → trasa zwraca 422 z kodem.
import { randomBytes } from "crypto";
import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { createNegotiatedOrder } from "../lib/create-negotiated-order";
import {
  asItems,
  asLines,
  latestSellerLines,
  loadSellerPricing,
  rfqService,
  ruleError,
  toJson,
  type RfqItem,
  type RfqLine,
} from "../lib/rfq";

const CLOSED = ["final", "declined", "accepted", "rejected"];
const DEMO_BUYER = {
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
};

async function loadNegotiation(container: MedusaContainer, negotiationId: string) {
  const negotiation = await rfqService(container)
    .retrieveRfqNegotiation(negotiationId, { relations: ["rfq"] })
    .catch(() => null);
  if (!negotiation) {
    throw ruleError("NOT_FOUND", `Nie ma negocjacji ${negotiationId}`);
  }
  const rfq = negotiation.rfq as unknown as { id: string; max_rounds: number; items: unknown };
  return { negotiation, rfq, items: asItems(rfq.items) };
}

function assertTurn(status: string, expected: string): void {
  if (CLOSED.includes(status)) {
    throw ruleError("NEGOTIATION_CLOSED", `Negocjacja jest zamknięta (${status})`);
  }
  if (status !== expected) {
    throw ruleError("NOT_YOUR_TURN", `Teraz kolej drugiej strony (status ${status})`);
  }
}

function assertKnownVariants(lines: RfqLine[], items: RfqItem[]): void {
  if (!lines.length) {
    throw ruleError("UNKNOWN_VARIANT", "Oferta musi mieć co najmniej jedną pozycję");
  }
  const known = new Set(items.map((item) => item.variant_id));
  const unknown = lines.find((line) => !known.has(line.variant_id));
  if (unknown) {
    throw ruleError("UNKNOWN_VARIANT", `Wariant ${unknown.variant_id} nie występuje w RFQ`);
  }
}

// RFQ przechodzi na "ready", gdy każda negocjacja jest końcowa albo odrzucona przez sprzedawcę.
async function refreshRfqStatus(container: MedusaContainer, rfqId: string): Promise<void> {
  const service = rfqService(container);
  const [rfq, negotiations] = await Promise.all([
    service.retrieveRfq(rfqId),
    service.listRfqNegotiations({ rfq_id: rfqId } as Record<string, unknown>),
  ]);
  const allClosed = negotiations.every((n) => ["final", "declined"].includes(n.status));
  if (rfq.status === "negotiating" && allClosed) {
    await service.updateRfqs({ id: rfqId, status: "ready" });
  }
}

// --- Tworzenie RFQ (UI) ---
type CreateRfqInput = { need_text: string; max_rounds?: number };

const createRfqStep = createStep("rfq-create", async (input: CreateRfqInput, { container }) => {
  const acceptToken = randomBytes(16).toString("hex");
  const rfq = await rfqService(container).createRfqs({
    need_text: input.need_text,
    max_rounds: input.max_rounds ?? 3,
    accept_token: acceptToken,
    status: "draft",
  });
  return new StepResponse({ rfq_id: rfq.id, accept_token: acceptToken });
});

export const createRfqWorkflow = createWorkflow("rfq-create-workflow", function (input: CreateRfqInput) {
  return new WorkflowResponse(createRfqStep(input));
});

// --- RFQ z koszyka: kupujący wysyła koszyk z wiadomością (storefront) ---
type CartRfqInput = { cart_id: string; message: string; max_rounds?: number };
type CartItemRow = {
  variant_id: string;
  quantity: number;
  unit_price: number;
  product_title: string;
  offer?: { seller_id?: string } | null;
};

const createRfqFromCartStep = createStep("rfq-from-cart", async (input: CartRfqInput, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "items.variant_id", "items.quantity", "items.unit_price", "items.product_title", "items.offer.seller_id"],
    filters: { id: input.cart_id },
  });
  const cartItems = (data[0]?.items ?? []) as CartItemRow[];
  if (!cartItems.length) throw ruleError("INVALID_STATE", "Koszyk jest pusty");

  // Cena z koszyka (oferta sprzedawcy) jest punktem wyjścia negocjacji i podstawą licznika oszczędności.
  const items: RfqItem[] = cartItems.map((item) => ({
    variant_id: item.variant_id,
    product_title: item.product_title,
    quantity: item.quantity,
    list_unit_price: Number(item.unit_price),
    seller_id: item.offer?.seller_id,
  }));
  const sellerIds = [...new Set(items.map((item) => item.seller_id).filter((id): id is string => !!id))];
  if (!sellerIds.length) throw ruleError("INVALID_STATE", "Pozycje koszyka nie mają ofert sprzedawców");

  const service = rfqService(container);
  const acceptToken = randomBytes(16).toString("hex");
  const rfq = await service.createRfqs({
    need_text: input.message,
    items: toJson(items),
    max_rounds: input.max_rounds ?? 3,
    accept_token: acceptToken,
    cart_id: input.cart_id,
    status: "negotiating",
  });
  const negotiations = await service.createRfqNegotiations(
    sellerIds.map((seller_id) => ({ rfq_id: rfq.id, seller_id, status: "awaiting_seller" as const }))
  );
  await service.createRfqMessages(
    negotiations.map((negotiation) => ({
      negotiation_id: negotiation.id,
      author: "buyer" as const,
      kind: "note" as const,
      lines: toJson(
        items
          .filter((item) => item.seller_id === negotiation.seller_id)
          .map((item) => ({ variant_id: item.variant_id, quantity: item.quantity, unit_price: item.list_unit_price }))
      ),
      text: input.message,
    }))
  );
  return new StepResponse({ rfq_id: rfq.id, accept_token: acceptToken });
});

export const createRfqFromCartWorkflow = createWorkflow("rfq-from-cart-workflow", function (input: CartRfqInput) {
  return new WorkflowResponse(createRfqFromCartStep(input));
});

// --- Pozycje RFQ i rozesłanie do sprzedawców (agent kupującego) ---
type SetItemsInput = { rfq_id: string; items: { variant_id: string; quantity: number; target_unit_price?: number }[] };
type VariantRow = { id: string; product?: { title?: string; metadata?: Record<string, unknown> | null } };

const setRfqItemsStep = createStep("rfq-set-items", async (input: SetItemsInput, { container }) => {
  const service = rfqService(container);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const rfq = await service.retrieveRfq(input.rfq_id).catch(() => null);
  if (!rfq) throw ruleError("NOT_FOUND", `Nie ma RFQ ${input.rfq_id}`);
  if (rfq.status !== "draft") throw ruleError("INVALID_STATE", `RFQ ma już pozycje (status ${rfq.status})`);

  const variantIds = input.items.map((item) => item.variant_id);
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product.title", "product.metadata"],
    filters: { id: variantIds },
  });
  const byId = new Map((variants as VariantRow[]).map((variant) => [variant.id, variant]));
  const missing = variantIds.find((id) => !byId.has(id));
  if (missing) throw ruleError("UNKNOWN_VARIANT", `Nie ma wariantu ${missing}`);

  const items: RfqItem[] = input.items.map((item) => {
    const product = byId.get(item.variant_id)?.product;
    return { ...item, product_title: product?.title ?? "", list_unit_price: Number(product?.metadata?.list_price_pln ?? 0) };
  });
  const { data: offers } = await query.graph({ entity: "offer", fields: ["seller_id"], filters: { variant_id: variantIds } });
  const sellerIds = [...new Set((offers as { seller_id: string }[]).map((offer) => offer.seller_id))];
  if (!sellerIds.length) throw ruleError("INVALID_STATE", "Żaden sprzedawca nie ma ofert na te produkty");

  await service.updateRfqs({ id: rfq.id, items: toJson(items), status: "negotiating" });
  await service.createRfqNegotiations(sellerIds.map((seller_id) => ({ rfq_id: rfq.id, seller_id, status: "awaiting_seller" as const })));
  return new StepResponse({ rfq_id: rfq.id, sellers: sellerIds.length });
});

export const setRfqItemsWorkflow = createWorkflow("rfq-set-items-workflow", function (input: SetItemsInput) {
  return new WorkflowResponse(setRfqItemsStep(input));
});

// --- Wiadomość sprzedawcy (agent sprzedawcy, vendor API) z regułami F04 ---
type SellerKind = "offer" | "counter" | "final" | "decline";
type SellerMessageInput = { negotiation_id: string; seller_id: string; kind: SellerKind; lines: RfqLine[]; text: string };

async function assertSellerRules(container: MedusaContainer, sellerId: string, lines: RfqLine[], items: RfqItem[]) {
  assertKnownVariants(lines, items);
  const pricing = await loadSellerPricing(container, sellerId, items);
  for (const line of lines) {
    const offer = pricing.get(line.variant_id);
    if (!offer) throw ruleError("UNKNOWN_VARIANT", `Nie masz oferty na wariant ${line.variant_id}`);
    if (line.unit_price < offer.min_unit_price) {
      throw ruleError("BELOW_MIN_PRICE", `Cena ${line.unit_price} < minimum ${offer.min_unit_price} dla ${line.variant_id}`);
    }
    if (line.quantity > offer.stock) {
      throw ruleError("OVER_STOCK", `Ilość ${line.quantity} > stan ${offer.stock} dla ${line.variant_id}`);
    }
  }
}

const postSellerMessageStep = createStep("rfq-seller-message", async (input: SellerMessageInput, { container }) => {
  const { negotiation, rfq, items } = await loadNegotiation(container, input.negotiation_id);
  if (negotiation.seller_id !== input.seller_id) throw ruleError("NOT_FOUND", `Nie ma negocjacji ${input.negotiation_id}`);
  assertTurn(negotiation.status, "awaiting_seller");
  if (input.kind !== "decline") {
    await assertSellerRules(container, input.seller_id, input.lines, items);
  }
  const round = negotiation.round + 1;
  const kind = input.kind !== "decline" && round >= rfq.max_rounds ? "final" : input.kind;
  const status = kind === "decline" ? "declined" : kind === "final" ? "final" : "awaiting_buyer";

  const service = rfqService(container);
  await service.createRfqMessages({
    negotiation_id: negotiation.id,
    author: "seller_agent",
    kind,
    lines: toJson(kind === "decline" ? [] : input.lines),
    text: input.text,
  });
  await service.updateRfqNegotiations({ id: negotiation.id, status, round });
  await refreshRfqStatus(container, rfq.id);
  return new StepResponse({ negotiation_id: negotiation.id, status, kind, round });
});

export const postSellerMessageWorkflow = createWorkflow("rfq-seller-message-workflow", function (input: SellerMessageInput) {
  return new WorkflowResponse(postSellerMessageStep(input));
});

// --- Wiadomość kupującego (agent kupującego, store API) ---
type BuyerMessageInput = { negotiation_id: string; kind: "counter" | "stop"; lines: RfqLine[]; text: string };

const postBuyerMessageStep = createStep("rfq-buyer-message", async (input: BuyerMessageInput, { container }) => {
  const { negotiation, rfq, items } = await loadNegotiation(container, input.negotiation_id);
  assertTurn(negotiation.status, "awaiting_buyer");
  if (input.kind === "counter") {
    assertKnownVariants(input.lines, items);
  }
  const status = input.kind === "stop" ? "final" : "awaiting_seller";
  const service = rfqService(container);
  await service.createRfqMessages({
    negotiation_id: negotiation.id,
    author: "buyer_agent",
    kind: input.kind,
    lines: toJson(input.kind === "stop" ? [] : input.lines),
    text: input.text,
  });
  await service.updateRfqNegotiations({ id: negotiation.id, status });
  await refreshRfqStatus(container, rfq.id);
  return new StepResponse({ negotiation_id: negotiation.id, status });
});

export const postBuyerMessageWorkflow = createWorkflow("rfq-buyer-message-workflow", function (input: BuyerMessageInput) {
  return new WorkflowResponse(postBuyerMessageStep(input));
});

// --- Akceptacja przez człowieka (UI) → zamówienia w Mercurze (F08) ---
type AcceptInput = { rfq_id: string; accept_token: string; negotiation_ids: string[]; email?: string };

const acceptRfqStep = createStep("rfq-accept", async (input: AcceptInput, { container }) => {
  const service = rfqService(container);
  const rfq = await service
    .retrieveRfq(input.rfq_id, { relations: ["negotiations", "negotiations.messages"] })
    .catch(() => null);
  if (!rfq) throw ruleError("NOT_FOUND", `Nie ma RFQ ${input.rfq_id}`);
  if (rfq.accept_token !== input.accept_token) throw ruleError("INVALID_ACCEPT_TOKEN", "Niepoprawny accept_token");
  if (["accepted", "cancelled"].includes(rfq.status)) throw ruleError("INVALID_STATE", `RFQ jest już ${rfq.status}`);

  const negotiations = (rfq.negotiations ?? []) as unknown as Parameters<typeof latestSellerLines>[0][];
  const chosen = negotiations.filter((n) => input.negotiation_ids.includes(n.id));
  const notReady = chosen.find((n) => !["final", "awaiting_buyer"].includes(n.status) || !latestSellerLines(n).length);
  if (chosen.length !== input.negotiation_ids.length || notReady) {
    throw ruleError("INVALID_STATE", "Można zaakceptować tylko negocjacje z ofertą sprzedawcy");
  }

  const items = asItems(rfq.items);
  const lines = (
    await Promise.all(
      chosen.map(async (negotiation) => {
        const pricing = await loadSellerPricing(container, negotiation.seller_id, items);
        return asLines(latestSellerLines(negotiation)).map((line) => ({
          offer_id: pricing.get(line.variant_id)?.offer_id as string,
          quantity: line.quantity,
          unit_price: line.unit_price,
        }));
      })
    )
  ).flat();

  const order = await createNegotiatedOrder(container, {
    lines,
    email: input.email ?? DEMO_BUYER.email,
    address: DEMO_BUYER.address,
    metadata: { rfq_id: rfq.id },
  });
  await service.updateRfqNegotiations(
    negotiations
      .filter((n) => n.status !== "declined")
      .map((n) => ({ id: n.id, status: input.negotiation_ids.includes(n.id) ? ("accepted" as const) : ("rejected" as const) }))
  );
  await service.updateRfqs({ id: rfq.id, status: "accepted", order_group_id: order.order_group_id });
  return new StepResponse(order);
});

export const acceptRfqWorkflow = createWorkflow("rfq-accept-workflow", function (input: AcceptInput) {
  return new WorkflowResponse(acceptRfqStep(input));
});
