// POST /agents/rfqs (bot kupującego, Bearer z /agents/login): tworzy RFQ i od razu je rozsyła, jeśli są items.
// W odróżnieniu od POST /store/rfqs bot NIE dostaje accept_token: akceptuje tylko człowiek (product.md, F04).
// Token ląduje w metadata klienta-właściciela bota (metadata.owner_email konta bota), skąd bierze go sklep człowieka.
import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { acceptTokensOf, storeAcceptToken } from "../../../lib/agent-key";
import { loadRfqView } from "../../../lib/rfq";
import { respond } from "../../../lib/rfq-http";
import { createRfqWorkflow, setRfqItemsWorkflow } from "../../../workflows/rfq";
import type { AgentRfqBody } from "../../middlewares";

// Zwraca e-mail człowieka, który dostał token, albo null, gdy bot nie ma właściciela.
async function handTokenToOwner(container: MedusaContainer, botCustomerId: string, rfqId: string, acceptToken: string) {
  const customers = container.resolve(Modules.CUSTOMER);
  const bot = await customers.retrieveCustomer(botCustomerId);
  const ownerEmail = bot.metadata?.owner_email as string | undefined;
  const [owner] = ownerEmail ? await customers.listCustomers({ email: ownerEmail }) : [];
  if (!owner || owner.id === bot.id) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`RFQ ${rfqId}: bot ${bot.email} nie ma właściciela (metadata.owner_email), token akceptacji zostaje tylko w bazie`);
    return null;
  }
  const tokens = (owner.metadata?.rfq_accept_tokens as Record<string, string> | undefined) ?? {};
  await customers.updateCustomers(owner.id, {
    metadata: { ...owner.metadata, rfq_accept_tokens: { ...tokens, [rfqId]: acceptToken } },
  });
  return owner.email;
}

export async function POST(req: AuthenticatedMedusaRequest<AgentRfqBody>, res: MedusaResponse): Promise<void> {
  await respond(
    req,
    res,
    async () => {
      const { need_text, max_rounds, items } = req.validatedBody;
      const { result } = await createRfqWorkflow(req.scope).run({ input: { need_text, max_rounds } });
      // Klucz agenta z konta klienta: bot działa w imieniu tego klienta, więc token idzie do niego samego.
      const viaAgentKey = req.auth_context.app_metadata?.agent_key === true;
      const ownerEmail = viaAgentKey
        ? await storeAcceptToken(req.scope, req.auth_context.actor_id, result.rfq_id, result.accept_token).then(async () =>
            (await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(req.auth_context.actor_id)).email
          )
        : await handTokenToOwner(req.scope, req.auth_context.actor_id, result.rfq_id, result.accept_token);
      if (items?.length) {
        await setRfqItemsWorkflow(req.scope).run({ input: { rfq_id: result.rfq_id, items } });
      }
      return {
        rfq: await loadRfqView(req.scope, result.rfq_id),
        acceptance: {
          by: "human",
          owner_email: ownerEmail,
          note: "Nie akceptujesz. Raportuj człowiekowi id RFQ, on akceptuje w sklepie.",
        },
      };
    },
    201
  );
}

// GET /agents/rfqs: zapytania klienta (z tokenów akceptacji w jego koncie), żeby bot mógł wznowić pracę.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  await respond(req, res, async () => {
    const customer = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(req.auth_context.actor_id);
    const ids = Object.keys(acceptTokensOf(customer)).reverse();
    const views = await Promise.all(ids.map((id) => loadRfqView(req.scope, id).catch(() => null)));
    return {
      rfqs: views
        .filter((rfq) => rfq !== null)
        .map((rfq) => ({ id: rfq.id, status: rfq.status, need_text: rfq.need_text, negotiations: rfq.negotiations.length })),
    };
  });
}
