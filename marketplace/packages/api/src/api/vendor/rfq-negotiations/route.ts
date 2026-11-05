// GET /vendor/rfq-negotiations?status=awaiting_seller (agent sprzedawcy, member token + x-seller-id).
// Middleware Mercura na /vendor/* ustawia req.seller_context. Odpowiedź zawiera prywatne ceny tylko tego sprzedawcy.
import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { loadVendorNegotiations } from "../../../lib/rfq";
import { respond } from "../../../lib/rfq-http";

type VendorRequest = AuthenticatedMedusaRequest & { seller_context?: { seller_id: string } };

export async function GET(req: VendorRequest, res: MedusaResponse): Promise<void> {
  await respond(req, res, async () => {
    const sellerId = req.seller_context?.seller_id as string;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    return { negotiations: await loadVendorNegotiations(req.scope, sellerId, status) };
  });
}
