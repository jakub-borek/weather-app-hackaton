// PoC: agent kupującego i agenci sprzedawców negocjują RFQ, a model to Grok z subskrypcji (Grok Build CLI).
// Uruchom: bun agents/poc-grok/negotiate.ts [mock|grok]. Logika i decyzje: README.md obok.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUYER_KINDS, SELLER_KINDS, buyerInput, mockDecide, parseDecision, sellerInput, type AgentContext } from "./agents.ts";
import { MockRfqBackend, NEED_TEXT, createDemoNegotiations, type MoveError, type MoveResult } from "./backend-mock.ts";
import { grokBotRuntime } from "./grokbot.ts";
import { grokRuntime, mockRuntime, type AskInput, type AskOutput, type GrokOptions, type LlmRuntime } from "./llm.ts";
import { Transcript, formatLive, renderReport, variantLabels, type TranscriptEntry } from "./report.ts";

const MAX_ATTEMPTS = 3; // tyle razy agent może poprawić ruch po odrzuceniu przez backend
const MAX_STEPS = 20; // bezpiecznik pętli
const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIMES = ["mock", "grok", "grokbot"] as const;

type Runtime = (typeof RUNTIMES)[number];
type Side = "seller" | "buyer";

interface Config {
  runtime: Runtime;
  maxRounds: number;
  sellers: string[];
  grok: GrokOptions;
}

interface Deps {
  backend: MockRfqBackend;
  llm: LlmRuntime<AgentContext>;
  transcript: Transcript;
  labels: Map<string, string>;
}

function isRuntime(value: string): value is Runtime {
  return (RUNTIMES as readonly string[]).includes(value);
}

function readConfig(): Config {
  const runtime = process.argv[2] ?? process.env.LLM ?? "mock";
  if (!isRuntime(runtime)) throw new Error(`Nieznany runtime "${runtime}". Użyj: ${RUNTIMES.join(", ")}`);
  const maxRounds = Number(process.env.MAX_ROUNDS ?? 3);
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 6) throw new Error("MAX_ROUNDS musi być liczbą 1-6");
  const timeoutMs = Number(process.env.GROK_TIMEOUT_MS ?? 120_000);
  return {
    runtime,
    maxRounds,
    sellers: (process.env.SELLERS ?? "").split(",").map((handle) => handle.trim()).filter(Boolean),
    grok: { model: process.env.GROK_MODEL || undefined, effort: process.env.GROK_EFFORT || undefined, timeoutMs },
  };
}

function record(deps: Deps, entry: TranscriptEntry): void {
  deps.transcript.add(entry);
  console.log(formatLive(entry, deps.labels));
}

// Jeden ruch agenta: model → parser → backend. Odrzucenie wraca do agenta w następnym prompcie.
async function takeTurn(side: Side, id: string, deps: Deps): Promise<void> {
  const base = { negotiationId: id, sellerName: deps.backend.get(id).seller.name, actor: side };
  let lastError: MoveError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const negotiation = deps.backend.get(id);
    const input: AskInput<AgentContext> =
      side === "seller" ? sellerInput(negotiation, lastError) : buyerInput(negotiation, deps.backend.list(), lastError);
    const answer: AskOutput | { failure: string } = await deps.llm
      .ask(input)
      .catch((error: unknown) => ({ failure: error instanceof Error ? error.message : String(error) }));
    if ("failure" in answer) {
      lastError = { code: "LLM_ERROR", message: answer.failure };
      record(deps, { ...base, attempt, kind: "—", lines: [], text: "", reasoning: "", ms: 0, error: lastError });
      continue;
    }
    const { text: rawText, ...meta } = answer;
    const parsed = parseDecision(rawText, side === "seller" ? SELLER_KINDS : BUYER_KINDS);
    if (!parsed.ok) {
      lastError = parsed.error;
      record(deps, { ...base, ...meta, attempt, kind: "—", lines: [], text: rawText.slice(0, 200), reasoning: "", error: lastError });
      continue;
    }
    const result: MoveResult = side === "seller" ? deps.backend.sellerMove(id, parsed.decision) : deps.backend.buyerMove(id, parsed.decision);
    record(deps, { ...base, ...meta, attempt, ...parsed.decision, error: result.ok ? undefined : result.error });
    if (result.ok) return;
    lastError = result.error;
  }
  const text = `Agent (${side}) nie zrobił poprawnego ruchu w ${MAX_ATTEMPTS} próbach, negocjacja zamknięta.`;
  deps.backend.forceClose(id, side === "seller" ? "declined" : "final", text);
  record(deps, { ...base, actor: "system", attempt: 1, kind: "note", lines: [], text, reasoning: "", ms: 0 });
}

// Rundy synchroniczne: najpierw wszyscy sprzedawcy naraz, potem kupujący wobec każdego z nich.
async function negotiate(deps: Deps): Promise<void> {
  for (let step = 0; step < MAX_STEPS && !deps.backend.allClosed(); step++) {
    const side: Side = step % 2 === 0 ? "seller" : "buyer";
    const waiting = deps.backend.list().filter((negotiation) => negotiation.status === `awaiting_${side}`);
    console.log(`\n--- ${side === "seller" ? "Ruch sprzedawców" : "Ruch kupującego"} (${waiting.length}) ---`);
    if (deps.llm.sequential) {
      for (const negotiation of waiting) await takeTurn(side, negotiation.id, deps);
    } else {
      await Promise.all(waiting.map((negotiation) => takeTurn(side, negotiation.id, deps)));
    }
  }
}

function createRuntime(config: Config): LlmRuntime<AgentContext> {
  if (config.runtime === "grok") return grokRuntime(config.grok);
  if (config.runtime === "mock") return mockRuntime(mockDecide);
  const agentId = process.env.GROKBOT_AGENT_ID ?? "";
  if (!agentId) throw new Error("Ustaw GROKBOT_AGENT_ID (id bota z aplikacji Grok Bot, np. z linku do bota)");
  const timeoutMs = Number(process.env.GROKBOT_TIMEOUT_MS ?? 300_000);
  return grokBotRuntime({ agentId, inboxDir: join(HERE, ".grokbot"), timeoutMs });
}

async function main(): Promise<void> {
  const config = readConfig();
  const negotiations = createDemoNegotiations(config.maxRounds, config.sellers);
  if (negotiations.length === 0) throw new Error(`Brak sprzedawców dla SELLERS=${config.sellers.join(",")}`);
  const llm = createRuntime(config);
  const deps: Deps = { backend: new MockRfqBackend(negotiations), llm, transcript: new Transcript(), labels: variantLabels(negotiations) };
  const startedAt = new Date();
  console.log(`RFQ „${NEED_TEXT}" · ${negotiations.map((n) => n.seller.name).join(", ")} · runtime: ${llm.name}`);

  await negotiate(deps);

  const info = { runtime: llm.name, startedAt, wallMs: Date.now() - startedAt.getTime(), maxRounds: config.maxRounds, needText: NEED_TEXT };
  const reportPath = join(HERE, "last-run.md");
  writeFileSync(reportPath, renderReport(info, deps.backend.list(), deps.transcript.all()));
  console.log(`\nGotowe w ${(info.wallMs / 1000).toFixed(1)} s. Raport: ${reportPath}`);
}

main().catch((error: unknown) => {
  console.error(`BŁĄD: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
