// Zakłada konto Grok Bota kupującego: klient Medusy oznaczony jako agent, z właścicielem (człowiekiem).
// Token akceptacji RFQ utworzonych przez bota trafia do metadata właściciela, nie do bota.
// Użycie: bun agents/create-bot-account.ts <email> <hasło> [email_właściciela]
// Zmienne: API_URL (domyślnie http://localhost:9000), ADMIN_EMAIL / ADMIN_PASSWORD (domyślnie admin z setupu).
export {};

const API = process.env.API_URL ?? "http://localhost:9000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "supersecret";
const DEFAULT_OWNER = "zakupy@firma-demo.pl";

const [email, password, ownerEmail = DEFAULT_OWNER] = process.argv.slice(2);
if (!email || !password) {
  console.error("Użycie: bun agents/create-bot-account.ts <email> <hasło> [email_właściciela]");
  process.exit(1);
}

type Json = Record<string, any>;
async function call(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", "ngrok-skip-browser-warning": "1", ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Json };
}

const manifest = await call("/agents/manifest?role=buyer");
const pk = manifest.body.headers?.["x-publishable-api-key"] as string;
if (!pk || pk.startsWith("<")) throw new Error(`Brak publishable key z /agents/manifest: ${JSON.stringify(manifest.body)}`);

const admin = await call("/auth/user/emailpass", { method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
if (!admin.body.token) throw new Error(`Logowanie admina nieudane: ${JSON.stringify(admin.body)}`);
const adminHeaders = { authorization: `Bearer ${admin.body.token}` };

async function findCustomer(mail: string): Promise<Json | undefined> {
  const { body } = await call(`/admin/customers?email=${encodeURIComponent(mail)}`, { headers: adminHeaders });
  return (body.customers ?? []).find((c: Json) => c.email === mail);
}

// Właściciel musi istnieć jako klient, żeby było gdzie odłożyć token akceptacji.
if (!(await findCustomer(ownerEmail))) {
  const created = await call("/admin/customers", { method: "POST", headers: adminHeaders, body: { email: ownerEmail, company_name: "Firma Demo" } });
  if (created.status >= 300) throw new Error(`Nie udało się założyć właściciela: ${JSON.stringify(created.body)}`);
  console.log(`Założono klienta-właściciela ${ownerEmail}`);
}

let bot = await findCustomer(email);
if (!bot?.has_account) {
  const registered = await call("/auth/customer/emailpass/register", { method: "POST", body: { email, password } });
  if (!registered.body.token) throw new Error(`Rejestracja ${email} nieudana: ${JSON.stringify(registered.body)}`);
  const created = await call("/store/customers", {
    method: "POST",
    headers: { authorization: `Bearer ${registered.body.token}`, "x-publishable-api-key": pk },
    body: { email, first_name: "Grok", last_name: "Bot" },
  });
  if (!created.body.customer) throw new Error(`Zakładanie klienta ${email} nieudane: ${JSON.stringify(created.body)}`);
  bot = created.body.customer;
}

const flagged = await call(`/admin/customers/${bot!.id}`, {
  method: "POST",
  headers: adminHeaders,
  body: { metadata: { agent: true, owner_email: ownerEmail } },
});
if (flagged.status >= 300) throw new Error(`Nie udało się oznaczyć bota: ${JSON.stringify(flagged.body)}`);
console.log(`Bot ${email} gotowy (customer ${bot!.id}), właściciel ${ownerEmail}. Logowanie: POST ${API}/agents/login`);
