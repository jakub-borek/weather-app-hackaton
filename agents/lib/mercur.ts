// Klient HTTP Mercura dla agentów (kontrakt F00: docs/rfq-contract.md).
// Agent sprzedawcy loguje się jako członek sprzedawcy i widzi tylko swoje negocjacje.
export const API_URL = process.env.API_URL ?? "http://localhost:9000";
// Hasło sprzedawców z seeda (docs/seed-plan.md). Dane lokalnego demo, nie sekret.
const SELLER_PASSWORD = process.env.SELLER_PASSWORD ?? "supersecret";

export type Line = { variant_id: string; quantity: number; unit_price: number };
export type SellerKind = "offer" | "counter" | "final" | "decline";

export type Message = {
  id: string;
  author: "buyer_agent" | "seller_agent" | "system";
  kind: string;
  lines: Line[];
  text: string;
  created_at?: string;
};

export type Pricing = {
  offer_id?: string;
  variant_id: string;
  unit_price: number;
  min_unit_price: number;
  stock: number;
  volume_discounts?: { min_quantity: number; discount_pct: number }[];
};

export type VendorNegotiation = {
  id: string;
  rfq: { id: string; need_text: string; max_rounds: number };
  status: string;
  round: number;
  requested: { variant_id: string; product_title: string; quantity: number }[];
  pricing: Pricing[];
  messages: Message[];
};

export type ApiResult<T> = { ok: true; status: number; body: T } | { ok: false; status: number; body: { code?: string; message?: string } };

async function call<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<ApiResult<T>> {
  const response = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, status: response.status, body: body as T } : { ok: false, status: response.status, body };
}

export type SellerSession = { email: string; sellerId: string; sellerName: string; headers: Record<string, string> };

export async function loginSeller(email: string): Promise<SellerSession> {
  const auth = await call<{ token: string }>("/auth/member/emailpass", {
    method: "POST",
    body: { email, password: SELLER_PASSWORD },
  });
  if (!auth.ok || !auth.body.token) {
    throw new Error(`Logowanie ${email} nieudane (${auth.status}): ${JSON.stringify(auth.body)}`);
  }
  const authorization = `Bearer ${auth.body.token}`;
  // Bez x-seller-id: lista sprzedawców, do których należy członek. Sklep demo ma jednego.
  const sellers = await call<{ seller_members: { seller: { id: string; name: string } }[] }>("/vendor/sellers", {
    headers: { authorization },
  });
  const seller = sellers.ok ? sellers.body.seller_members?.[0]?.seller : undefined;
  if (!seller) {
    throw new Error(`${email}: brak sprzedawcy w /vendor/sellers (${sellers.status}): ${JSON.stringify(sellers.body)}`);
  }
  return { email, sellerId: seller.id, sellerName: seller.name, headers: { authorization, "x-seller-id": seller.id } };
}

export function vendorApi(session: SellerSession) {
  return {
    inbox: () =>
      call<{ negotiations: VendorNegotiation[] }>("/vendor/rfq-negotiations?status=awaiting_seller", {
        headers: session.headers,
      }),
    send: (negotiationId: string, body: { kind: SellerKind; lines: Line[]; text: string }) =>
      call<{ negotiation: { id: string; status: string; round: number } }>(
        `/vendor/rfq-negotiations/${negotiationId}/messages`,
        { method: "POST", headers: session.headers, body }
      ),
  };
}
