// Szybki przebieg RFQ przez API (F03/F04/F08). Wzór klienta dla agentów (S3) i UI (S4).
// Użycie: PK=<publishable key z logu seeda> bun scripts/rfq-smoke.ts
// Tworzy prawdziwe zamówienia i rezerwuje stan. Przed demo: ./scripts/setup-marketplace.sh --reset
const API = process.env.API_URL ?? "http://localhost:9000";
const PK = process.env.PK;
const PASSWORD = "supersecret";
if (!PK) {
  throw new Error("Ustaw PK=<publishable key> (seed wypisuje go na końcu logu)");
}

type Json = Record<string, any>;

async function call(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", "x-publishable-api-key": PK as string, ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await response.json().catch(() => ({}))) as Json;
  return { status: response.status, body };
}

async function variantId(title: string): Promise<string> {
  const { body } = await call(`/store/products?q=${encodeURIComponent(title)}&fields=id,title,variants.id&limit=5`);
  const product = (body.products ?? []).find((p: Json) => p.title === title);
  if (!product) throw new Error(`Nie znaleziono produktu ${title}`);
  return product.variants[0].id;
}

async function sellerHeaders(email: string, sellerId: string): Promise<Record<string, string>> {
  const { body } = await call("/auth/member/emailpass", { method: "POST", body: { email, password: PASSWORD } });
  if (!body.token) throw new Error(`Logowanie ${email} nieudane: ${JSON.stringify(body)}`);
  return { authorization: `Bearer ${body.token}`, "x-seller-id": sellerId };
}

const expect = (label: string, ok: boolean, detail: unknown) =>
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${ok ? "" : ` -> ${JSON.stringify(detail).slice(0, 300)}`}`);

async function main(): Promise<void> {
  const created = await call("/store/rfqs", { method: "POST", body: { need_text: "20 MacBooków i 10 HP", max_rounds: 3 } });
  expect("POST /store/rfqs", created.status === 201 && !!created.body.accept_token, created.body);
  const rfqId = created.body.rfq.id as string;

  const mba = await variantId("Apple MacBook Air 13 M4 16 GB / 512 GB");
  const hp = await variantId("HP EliteBook 840 G11 16 GB / 512 GB");
  const routed = await call(`/store/rfqs/${rfqId}/items`, {
    method: "POST",
    body: { items: [{ variant_id: mba, quantity: 20 }, { variant_id: hp, quantity: 10 }] },
  });
  const negotiations = (routed.body.rfq?.negotiations ?? []) as Json[];
  expect(`items -> ${negotiations.map((n) => n.seller.name).join(", ")}`, negotiations.length >= 2, routed.body);
  expect("store API bez accept_token i min ceny", !JSON.stringify(routed.body).match(/accept_token|min_unit_price/), "leak");

  const bySeller = (name: string) => negotiations.find((n) => n.seller.name === name) as Json;
  const istacja = bySeller("iStacja");
  const laptopol = bySeller("LaptoPol");
  const istacjaHeaders = await sellerHeaders("istacja@example.com", istacja.seller.id);
  const laptopolHeaders = await sellerHeaders("laptopol@example.com", laptopol.seller.id);

  const inbox = await call("/vendor/rfq-negotiations?status=awaiting_seller", { headers: istacjaHeaders });
  const mine = (inbox.body.negotiations ?? []).find((n: Json) => n.id === istacja.id);
  expect("vendor GET z prywatnym pricing", !!mine?.pricing?.[0]?.min_unit_price, inbox.body);

  const msg = (negotiationId: string, headers: Record<string, string>, body: Json) =>
    call(`/vendor/rfq-negotiations/${negotiationId}/messages`, { method: "POST", headers, body });
  const tooLow = await msg(istacja.id, istacjaHeaders, { kind: "offer", lines: [{ variant_id: mba, quantity: 20, unit_price: 3000 }] });
  expect("guardrail BELOW_MIN_PRICE", tooLow.status === 422 && tooLow.body.code === "BELOW_MIN_PRICE", tooLow.body);
  const tooMany = await msg(istacja.id, istacjaHeaders, { kind: "offer", lines: [{ variant_id: mba, quantity: 999, unit_price: 4600 }] });
  expect("guardrail OVER_STOCK", tooMany.status === 422 && tooMany.body.code === "OVER_STOCK", tooMany.body);

  const offer1 = await msg(istacja.id, istacjaHeaders, {
    kind: "offer",
    lines: [{ variant_id: mba, quantity: 20, unit_price: 4600 }],
    text: "20 sztuk od ręki, 4600 zł/szt.",
  });
  expect("oferta iStacja", offer1.status === 200, offer1.body);
  const offer2 = await msg(laptopol.id, laptopolHeaders, {
    kind: "final",
    lines: [{ variant_id: hp, quantity: 10, unit_price: 4300 }],
    text: "10 sztuk, cena końcowa 4300 zł/szt.",
  });
  expect("oferta końcowa LaptoPol", offer2.status === 200 && offer2.body.negotiation.status === "final", offer2.body);
  const again = await msg(istacja.id, istacjaHeaders, { kind: "counter", lines: [{ variant_id: mba, quantity: 20, unit_price: 4550 }] });
  expect("guardrail NOT_YOUR_TURN", again.status === 422 && again.body.code === "NOT_YOUR_TURN", again.body);

  const stop = await call(`/store/rfq-negotiations/${istacja.id}/messages`, { method: "POST", body: { kind: "stop", text: "Bierzemy." } });
  expect("kupujący stop", stop.status === 200 && stop.body.negotiation.status === "final", stop.body);

  const badAccept = await call(`/store/rfqs/${rfqId}/accept`, {
    method: "POST",
    body: { accept_token: "zly", negotiation_ids: [istacja.id, laptopol.id] },
  });
  expect("guardrail INVALID_ACCEPT_TOKEN", badAccept.status === 422 && badAccept.body.code === "INVALID_ACCEPT_TOKEN", badAccept.body);

  const accepted = await call(`/store/rfqs/${rfqId}/accept`, {
    method: "POST",
    body: { accept_token: created.body.accept_token, negotiation_ids: [istacja.id, laptopol.id] },
  });
  expect(`accept -> ${accepted.body.order_ids?.length ?? 0} zamówienia`, accepted.status === 200 && accepted.body.order_ids?.length === 2, accepted.body);
  console.log(`RFQ ${rfqId}: status ${accepted.body.rfq?.status}, summary ${JSON.stringify(accepted.body.rfq?.summary)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
