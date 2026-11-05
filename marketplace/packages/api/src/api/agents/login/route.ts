// POST /agents/login { email, password, role: "buyer" | "seller" } (Grok boty i inni agenci).
// buyer loguje konto klienta, seller konto członka sklepu. Ten sam mechanizm co /auth/{customer|member}/emailpass,
// a w odpowiedzi od razu manifest: dostępne endpointy, nagłówki, dostęp do RFQ i reguły.
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { generateJwtTokenWithChecks } from "@medusajs/medusa/api/auth/utils/generate-jwt-token";
import { buildManifest, publicBaseUrl, publishableKey } from "../../../lib/agent-manifest";
import type { AgentLoginBody } from "../../middlewares";

const ACTOR_BY_ROLE = { buyer: "customer", seller: "member" } as const;

async function sellerOfMember(req: MedusaRequest, memberId: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "seller_member",
    fields: ["seller.id", "seller.name"],
    filters: { member_id: memberId },
  });
  return (data[0] as { seller?: { id: string; name: string } } | undefined)?.seller;
}

export async function POST(req: MedusaRequest<AgentLoginBody>, res: MedusaResponse): Promise<void> {
  const { email, password, role } = req.validatedBody;
  const actorType = ACTOR_BY_ROLE[role];
  // Tak samo jak trasa Medusy /auth/:actor_type/:auth_provider (actor_type nie ma w typie AuthenticationInput).
  const authData = {
    actor_type: actorType,
    url: req.url,
    headers: req.headers as Record<string, string>,
    query: {},
    body: { email, password },
    protocol: req.protocol,
  };
  const { success, authIdentity } = await req.scope.resolve(Modules.AUTH).authenticate("emailpass", authData);
  const actorId = authIdentity?.app_metadata?.[`${actorType}_id`] as string | undefined;
  if (!success || !authIdentity || !actorId) {
    res.status(401).json({ code: "INVALID_CREDENTIALS", message: `Złe dane logowania albo konto nie ma roli ${role}` });
    return;
  }
  const { token } = (await generateJwtTokenWithChecks(req.scope, {
    authIdentity,
    actorType,
    authProvider: "emailpass",
  })) as { token: string };

  let identity: Record<string, unknown> = { email, [`${actorType}_id`]: actorId };
  if (role === "seller") {
    const seller = await sellerOfMember(req, actorId);
    if (!seller) {
      res.status(403).json({ code: "NO_SELLER", message: "Konto członka nie należy do żadnego sklepu" });
      return;
    }
    identity = { ...identity, seller_id: seller.id, seller_name: seller.name };
  }

  res.json({
    token,
    token_type: "Bearer",
    ...buildManifest({
      role,
      identity,
      baseUrl: publicBaseUrl(req.headers, req.protocol, req.get("host")),
      publishableKey: role === "buyer" ? await publishableKey(req.scope) : undefined,
    }),
  });
}
