// POST /store/rfq-requests (storefront): kupujący wysyła koszyk z wiadomością.
// Otwiera wątek z każdym sprzedawcą z koszyka. accept_token wraca tylko tutaj (storefront trzyma go w cookie).
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { loadRfqView } from "../../../lib/rfq";
import { respond } from "../../../lib/rfq-http";
import { createRfqFromCartWorkflow } from "../../../workflows/rfq";
import type { CartRfqBody } from "../../middlewares";

export async function POST(req: MedusaRequest<CartRfqBody>, res: MedusaResponse): Promise<void> {
  await respond(
    req,
    res,
    async () => {
      const { result } = await createRfqFromCartWorkflow(req.scope).run({ input: req.validatedBody });
      return { rfq: await loadRfqView(req.scope, result.rfq_id), accept_token: result.accept_token };
    },
    201
  );
}
