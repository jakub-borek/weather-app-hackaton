// Seed kont Grok Botów (F05/F06): bun run seed:agents (z marketplace/packages/api). Idempotentny.
// Bot kupującego = klient z metadata.agent i owner_email. Token akceptacji RFQ, które tworzy (POST /agents/rfqs),
// trafia do klienta-właściciela, nie do bota. Boty sprzedawców logują się kontami sklepów z seed.ts (role "seller").
// Hasła to dane lokalnego demo, jak SELLER_PASSWORD w seed-data.ts. Inne hasło: AGENT_BOT_PASSWORD=... bun run seed:agents
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows";

const BOT_PASSWORD = process.env.AGENT_BOT_PASSWORD ?? "supersecret";
// Ten sam kupujący, na którego F08 zakłada zamówienia (DEMO_BUYER w workflows/rfq.ts).
const OWNER = { email: "zakupy@firma-demo.pl", first_name: "Jan", last_name: "Zakupowy", company_name: "Firma Demo sp. z o.o." };
const BUYER_BOTS = [{ email: "negocjator@example.com", first_name: "Negocjator", last_name: "Grok Bot" }];

export default async function seedAgents({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const auth = container.resolve(Modules.AUTH);
  const customers = container.resolve(Modules.CUSTOMER);

  if (!(await customers.listCustomers({ email: OWNER.email })).length) {
    await customers.createCustomers(OWNER);
    logger.info(`seed-agents: właściciel botów ${OWNER.email}`);
  }

  for (const bot of BUYER_BOTS) {
    const metadata = { agent: true, owner_email: OWNER.email };
    const registered = await auth.register("emailpass", { body: { email: bot.email, password: BOT_PASSWORD } });
    let authIdentityId = registered.authIdentity?.id;
    if (!registered.success) {
      // Konto już jest: ustawiamy hasło z seeda, żeby każdy miał te same dane logowania.
      await auth.updateProvider("emailpass", { entity_id: bot.email, password: BOT_PASSWORD });
      const [identity] = await auth.listProviderIdentities({ entity_id: bot.email, provider: "emailpass" });
      authIdentityId = identity?.auth_identity_id;
    }
    if (!authIdentityId) throw new Error(`seed-agents: brak tożsamości auth dla ${bot.email}`);

    const [existing] = await customers.listCustomers({ email: bot.email, has_account: true });
    if (existing) {
      await customers.updateCustomers(existing.id, { metadata: { ...existing.metadata, ...metadata } });
    } else {
      await createCustomerAccountWorkflow(container).run({
        input: { authIdentityId, customerData: { ...bot, metadata } },
      });
    }
    logger.info(`seed-agents: bot kupującego ${bot.email} (logowanie: POST /agents/login, role buyer)`);
  }
  logger.info("seed-agents: boty sprzedawców = konta sklepów z seeda (techhurt/laptopol/istacja@example.com, role seller)");
}
