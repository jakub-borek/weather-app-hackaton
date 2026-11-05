// GET /agents/docs/<klucz agenta>: dokument dla Grok Bota (markdown), który klient kopiuje z konta w sklepie.
// Klucz w ścieżce, bo bot dostaje jeden URL. Zły klucz -> 404, żeby nie zdradzać, czy konto istnieje.
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { renderAgentDoc } from "../../../../lib/agent-docs";
import { publicUrls, resolveAgentKey } from "../../../../lib/agent-key";
import { publishableKey } from "../../../../lib/agent-manifest";

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const key = String(req.params.key ?? "");
  const customer = await resolveAgentKey(req.scope, key);
  if (!customer) {
    res.status(404).type("text/plain; charset=utf-8").send("Nieznany klucz agenta. Skopiuj aktualny URL z konta w sklepie.");
    return;
  }
  const urls = await publicUrls(req);
  const doc = renderAgentDoc({
    email: customer.email,
    key,
    apiUrl: urls.api,
    storeUrl: urls.store,
    publishableKey: await publishableKey(req.scope),
  });
  res.status(200).type("text/markdown; charset=utf-8").send(doc);
}
