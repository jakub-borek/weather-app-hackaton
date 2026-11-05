// Minimalny klient Groka (xAI, API zgodne z OpenAI chat completions) z function calling.
// Klucz: XAI_API_KEY w lokalnym .env (Bun czyta .env z katalogu, z którego startujesz). Nigdy w repo.
export const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_BASE_URL = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";
export const XAI_MODEL = process.env.XAI_MODEL ?? "grok-4-fast-non-reasoning";

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  // Zwraca wynik dla modelu i informację, czy ruch się udał (wtedy kończymy pętlę).
  run: (args: Record<string, unknown>) => Promise<{ done: boolean; result: unknown }>;
};

// Pętla: model woła narzędzia, dostaje wyniki (też błędy 422 z backendu) i poprawia się, aż jedno narzędzie zakończy ruch.
export async function runWithTools(messages: ChatMessage[], tools: Tool[], maxSteps = 4): Promise<boolean> {
  if (!XAI_API_KEY) throw new Error("Brak XAI_API_KEY");
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  for (let step = 0; step < maxSteps; step++) {
    const response = await fetch(`${XAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${XAI_API_KEY}` },
      body: JSON.stringify({
        model: XAI_MODEL,
        messages,
        tool_choice: "required",
        tools: tools.map(({ name, description, parameters }) => ({ type: "function", function: { name, description, parameters } })),
      }),
    });
    if (!response.ok) throw new Error(`xAI ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data = (await response.json()) as { choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[] };
    const reply = data.choices[0].message;
    messages.push({ role: "assistant", content: reply.content ?? null, tool_calls: reply.tool_calls });
    if (!reply.tool_calls?.length) {
      messages.push({ role: "user", content: "Musisz wywołać jedno z narzędzi." });
      continue;
    }
    let finished = false;
    for (const call of reply.tool_calls) {
      const tool = byName.get(call.function.name);
      const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      const outcome = tool ? await tool.run(args) : { done: false, result: { error: `Nieznane narzędzie ${call.function.name}` } };
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(outcome.result) });
      finished ||= outcome.done;
    }
    if (finished) return true;
  }
  return false;
}
