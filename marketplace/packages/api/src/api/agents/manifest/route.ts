// GET /agents/manifest?role=buyer|seller: publiczny opis API dla botów, bez logowania.
// Bot może najpierw sprawdzić, co umie, a potem zalogować się przez POST /agents/login.
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { buildManifest, publicBaseUrl, publishableKey } from "../../../lib/agent-manifest";

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const role = req.query.role === "seller" ? "seller" : "buyer";
  res.json({
    login: {
      method: "POST",
      path: "/agents/login",
      body: { email: "<email>", password: "<hasło>", role },
      returns: "token + ten manifest z twoją tożsamością",
    },
    ...buildManifest({
      role,
      baseUrl: publicBaseUrl(req.headers, req.protocol, req.get("host")),
      publishableKey: role === "buyer" ? await publishableKey(req.scope) : undefined,
    }),
  });
}
