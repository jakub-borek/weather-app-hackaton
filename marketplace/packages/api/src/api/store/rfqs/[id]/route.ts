// GET /store/rfqs/:id (UI co 1,5 s, agent kupującego): RFQ z negocjacjami, wiadomościami i podsumowaniem.
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { loadRfqView } from "../../../../lib/rfq";
import { respond } from "../../../../lib/rfq-http";

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  await respond(req, res, async () => ({ rfq: await loadRfqView(req.scope, req.params.id) }));
}
