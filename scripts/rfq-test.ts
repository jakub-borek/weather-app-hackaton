// Pełny test modułu RFQ przez API: autoryzacja, walidacja, oba wejścia (koszyk z wiadomością i agent),
// wszystkie reguły F04, izolacja sprzedawców, brak wycieku prywatnych pól, zamówienia w bazie.
// Użycie: PK=<publishable key> bun scripts/rfq-test.ts   (lokalnie, po seedzie; wymaga kontenera rfq-postgres)
// Tworzy 2 zamówienia po 2 sztuki i rezerwuje stan. Przed demo: ./scripts/setup-marketplace.sh --reset
const API = process.env.API_URL ?? "http://localhost:9000";
const PK = process.env.PK;
const PASSWORD = "supersecret";
if (!PK) throw new Error("Ustaw PK=<publishable key> (seed wypisuje go na końcu logu)");

type Json = Record<string, any>;
type Headers = Record<string, string>;
let passed = 0;
let failed = 0;

async function call(path: string, method = "GET", body?: unknown, headers: Headers = {}, withKey = true) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(withKey ? { "x-publishable-api-key": PK as string } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Json };
}

function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${ok ? "" : ` -> ${JSON.stringify(detail).slice(0, 240)}`}`);
}
const expectCode = (label: string, res: { status: number; body: Json }, status: number, code?: string) =>
  check(`${label} -> ${status}${code ? ` ${code}` : ""}`, res.status === status && (!code || res.body.code === code), res);

function sql(query: string): string {
  const out = Bun.spawnSync(["docker", "exec", "rfq-postgres", "psql", "-U", "postgres", "-d", "mercur", "-At", "-c", query]);
  return out.stdout.toString().trim();
}

async function variantId(title: string): Promise<string> {
  const { body } = await call(`/store/products?q=${encodeURIComponent(title)}&fields=id,title,variants.id&limit=5`);
  const product = (body.products ?? []).find((p: Json) => p.title === title);
  if (!product) throw new Error(`Brak produktu ${title}`);
  return product.variants[0].id;
}

async function offerId(variant: string, sellerName: string): Promise<string> {
  const { body } = await call(`/store/offers?variant_id=${variant}&limit=50`);
  const offer = (body.offers ?? []).find((o: Json) => o.seller?.name === sellerName);
  if (!offer) throw new Error(`Brak oferty ${sellerName} na ${variant}`);
  return offer.id;
}

async function vendor(email: string, sellerId: string): Promise<Headers> {
  const { body } = await call("/auth/member/emailpass", "POST", { email, password: PASSWORD });
  if (!body.token) throw new Error(`Logowanie ${email} nieudane`);
  return { authorization: `Bearer ${body.token}`, "x-seller-id": sellerId };
}

const view = async (rfqId: string): Promise<Json> => (await call(`/store/rfqs/${rfqId}`)).body.rfq;
const negotiationOf = (rfq: Json, seller: string): Json => rfq.negotiations.find((n: Json) => n.seller.name === seller);
const sellerMsg = (negotiationId: string, headers: Headers, body: Json) =>
  call(`/vendor/rfq-negotiations/${negotiationId}/messages`, "POST", body, headers);
const buyerMsg = (negotiationId: string, body: Json) => call(`/store/rfq-negotiations/${negotiationId}/messages`, "POST", body);

async function testAuthAndValidation(): Promise<void> {
  console.log("\n== Autoryzacja i walidacja");
  expectCode("store bez publishable key", await call("/store/rfqs", "GET", undefined, {}, false), 400);
  expectCode("vendor bez logowania", await call("/vendor/rfq-negotiations"), 401);
  expectCode("POST /store/rfqs bez need_text", await call("/store/rfqs", "POST", {}), 400);
  expectCode("POST /store/rfq-requests bez cart_id", await call("/store/rfq-requests", "POST", { message: "x" }), 400);
  expectCode("nieistniejące RFQ", await call("/store/rfqs/rfq_nie_ma"), 404, "NOT_FOUND");
}

async function testCartFlow(mba: string, t14: string): Promise<void> {
  console.log("\n== Koszyk z wiadomością → negocjacje → akceptacja → zamówienia");
  const { body: regions } = await call("/store/regions");
  const region = (regions.regions ?? []).find((r: Json) => (r.countries ?? []).some((c: Json) => c.iso_2 === "pl"));
  const cart = (await call("/store/carts", "POST", { region_id: region.id })).body.cart;
  await call(`/store/carts/${cart.id}/line-items`, "POST", { offer_id: await offerId(mba, "iStacja"), quantity: 2 });
  await call(`/store/carts/${cart.id}/line-items`, "POST", { offer_id: await offerId(t14, "LaptoPol"), quantity: 2 });

  const created = await call("/store/rfq-requests", "POST", { cart_id: cart.id, message: "Test: prosimy o rabat." });
  expectCode("POST /store/rfq-requests", created, 201);
  const token = created.body.accept_token as string;
  let rfq = created.body.rfq;
  check("status negotiating, 2 wątki (iStacja, LaptoPol)", rfq.status === "negotiating" && rfq.negotiations.length === 2, rfq);
  const ist = negotiationOf(rfq, "iStacja");
  const lap = negotiationOf(rfq, "LaptoPol");
  const first = ist.messages[0];
  check("pierwsza wiadomość: buyer/note z pozycjami tylko tego sprzedawcy", first?.author === "buyer" && first?.lines.length === 1 && first.lines[0].variant_id === mba, first);
  const raw = JSON.stringify(await call(`/store/rfqs/${rfq.id}`));
  check("GET /store/rfqs/:id bez accept_token i min_unit_price", !/accept_token|min_unit_price/.test(raw), "wyciek");

  const istH = await vendor("istacja@example.com", ist.seller.id);
  const lapH = await vendor("laptopol@example.com", lap.seller.id);
  const inbox = (await call("/vendor/rfq-negotiations?status=awaiting_seller", "GET", undefined, istH)).body.negotiations ?? [];
  const mine = inbox.find((n: Json) => n.id === ist.id);
  check("vendor GET: iStacja widzi tylko swój wątek i tylko MacBooka", !!mine && !inbox.some((n: Json) => n.id === lap.id) && mine.requested.length === 1 && mine.requested[0].variant_id === mba, mine);
  check("vendor GET: prywatny pricing z min_unit_price", mine?.pricing?.some((p: Json) => p.min_unit_price > 0), mine?.pricing);

  expectCode("izolacja: iStacja pisze w wątku LaptoPolu", await sellerMsg(lap.id, istH, { kind: "note", text: "hej" }), 404, "NOT_FOUND");
  const note = await sellerMsg(ist.id, istH, { kind: "note", text: "Sprawdzam stan." });
  check("note sprzedawcy -> 200, kolejka bez zmian", note.status === 200 && note.body.negotiation.status === "awaiting_seller", note.body);
  expectCode("pusta note", await sellerMsg(ist.id, istH, { kind: "note", text: " " }), 422, "EMPTY_MESSAGE");
  expectCode("cena poniżej minimum", await sellerMsg(ist.id, istH, { kind: "offer", lines: [{ variant_id: mba, quantity: 2, unit_price: 3000 }] }), 422, "BELOW_MIN_PRICE");
  expectCode("ilość ponad stan", await sellerMsg(ist.id, istH, { kind: "offer", lines: [{ variant_id: mba, quantity: 9999, unit_price: 4600 }] }), 422, "OVER_STOCK");
  expectCode("wariant bez oferty sprzedawcy", await sellerMsg(ist.id, istH, { kind: "offer", lines: [{ variant_id: t14, quantity: 2, unit_price: 4300 }] }), 422, "UNKNOWN_VARIANT");
  expectCode("ujemna cena (walidacja)", await sellerMsg(ist.id, istH, { kind: "offer", lines: [{ variant_id: mba, quantity: 2, unit_price: -1 }] }), 400);

  const offer = await sellerMsg(ist.id, istH, { kind: "offer", lines: [{ variant_id: mba, quantity: 2, unit_price: 4600 }], text: "2 szt. po 4600" });
  check("oferta iStacji -> awaiting_buyer", offer.status === 200 && offer.body.negotiation.status === "awaiting_buyer", offer.body);
  rfq = await view(rfq.id);
  const validUntil = negotiationOf(rfq, "iStacja").messages.at(-1)?.valid_until;
  const minutes = validUntil ? Math.round((new Date(validUntil).getTime() - Date.now()) / 60000) : -1;
  check(`valid_until ustawione (~${minutes} min)`, minutes >= 28 && minutes <= 30, validUntil);
  expectCode("druga oferta bez kolejki", await sellerMsg(ist.id, istH, { kind: "offer", lines: [{ variant_id: mba, quantity: 2, unit_price: 4550 }] }), 422, "NOT_YOUR_TURN");
  expectCode("kupujący stop w nie swojej kolejce (LaptoPol)", await buyerMsg(lap.id, { kind: "stop" }), 422, "NOT_YOUR_TURN");

  const counter = await buyerMsg(ist.id, { kind: "counter", lines: [{ variant_id: mba, quantity: 2, unit_price: 4400 }], text: "4400?" });
  check("kontroferta kupującego -> awaiting_seller", counter.body.negotiation?.status === "awaiting_seller", counter.body);
  const final = await sellerMsg(ist.id, istH, { kind: "final", lines: [{ variant_id: mba, quantity: 2, unit_price: 4450 }], text: "4450 końcowo" });
  check("oferta końcowa iStacji -> final", final.body.negotiation?.status === "final", final.body);
  expectCode("note po ofercie końcowej (czat dalej działa)", await sellerMsg(ist.id, istH, { kind: "note", text: "jeszcze coś" }), 200);
  expectCode("oferta po ofercie końcowej", await sellerMsg(ist.id, istH, { kind: "offer", lines: [{ variant_id: mba, quantity: 2, unit_price: 4600 }] }), 422, "NEGOTIATION_CLOSED");

  await sellerMsg(lap.id, lapH, { kind: "offer", lines: [{ variant_id: t14, quantity: 2, unit_price: 4300 }], text: "2 szt. po 4300" });
  const stop = await buyerMsg(lap.id, { kind: "stop", text: "Bierzemy" });
  check("stop kupującego -> final", stop.body.negotiation?.status === "final", stop.body);
  rfq = await view(rfq.id);
  check("RFQ -> ready, gdy wszystkie wątki końcowe", rfq.status === "ready", rfq.status);
  check(`licznik: oszczędność ${rfq.summary.savings} zł`, rfq.summary.savings > 0 && rfq.summary.best_total === 2 * 4450 + 2 * 4300, rfq.summary);

  expectCode("akceptacja złym tokenem", await call(`/store/rfqs/${rfq.id}/accept`, "POST", { accept_token: "zly", negotiation_ids: [ist.id, lap.id] }), 422, "INVALID_ACCEPT_TOKEN");
  const accepted = await call(`/store/rfqs/${rfq.id}/accept`, "POST", { accept_token: token, negotiation_ids: [ist.id, lap.id] });
  check("akceptacja -> 2 zamówienia", accepted.status === 200 && accepted.body.order_ids?.length === 2, accepted.body);
  const ids = (accepted.body.order_ids ?? []).map((id: string) => `'${id}'`).join(",") || "''";
  const rows = sql(`select s.name || ':' || i.unit_price from order_order_seller_seller l join seller s on s.id=l.seller_id join order_item oi on oi.order_id=l.order_id join order_line_item i on i.id=oi.item_id where l.order_id in (${ids}) order by s.name`);
  check(`zamówienia w bazie po wynegocjowanych cenach i u właściwych sprzedawców (${rows.replace(/\n/g, ", ")})`, /LaptoPol:4300/.test(rows) && /iStacja:4450/.test(rows), rows);
  rfq = await view(rfq.id);
  check("RFQ accepted z order_group_id", rfq.status === "accepted" && !!rfq.order_group_id, rfq.status);
  expectCode("ponowna akceptacja", await call(`/store/rfqs/${rfq.id}/accept`, "POST", { accept_token: token, negotiation_ids: [ist.id] }), 422, "INVALID_STATE");
  const withOrders = (await view(rfq.id)).negotiations as Json[];
  check("każdy wątek ma swoje zamówienie", withOrders.every((n) => n.order?.display_id), withOrders.map((n) => n.order));
  expectCode("czat kupującego po zakupie", await buyerMsg(ist.id, { author: "buyer", kind: "note", text: "Kiedy wysyłka?" }), 200);
  expectCode("czat sprzedawcy po zakupie", await sellerMsg(ist.id, istH, { kind: "note", text: "Jutro." }), 200);
}

async function testAgentFlow(elitebook: string): Promise<void> {
  console.log("\n== Ścieżka agenta: pozycje, limit rund, odmowa, wygaśnięcie");
  const created = await call("/store/rfqs", "POST", { need_text: "Test: 1 EliteBook", max_rounds: 2 });
  expectCode("POST /store/rfqs (draft)", created, 201);
  const token = created.body.accept_token as string;
  const rfqId = created.body.rfq.id as string;
  const drafts = await call("/store/rfqs?status=draft");
  check("GET ?status=draft zawiera RFQ, bez accept_token", drafts.body.rfqs?.some((r: Json) => r.id === rfqId) && !JSON.stringify(drafts.body).includes("accept_token"), drafts.status);
  expectCode("pozycje z nieznanym wariantem", await call(`/store/rfqs/${rfqId}/items`, "POST", { items: [{ variant_id: "variant_nie_ma", quantity: 1 }] }), 422, "UNKNOWN_VARIANT");

  const routed = await call(`/store/rfqs/${rfqId}/items`, "POST", { items: [{ variant_id: elitebook, quantity: 1 }] });
  const names = (routed.body.rfq?.negotiations ?? []).map((n: Json) => n.seller.name).sort().join(",");
  check(`rozesłanie tylko do sprzedawców z ofertą (${names})`, names === "LaptoPol,TechHurt", routed.body);
  expectCode("ponowne pozycje", await call(`/store/rfqs/${rfqId}/items`, "POST", { items: [{ variant_id: elitebook, quantity: 1 }] }), 422, "INVALID_STATE");

  const rfq = routed.body.rfq;
  const th = negotiationOf(rfq, "TechHurt");
  const lp = negotiationOf(rfq, "LaptoPol");
  const thH = await vendor("techhurt@example.com", th.seller.id);
  const lpH = await vendor("laptopol@example.com", lp.seller.id);
  await sellerMsg(th.id, thH, { kind: "offer", lines: [{ variant_id: elitebook, quantity: 1, unit_price: 4400 }] });
  await buyerMsg(th.id, { kind: "counter", lines: [{ variant_id: elitebook, quantity: 1, unit_price: 4200 }] });
  const second = await sellerMsg(th.id, thH, { kind: "counter", lines: [{ variant_id: elitebook, quantity: 1, unit_price: 4300 }] });
  check("limit rund: 2. ruch sprzedawcy wymuszony jako final", second.body.negotiation?.kind === "final" && second.body.negotiation?.status === "final", second.body);
  const decline = await sellerMsg(lp.id, lpH, { kind: "decline", text: "Nie mamy." });
  check("odmowa LaptoPolu -> declined", decline.body.negotiation?.status === "declined", decline.body);
  expectCode("czat w odrzuconym wątku", await buyerMsg(lp.id, { kind: "note", text: "Szkoda" }), 422, "NEGOTIATION_CLOSED");
  check("RFQ -> ready po final + declined", (await view(rfqId)).status === "ready", "status");

  sql(`update rfq_message set created_at = now() - interval '31 minutes' where negotiation_id='${th.id}' and author='seller_agent'`);
  expectCode("akceptacja wygasłej oferty", await call(`/store/rfqs/${rfqId}/accept`, "POST", { accept_token: token, negotiation_ids: [th.id] }), 422, "OFFER_EXPIRED");
  expectCode("akceptacja odrzuconej negocjacji", await call(`/store/rfqs/${rfqId}/accept`, "POST", { accept_token: token, negotiation_ids: [lp.id] }), 422, "INVALID_STATE");
}

async function main(): Promise<void> {
  const mba = await variantId("Apple MacBook Air 13 M4 16 GB / 512 GB");
  const t14 = await variantId("Lenovo ThinkPad T14 Gen 5 16 GB / 512 GB");
  const elitebook = await variantId("HP EliteBook 840 G11 16 GB / 512 GB");
  await testAuthAndValidation();
  await testCartFlow(mba, t14);
  await testAgentFlow(elitebook);
  console.log(`\nWynik: ${passed} OK, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error("Przerwane:", error instanceof Error ? error.message : error);
  process.exit(2);
});
