// POST /store/rfqs (UI): nowe RFQ z potrzebą. accept_token wraca tylko tutaj.
// GET /store/rfqs?status=draft (agent kupującego): lista RFQ bez accept_token.
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { loadRfqView, rfqService } from "../../../lib/rfq";
import { respond } from "../../../lib/rfq-http";
import { createRfqWorkflow } from "../../../workflows/rfq";
import type { CreateRfqBody } from "../../middlewares";

export async function POST(req: MedusaRequest<CreateRfqBody>, res: MedusaResponse): Promise<void> {
  await respond(
    req,
    res,
    async () => {
      const { result } = await createRfqWorkflow(req.scope).run({ input: req.validatedBody });
      return { rfq: await loadRfqView(req.scope, result.rfq_id), accept_token: result.accept_token };
    },
    201
  );
}

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  await respond(req, res, async () => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rfqs = await rfqService(req.scope).listRfqs((status ? { status } : {}) as Record<string, unknown>, {
      order: { created_at: "DESC" },
      take: 20,
    });
    return { rfqs: await Promise.all(rfqs.map((rfq) => loadRfqView(req.scope, rfq.id))) };
  });
}
