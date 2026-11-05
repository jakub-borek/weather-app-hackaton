// Log przebiegu negocjacji: linie na konsolę i raport Markdown (last-run.md) z "myślami" agentów.
import { latestSellerOffer, linesTotal, type Line, type MoveError, type Negotiation } from "./backend-mock.ts";

export type Actor = "seller" | "buyer" | "system";

export interface TranscriptEntry {
  negotiationId: string;
  sellerName: string;
  actor: Actor;
  attempt: number;
  kind: string;
  lines: Line[];
  text: string;
  reasoning: string;
  ms: number;
  thought?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: MoveError;
}

export interface RunInfo {
  runtime: string;
  startedAt: Date;
  wallMs: number;
  maxRounds: number;
  needText: string;
}

export class Transcript {
  private entries: readonly TranscriptEntry[] = [];

  add(entry: TranscriptEntry): void {
    this.entries = [...this.entries, entry];
  }

  all(): readonly TranscriptEntry[] {
    return this.entries;
  }
}

const ACTOR_LABEL: Record<Actor, string> = { seller: "sprzedawca", buyer: "kupujący", system: "system" };
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
const zl = (value: number): string => `${value.toLocaleString("pl-PL")} zł`;

export function variantLabels(negotiations: Negotiation[]): Map<string, string> {
  const items = negotiations.flatMap((negotiation) => negotiation.requested);
  return new Map(items.map((item) => [item.variant_id, item.product_title.split(" ").slice(0, 3).join(" ")]));
}

export function describeLines(lines: Line[], labels: Map<string, string>): string {
  return lines.map((line) => `${line.quantity}× ${labels.get(line.variant_id) ?? line.variant_id} po ${zl(line.unit_price)}`).join(", ");
}

export function formatLive(entry: TranscriptEntry, labels: Map<string, string>): string {
  const head = `[${entry.sellerName}] ${ACTOR_LABEL[entry.actor]} → ${entry.kind}${entry.attempt > 1 ? ` (próba ${entry.attempt})` : ""}${entry.ms ? ` · ${seconds(entry.ms)}` : ""}`;
  const body = entry.lines.length > 0 ? `\n    ${describeLines(entry.lines, labels)}` : "";
  const reasoning = entry.reasoning ? `\n    myśl agenta: ${entry.reasoning}` : "";
  const thought = entry.thought ? `\n    myśl modelu: ${entry.thought.replace(/\s+/g, " ").slice(0, 240)}` : "";
  const error = entry.error ? `\n    ✗ odrzucone: ${entry.error.code}: ${entry.error.message}` : "";
  return `${head}${body}${reasoning}${thought}${error}`;
}

interface SummaryRow {
  seller: string;
  status: string;
  rounds: number;
  lines: Line[];
  total: number;
  listTotal: number;
}

function summarize(negotiations: Negotiation[]): SummaryRow[] {
  return negotiations.map((negotiation) => {
    const lines = negotiation.status === "declined" ? [] : latestSellerOffer(negotiation)?.lines ?? [];
    const listTotal = lines.reduce((sum, line) => {
      const item = negotiation.requested.find((candidate) => candidate.variant_id === line.variant_id);
      return sum + line.quantity * (item?.list_unit_price ?? line.unit_price);
    }, 0);
    return { seller: negotiation.seller.name, status: negotiation.status, rounds: negotiation.round, lines, total: linesTotal(lines), listTotal };
  });
}

function statsSection(info: RunInfo, entries: readonly TranscriptEntry[]): string[] {
  const calls = entries.filter((entry) => entry.actor !== "system");
  const timed = calls.filter((entry) => entry.ms > 0).map((entry) => entry.ms);
  const rejected = entries.filter((entry) => entry.error);
  const byCode = [...new Set(rejected.map((entry) => entry.error?.code))].map((code) => `${code}: ${rejected.filter((entry) => entry.error?.code === code).length}`);
  const sum = (pick: (entry: TranscriptEntry) => number | undefined): number => calls.reduce((total, entry) => total + (pick(entry) ?? 0), 0);
  const cost = sum((entry) => entry.costUsd);
  const usage = cost > 0
    ? [`- Zużycie wg CLI: ${sum((entry) => entry.inputTokens).toLocaleString("pl-PL")} tokenów wejścia, ${sum((entry) => entry.outputTokens).toLocaleString("pl-PL")} wyjścia, równowartość ${cost.toFixed(2)} USD (przy logowaniu subskrypcją schodzi z tygodniowej puli)`]
    : [];
  return [
    `- Runtime: ${info.runtime}`,
    `- Start: ${info.startedAt.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}, czas całości: ${seconds(info.wallMs)}`,
    `- Zapytanie: „${info.needText}", max ${info.maxRounds} rundy na sprzedawcę`,
    `- Wywołania modelu: ${calls.length}${timed.length ? `, średnio ${seconds(timed.reduce((a, b) => a + b, 0) / timed.length)}, najdłużej ${seconds(Math.max(...timed))}` : ""}`,
    `- Ruchy odrzucone przez backend lub parser: ${rejected.length}${byCode.length ? ` (${byCode.join(", ")})` : ""}`,
    ...usage,
  ];
}

function summaryTable(negotiations: Negotiation[], labels: Map<string, string>): string[] {
  const rows = summarize(negotiations).map((row) => {
    const savings = row.listTotal - row.total;
    const pct = row.listTotal > 0 ? ` (${((savings / row.listTotal) * 100).toFixed(1)}%)` : "";
    return `| ${row.seller} | ${row.status} | ${row.rounds} | ${describeLines(row.lines, labels) || "—"} | ${zl(row.total)} | ${zl(row.listTotal)} | ${zl(savings)}${pct} |`;
  });
  return ["| Sprzedawca | Status | Rundy | Oferta końcowa | Suma | Wg cennika | Oszczędność |", "|---|---|---|---|---|---|---|", ...rows];
}

function negotiationSection(negotiation: Negotiation, entries: readonly TranscriptEntry[], labels: Map<string, string>): string[] {
  const mine = entries.filter((entry) => entry.negotiationId === negotiation.id);
  const steps = mine.map((entry, index) => {
    const lines = entry.lines.length > 0 ? ` ${describeLines(entry.lines, labels)}.` : "";
    const meta = [entry.ms ? seconds(entry.ms) : "", entry.attempt > 1 ? `próba ${entry.attempt}` : ""].filter(Boolean).join(", ");
    return [
      `${index + 1}. **${ACTOR_LABEL[entry.actor]} · ${entry.kind}**${meta ? ` (${meta})` : ""}:${lines} ${entry.text ? `„${entry.text}"` : ""}`,
      ...(entry.reasoning ? [`   - myśl agenta: ${entry.reasoning}`] : []),
      ...(entry.thought ? [`   - myśl modelu: ${entry.thought.replace(/\s+/g, " ")}`] : []),
      ...(entry.error ? [`   - ✗ odrzucone: \`${entry.error.code}\`: ${entry.error.message}`] : []),
    ].join("\n");
  });
  return [`### ${negotiation.seller.name} (styl: ${negotiation.seller.style})`, "", ...steps, ""];
}

export function renderReport(info: RunInfo, negotiations: Negotiation[], entries: readonly TranscriptEntry[]): string {
  const labels = variantLabels(negotiations);
  return [
    "# PoC Grok: ostatni przebieg negocjacji",
    "",
    "Plik nadpisuje `bun agents/poc-grok/negotiate.ts`. Logika i decyzje: `README.md` obok.",
    "",
    ...statsSection(info, entries),
    "",
    "## Wynik",
    "",
    ...summaryTable(negotiations, labels),
    "",
    "## Przebieg (z myślami agentów)",
    "",
    ...negotiations.flatMap((negotiation) => negotiationSection(negotiation, entries, labels)),
  ].join("\n");
}
