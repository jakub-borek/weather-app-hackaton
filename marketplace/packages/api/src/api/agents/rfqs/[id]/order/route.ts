// POST /agents/rfqs/:id/order { negotiation_ids, human_approval } (bot kupującego, x-agent-key albo JWT z /agents/login).
// Bot składa zamówienie po wynegocjowanych cenach dopiero po zgodzie człowieka wyrażonej w czacie z botem (DECYZJA 2026-11-05).
// Token akceptacji nadal nie trafia do bota: backend bierze go z konta klienta, w imieniu którego działa bot,
// więc bot zamówi tylko RFQ swojego klienta. Słowa zgody idą do logu negocjacji jako wiadomość systemowa.
import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { acceptTokensOf } from "../../../../../lib/agent-key";
import { loadRfqView, rfqService, ruleError, toJson } from "../../../../../lib/rfq";
import { respond } from "../../../../../lib/rfq-http";
import { acceptRfqWorkflow } from "../../../../../workflows/rfq";
import type { AgentOrderBody } from "../../../../middlewares";

type Customer = { id: string; email: string; metadata?: Record<string, unknown> | null };

// Klient, w którego imieniu działa bot: przy kluczu agenta to sam klient, przy koncie bota jego owner_email.
// Właściciel z tym samym e-mailem bywa w bazie dwa razy (gość z zamówienia i konto), więc bierzemy tego z tokenem RFQ.
async function principalOf(container: MedusaContainer, actorId: string, viaAgentKey: boolean, rfqId: string): Promise<Customer> {
  const customers = container.resolve(Modules.CUSTOMER);
  const actor = (await customers.retrieveCustomer(actorId)) as Customer;
  if (viaAgentKey) return actor;
  const ownerEmail = actor.metadata?.owner_email as string | undefined;
  const owners = ownerEmail ? ((await customers.listCustomers({ email: ownerEmail })) as Customer[]) : [];
  const others = owners.filter((candidate) => candidate.id !== actor.id);
  const owner = others.find((candidate) => acceptTokensOf(candidate)[rfqId]) ?? others[0];
  if (!owner) throw ruleError("NOT_FOUND", "Konto bota nie ma właściciela, więc nie może składać zamówień");
  return owner;
}

export async function POST(req: AuthenticatedMedusaRequest<AgentOrderBody>, res: MedusaResponse): Promise<void> {
  await respond(req, res, async () => {
    const rfqId = req.params.id;
    const { negotiation_ids, human_approval } = req.validatedBody;
    const viaAgentKey = req.auth_context.app_metadata?.agent_key === true;
    const principal = await principalOf(req.scope, req.auth_context.actor_id, viaAgentKey, rfqId);
    const acceptToken = acceptTokensOf(principal)[rfqId];
    if (!acceptToken) throw ruleError("NOT_FOUND", `RFQ ${rfqId} nie należy do klienta ${principal.email}`);

    const { result } = await acceptRfqWorkflow(req.scope).run({
      input: { rfq_id: rfqId, accept_token: acceptToken, negotiation_ids, email: principal.email },
    });
    await rfqService(req.scope).createRfqMessages(
      negotiation_ids.map((negotiation_id) => ({
        negotiation_id,
        author: "system" as const,
        kind: "note" as const,
        lines: toJson([]),
        text: `Zamówienie złożył agent kupującego po zgodzie klienta ${principal.email}: „${human_approval}”`,
      }))
    );
    return { rfq: await loadRfqView(req.scope, rfqId), order_group_id: result.order_group_id, order_ids: result.order_ids };
  });
}
