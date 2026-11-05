// POST /store/rfqs/:id/items (agent kupującego): pozycje RFQ, potem rozesłanie do sprzedawców z ofertami.
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { loadRfqView } from "../../../../../lib/rfq";
import { respond } from "../../../../../lib/rfq-http";
import { setRfqItemsWorkflow } from "../../../../../workflows/rfq";
import type { SetRfqItemsBody } from "../../../../middlewares";

export async function POST(req: MedusaRequest<SetRfqItemsBody>, res: MedusaResponse): Promise<void> {
  await respond(req, res, async () => {
    await setRfqItemsWorkflow(req.scope).run({ input: { rfq_id: req.params.id, items: req.validatedBody.items } });
    return { rfq: await loadRfqView(req.scope, req.params.id) };
  });
}
