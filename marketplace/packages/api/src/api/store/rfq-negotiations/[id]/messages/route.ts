// POST /store/rfq-negotiations/:id/messages (agent kupującego): kontroferta albo stop.
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { respond } from "../../../../../lib/rfq-http";
import { postBuyerMessageWorkflow } from "../../../../../workflows/rfq";
import type { BuyerMessageBody } from "../../../../middlewares";

export async function POST(req: MedusaRequest<BuyerMessageBody>, res: MedusaResponse): Promise<void> {
  await respond(req, res, async () => {
    const { result } = await postBuyerMessageWorkflow(req.scope).run({
      input: { negotiation_id: req.params.id, ...req.validatedBody },
    });
    return { negotiation: result };
  });
}
