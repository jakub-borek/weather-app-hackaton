// Runtime modelu dla agentów PoC.
// - "grok": Grok Build CLI w trybie headless (`grok -p`). Loguje się kontem z subskrypcją, bez XAI_API_KEY.
// - "mock": deterministyczna strategia, żeby sprawdzić pętlę negocjacji bez modelu.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";

export type AgentRole = "seller" | "buyer";

export interface AskInput<C> {
  role: AgentRole;
  system: string;
  prompt: string;
  context: C;
}

export interface AskOutput {
  text: string;
  ms: number;
  thought?: string; // skrót rozumowania modelu, jeśli runtime go zwraca (grok: pole "thought")
  costUsd?: number; // koszt wg CLI; przy logowaniu subskrypcją schodzi z tygodniowej puli, nie z karty
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmRuntime<C> {
  name: string;
  sequential?: boolean; // true: ruchy po kolei (np. Grok Bot, gdzie każdy ruch wymaga kliknięcia)
  ask(input: AskInput<C>): Promise<AskOutput>;
}

export interface GrokOptions {
  bin?: string;
  model?: string;
  effort?: string;
  maxTurns?: number;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TURNS = 3;
const INSTALL_HINT =
  "Zainstaluj: curl -fsSL https://x.ai/cli/install.sh | bash, potem uruchom `grok` raz i zaloguj się kontem z subskrypcją.";

function onPath(name: string): string | null {
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  return dirs.map((dir) => join(dir, name)).find((candidate) => existsSync(candidate)) ?? null;
}

export function findGrokBin(explicit?: string): string | null {
  const known = [explicit, join(homedir(), ".grok", "bin", "grok")].filter((p): p is string => Boolean(p));
  return known.find((candidate) => existsSync(candidate)) ?? onPath("grok");
}

// Grok Build to agent do kodowania (ma basha i edycję plików). Odcinamy go od repo:
// pracuje w pustym katalogu tymczasowym, a instrukcja każe mu odpowiedzieć samym JSON-em.
function buildGrokArgs<C>(input: AskInput<C>, cwd: string, options: GrokOptions): string[] {
  return [
    "-p",
    input.prompt,
    "--rules",
    input.system,
    "--output-format",
    "json",
    "--cwd",
    cwd,
    "--max-turns",
    String(options.maxTurns ?? DEFAULT_MAX_TURNS),
    ...(options.model ? ["-m", options.model] : []),
    ...(options.effort ? ["--effort", options.effort] : []),
  ];
}

interface GrokJson {
  text: string;
  thought?: string;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
}

// `--output-format json` (grok 1.0.70) zwraca jeden obiekt:
// { text, stopReason, sessionId, requestId, cwd, thought, usage, num_turns, total_cost_usd, modelUsage }.
function parseGrokOutput(stdout: string): Omit<AskOutput, "ms"> {
  const trimmed = stdout.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`grok nie zwrócił JSON-a: ${trimmed.slice(0, 300)}`);
  }
  if (!parsed || typeof parsed !== "object" || typeof (parsed as GrokJson).text !== "string") {
    throw new Error(`grok zwrócił JSON bez pola text: ${trimmed.slice(0, 300)}`);
  }
  const json = parsed as GrokJson;
  return {
    text: json.text,
    thought: json.thought,
    costUsd: json.total_cost_usd,
    inputTokens: json.usage?.input_tokens,
    outputTokens: json.usage?.output_tokens,
  };
}

function runGrok(bin: string, args: string[], timeoutMs: number): Promise<AskOutput> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code !== 0) {
        const why = signal === "SIGTERM" ? `timeout ${timeoutMs} ms` : `kod ${code ?? signal}`;
        reject(new Error(`grok: ${why}. ${(stderr || stdout).trim().slice(-400)}`));
        return;
      }
      try {
        resolve({ ...parseGrokOutput(stdout), ms: Date.now() - started });
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function grokRuntime<C>(options: GrokOptions = {}): LlmRuntime<C> {
  const bin = findGrokBin(options.bin);
  if (!bin) {
    throw new Error(`Nie znaleziono polecenia grok. ${INSTALL_HINT}`);
  }
  const sandbox = join(tmpdir(), "rfq-poc-grok-sandbox");
  mkdirSync(sandbox, { recursive: true });
  return {
    name: `grok CLI (${options.model ?? "model domyślny"}${options.effort ? `, effort ${options.effort}` : ""})`,
    ask: (input) => runGrok(bin, buildGrokArgs(input, sandbox, options), options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  };
}

export function mockRuntime<C>(decide: (input: AskInput<C>) => unknown): LlmRuntime<C> {
  return {
    name: "mock (deterministyczna strategia, bez modelu)",
    ask: async (input) => ({ text: JSON.stringify(decide(input)), ms: 0 }),
  };
}
