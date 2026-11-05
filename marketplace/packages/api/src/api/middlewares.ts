import { authenticate, defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";

// --- RFQ (F03), kontrakt: docs/rfq-contract.md ---
const LineSchema = z.object({
  variant_id: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price: z.number().positive(),
});

export const CreateRfqSchema = z.object({
  need_text: z.string().min(3).max(2000),
  max_rounds: z.number().int().min(1).max(6).optional(),
});
export type CreateRfqBody = z.infer<typeof CreateRfqSchema>;

export const CartRfqSchema = z.object({
  cart_id: z.string().min(1),
  message: z.string().min(1).max(2000),
  max_rounds: z.number().int().min(1).max(6).optional(),
});
export type CartRfqBody = z.infer<typeof CartRfqSchema>;

export const SetRfqItemsSchema = z.object({
  items: z
    .array(
      z.object({
        variant_id: z.string().min(1),
        quantity: z.number().int().positive(),
        target_unit_price: z.number().positive().optional(),
      })
    )
    .min(1),
});
export type SetRfqItemsBody = z.infer<typeof SetRfqItemsSchema>;

export const BuyerMessageSchema = z.object({
  // buyer = człowiek ze storefrontu, buyer_agent = agent kupującego (domyślnie).
  author: z.enum(["buyer", "buyer_agent"]).default("buyer_agent"),
  kind: z.enum(["counter", "stop", "note"]),
  lines: z.array(LineSchema).default([]),
  text: z.string().max(2000).default(""),
});
export type BuyerMessageBody = z.infer<typeof BuyerMessageSchema>;

export const SellerMessageSchema = z.object({
  kind: z.enum(["offer", "counter", "final", "decline", "note"]),
  lines: z.array(LineSchema).default([]),
  text: z.string().max(2000).default(""),
});
export type SellerMessageBody = z.infer<typeof SellerMessageSchema>;

export const AcceptRfqSchema = z.object({
  accept_token: z.string().min(1),
  negotiation_ids: z.array(z.string().min(1)).min(1),
  email: z.string().email().optional(),
});
export type AcceptRfqBody = z.infer<typeof AcceptRfqSchema>;

// --- Dostęp dla botów (F05/F06): /agents/* ---
export const AgentLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  role: z.enum(["buyer", "seller"]).default("buyer"),
});
export type AgentLoginBody = z.infer<typeof AgentLoginSchema>;

export const AgentRfqSchema = CreateRfqSchema.extend({
  items: SetRfqItemsSchema.shape.items.optional(),
});
export type AgentRfqBody = z.infer<typeof AgentRfqSchema>;

export default defineMiddlewares({
  routes: [
    { matcher: "/store/rfqs", method: ["POST"], middlewares: [validateAndTransformBody(CreateRfqSchema)] },
    { matcher: "/store/rfq-requests", method: ["POST"], middlewares: [validateAndTransformBody(CartRfqSchema)] },
    { matcher: "/store/rfqs/:id/items", method: ["POST"], middlewares: [validateAndTransformBody(SetRfqItemsSchema)] },
    { matcher: "/store/rfqs/:id/accept", method: ["POST"], middlewares: [validateAndTransformBody(AcceptRfqSchema)] },
    {
      matcher: "/store/rfq-negotiations/:id/messages",
      method: ["POST"],
      middlewares: [validateAndTransformBody(BuyerMessageSchema)],
    },
    {
      matcher: "/vendor/rfq-negotiations/:id/messages",
      method: ["POST"],
      middlewares: [validateAndTransformBody(SellerMessageSchema)],
    },
    { matcher: "/agents/login", method: ["POST"], middlewares: [validateAndTransformBody(AgentLoginSchema)] },
    {
      matcher: "/agents/rfqs",
      method: ["POST"],
      middlewares: [authenticate("customer", ["bearer"]), validateAndTransformBody(AgentRfqSchema)],
    },
  ],
});
