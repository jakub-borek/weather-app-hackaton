// Klucz API agenta zakupowego: klient sklepu dostaje go w koncie i wkleja Grok Botowi razem z URL-em dokumentu.
// Format rfqk.<customer_id>.<sekret>, sekret w metadata klienta (bez migracji). Klucz działa tylko na /agents/*,
// więc bot nie odczyta metadata klienta i nie zobaczy tokenów akceptacji (akceptuje człowiek w sklepie).
import { randomBytes, timingSafeEqual } from "node:crypto";
import { authenticate, AuthenticatedMedusaRequest, MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { publicBaseUrl } from "./agent-manifest";

const PREFIX = "rfqk";
const NGROK_INSPECT_PORTS = [4040, 4041, 4042];

type Customer = { id: string; email: string; metadata?: Record<string, unknown> | null };

export const makeAgentKey = (customerId: string): string => `${PREFIX}.${customerId}.${randomBytes(18).toString("base64url")}`;

export const acceptTokensOf = (customer: Customer): Record<string, string> =>
  (customer.metadata?.rfq_accept_tokens as Record<string, string> | undefined) ?? {};

export async function resolveAgentKey(container: MedusaContainer, key: string): Promise<Customer | null> {
  const [prefix, customerId] = key.split(".");
  if (prefix !== PREFIX || !customerId) return null;
  const customer = (await container
    .resolve(Modules.CUSTOMER)
    .retrieveCustomer(customerId)
    .catch(() => null)) as Customer | null;
  const stored = customer?.metadata?.agent_key;
  if (!customer || typeof stored !== "string" || stored.length !== key.length) return null;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(key)) ? customer : null;
}

// Klucz istniejący albo nowy (tworzony przy pierwszym wejściu do konta, czyli zaraz po rejestracji).
export async function ensureAgentKey(container: MedusaContainer, customerId: string): Promise<{ customer: Customer; key: string }> {
  const customers = container.resolve(Modules.CUSTOMER);
  const customer = (await customers.retrieveCustomer(customerId)) as Customer;
  const existing = customer.metadata?.agent_key;
  if (typeof existing === "string") return { customer, key: existing };
  const key = makeAgentKey(customerId);
  const updated = (await customers.updateCustomers(customerId, { metadata: { ...customer.metadata, agent_key: key } })) as Customer;
  return { customer: updated, key };
}

export async function storeAcceptToken(container: MedusaContainer, customerId: string, rfqId: string, token: string): Promise<void> {
  const customers = container.resolve(Modules.CUSTOMER);
  const customer = (await customers.retrieveCustomer(customerId)) as Customer;
  await customers.updateCustomers(customerId, {
    metadata: { ...customer.metadata, rfq_accept_tokens: { ...acceptTokensOf(customer), [rfqId]: token } },
  });
}

export function agentKeyFrom(headers: Record<string, unknown>): string | undefined {
  const header = headers["x-agent-key"];
  if (typeof header === "string" && header) return header.trim();
  const bearer = String(headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  return bearer.startsWith(`${PREFIX}.`) ? bearer : undefined;
}

const bearerCustomer = authenticate("customer", ["bearer"]);

// /agents/*: klucz agenta (x-agent-key) albo, jak dotąd, JWT klienta z POST /agents/login.
export async function agentAuth(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction): Promise<void> {
  const key = agentKeyFrom(req.headers);
  if (!key) return bearerCustomer(req, res, next);
  const customer = await resolveAgentKey(req.scope, key);
  if (!customer) {
    res.status(401).json({ code: "INVALID_AGENT_KEY", message: "Nieznany klucz agenta. Weź aktualny z konta w sklepie." });
    return;
  }
  (req as AuthenticatedMedusaRequest).auth_context = {
    actor_id: customer.id,
    actor_type: "customer",
    auth_identity_id: "",
    app_metadata: { agent_key: true },
    user_metadata: {},
  };
  next();
}

// Publiczne adresy dla bota w chmurze: env, potem tunel ngrok (lokalne API inspektora), na końcu adres z żądania.
async function ngrokUrl(port: number): Promise<string | undefined> {
  for (const inspect of NGROK_INSPECT_PORTS) {
    const data = (await fetch(`http://127.0.0.1:${inspect}/api/tunnels`, { signal: AbortSignal.timeout(400) })
      .then((r) => r.json())
      .catch(() => null)) as { tunnels?: { public_url: string; config?: { addr?: string } }[] } | null;
    const tunnel = data?.tunnels?.find((t) => t.public_url.startsWith("https") && t.config?.addr?.endsWith(`:${port}`));
    if (tunnel) return tunnel.public_url;
  }
  return undefined;
}

export async function publicUrls(req: MedusaRequest): Promise<{ api: string; store: string }> {
  const fromRequest = publicBaseUrl(req.headers, req.protocol, req.get("host"));
  const api = process.env.AGENT_PUBLIC_API_URL ?? (await ngrokUrl(9000)) ?? fromRequest;
  const store = process.env.AGENT_PUBLIC_STORE_URL ?? (await ngrokUrl(3000)) ?? "http://localhost:3000";
  return { api: api.replace(/\/$/, ""), store: store.replace(/\/$/, "") };
}
