'use server';

// Dostęp agenta zakupowego (Grok Bot) dla zalogowanego klienta: klucz, URL dokumentu i zapytania wysłane przez agenta.
import { getAuthHeaders } from './cookies';

const BACKEND = process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000';

export type AgentRfq = { id: string; status: string; need_text: string; created_at: string };
export type AgentAccess = { key: string; doc_url: string; store_url: string; rfqs: AgentRfq[] };

export async function getAgentAccess(): Promise<AgentAccess | null> {
  const auth = await getAuthHeaders();
  if (!('authorization' in auth)) return null;
  const response = await fetch(`${BACKEND}/store/agent-key`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-publishable-api-key': process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY as string,
      ...auth
    },
    cache: 'no-store'
  });
  if (!response.ok) return null;
  return (await response.json()) as AgentAccess;
}
