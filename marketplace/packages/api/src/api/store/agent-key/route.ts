// POST /store/agent-key (zalogowany klient): klucz agenta i URL dokumentu dla Grok Bota, plus zapytania klienta.
// Klucz powstaje przy pierwszym wywołaniu, czyli gdy klient po rejestracji wchodzi do konta.
import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { acceptTokensOf, ensureAgentKey, publicUrls } from "../../../lib/agent-key";
import { loadRfqView } from "../../../lib/rfq";

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const { customer, key } = await ensureAgentKey(req.scope, req.auth_context.actor_id);
  const urls = await publicUrls(req);
  const ids = Object.keys(acceptTokensOf(customer)).reverse();
  const rfqs = await Promise.all(
    ids.map((id) =>
      loadRfqView(req.scope, id)
        .then((rfq) => ({ id: rfq.id, status: rfq.status, need_text: rfq.need_text, created_at: rfq.created_at }))
        .catch(() => null)
    )
  );
  res.json({
    key,
    doc_url: `${urls.api}/agents/docs/${key}`,
    store_url: urls.store,
    rfqs: rfqs.filter(Boolean),
  });
}
