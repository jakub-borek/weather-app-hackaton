// POST /store/rfqs/:id/accept (tylko UI, z accept_token): akceptacja wybranych negocjacji → zamówienia (F08).
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { loadRfqView } from "../../../../../lib/rfq";
import { respond } from "../../../../../lib/rfq-http";
import { acceptRfqWorkflow } from "../../../../../workflows/rfq";
import type { AcceptRfqBody } from "../../../../middlewares";

export async function POST(req: MedusaRequest<AcceptRfqBody>, res: MedusaResponse): Promise<void> {
  await respond(req, res, async () => {
    const { result } = await acceptRfqWorkflow(req.scope).run({ input: { rfq_id: req.params.id, ...req.validatedBody } });
    return {
      rfq: await loadRfqView(req.scope, req.params.id),
      order_group_id: result.order_group_id,
      order_ids: result.order_ids,
    };
  });
}
