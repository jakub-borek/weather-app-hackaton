// Runtime "grokbot": aplikacja Grok Bot (desktop, subskrypcja) jako mózg agenta.
// Kanał tam: deep link grokbot://app/v1/prompt?id=<bot>&text=<do 1000 znaków>. Aplikacja pokazuje kartę
// z treścią i dopiero kliknięcie człowieka wysyła ją do bota (zabezpieczenie aplikacji, nie da się go pominąć).
// Pełny prompt jest za długi na link, więc leży w pliku req-*.md. Bot pracuje na tym komputerze,
// czyta plik i zapisuje odpowiedź (sam JSON) do res-*.json. Skrypt czeka na ten plik.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AskInput, LlmRuntime } from "./llm.ts";

export interface GrokBotOptions {
  agentId: string;
  inboxDir: string;
  timeoutMs?: number;
  pollMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_POLL_MS = 2_000;
const LINK_TEXT_LIMIT = 1000;
const AGENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

function requestFile<C>(input: AskInput<C>, responsePath: string): string {
  return [
    "# Zadanie dla bota: jeden ruch w negocjacji RFQ (PoC hackathonu)",
    "",
    "## Twoja rola i zasady",
    "",
    input.system,
    "",
    "## Zadanie",
    "",
    input.prompt,
    "",
    "## Jak odpowiedzieć",
    "",
    `Zapisz SAM obiekt JSON (bez markdownu i komentarzy) do pliku: ${responsePath}`,
    "Nie zmieniaj żadnych innych plików, niczego nie uruchamiaj poza zapisem tego pliku, niczego nie commituj.",
  ].join("\n");
}

function linkText(sequence: number, requestPath: string, responsePath: string): string {
  const text = `PoC RFQ, ruch ${sequence}: przeczytaj na moim komputerze plik ${requestPath} i wykonaj opisane tam zadanie. Odpowiedź (sam JSON) zapisz do ${responsePath}. Nic poza tym nie zmieniaj.`;
  if (text.length > LINK_TEXT_LIMIT) throw new Error(`Treść deep linku ma ${text.length} znaków, limit aplikacji to ${LINK_TEXT_LIMIT}`);
  return text;
}

function openDeepLink(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("open", [url], { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`open zakończył się kodem ${code}`))));
  });
}

// Bot może zapisywać plik kawałkami, więc czekamy, aż będzie w nim kompletny JSON.
function readCompleteJson(path: string): string | null {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8").trim();
  try {
    JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return text;
  } catch {
    return null;
  }
}

async function waitForResponse(path: string, timeoutMs: number, pollMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = readCompleteJson(path);
    if (text) return text;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Brak odpowiedzi bota w ${Math.round(timeoutMs / 1000)} s (plik ${path}). Czy kliknięto „wyślij” w aplikacji?`);
}

export function grokBotRuntime<C>(options: GrokBotOptions): LlmRuntime<C> {
  if (!AGENT_ID.test(options.agentId)) throw new Error("GROKBOT_AGENT_ID ma zły format (oczekiwany id bota z aplikacji Grok Bot)");
  mkdirSync(options.inboxDir, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  let sequence = 0;
  return {
    name: `Grok Bot app (bot ${options.agentId.slice(0, 8)}…, deep link + pliki, klik na każdy ruch)`,
    sequential: true,
    ask: async (input) => {
      sequence += 1;
      const started = Date.now();
      const requestPath = join(options.inboxDir, `req-${runId}-${sequence}.md`);
      const responsePath = join(options.inboxDir, `res-${runId}-${sequence}.json`);
      writeFileSync(requestPath, requestFile(input, responsePath));
      const query = new URLSearchParams({ id: options.agentId, text: linkText(sequence, requestPath, responsePath) });
      await openDeepLink(`grokbot://app/v1/prompt?${query.toString()}`);
      console.log(`    → Grok Bot: kliknij „wyślij” na karcie w aplikacji (ruch ${sequence}), czekam na ${responsePath}`);
      const text = await waitForResponse(responsePath, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.pollMs ?? DEFAULT_POLL_MS);
      return { text, ms: Date.now() - started };
    },
  };
}
