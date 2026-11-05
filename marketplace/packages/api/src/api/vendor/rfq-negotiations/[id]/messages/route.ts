// POST /vendor/rfq-negotiations/:id/messages (agent sprzedawcy): oferta, kontroferta, final albo decline.
// Reguły F04 (cena minimalna, stan, kolejka, limit rund) sprawdza workflow, nie prompt.
import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { respond } from "../../../../../lib/rfq-http";
import { postSellerMessageWorkflow } from "../../../../../workflows/rfq";
import type { SellerMessageBody } from "../../../../middlewares";

type VendorRequest = AuthenticatedMedusaRequest<SellerMessageBody> & { seller_context?: { seller_id: string } };

export async function POST(req: VendorRequest, res: MedusaResponse): Promise<void> {
  await respond(req, res, async () => {
    const { result } = await postSellerMessageWorkflow(req.scope).run({
      input: {
        negotiation_id: req.params.id,
        seller_id: req.seller_context?.seller_id as string,
        ...req.validatedBody,
      },
    });
    return { negotiation: result };
  });
}
