'use server';

// RFQ: koszyk z wiadomością do sprzedawców, podgląd wątków negocjacji i akceptacja.
// Wołane po stronie serwera, więc accept_token zostaje w cookie httpOnly i nie trafia do przeglądarki ani agenta.
import { cookies as nextCookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getCartId, removeCartId } from './cookies';

const BACKEND = process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000';
const HEADERS = {
  'content-type': 'application/json',
  'x-publishable-api-key': process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY as string
};
const tokenCookie = (rfqId: string) => `_rfq_token_${rfqId}`;

export type RfqLine = { variant_id: string; quantity: number; unit_price: number };
export type RfqMessage = {
  id: string;
  author: string;
  kind: string;
  lines: RfqLine[];
  text: string | null;
  created_at: string;
  // Tylko oferty sprzedawcy (wiadomości z cenami). Po tym czasie oferty nie da się zaakceptować.
  valid_until: string | null;
};
export type RfqNegotiation = {
  id: string;
  seller: { id: string; name: string };
  status: string;
  round: number;
  messages: RfqMessage[];
  latest_total: number;
  // Zamówienie u tego sprzedawcy po akceptacji (gość ma do niego dostęp przez link do RFQ).
  order: { id: string; display_id: number; total: number; status: string } | null;
};
export type Rfq = {
  id: string;
  status: string;
  need_text: string;
  order_group_id: string | null;
  items: { variant_id: string; product_title: string; quantity: number; list_unit_price: number }[];
  negotiations: RfqNegotiation[];
  summary: { list_total: number; best_total: number; savings: number };
};

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${BACKEND}${path}`, {
    method: init?.method ?? 'GET',
    headers: HEADERS,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store'
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `Błąd ${response.status}`);
  }
  return body as T;
}

export async function sendCartForQuote(message: string): Promise<{ error: string } | void> {
  const cartId = await getCartId();
  if (!cartId) {
    return { error: 'Koszyk jest pusty' };
  }
  let rfqId: string;
  try {
    const { rfq, accept_token } = await call<{ rfq: Rfq; accept_token: string }>('/store/rfq-requests', {
      method: 'POST',
      body: { cart_id: cartId, message }
    });
    const cookies = await nextCookies();
    cookies.set(tokenCookie(rfq.id), accept_token, { httpOnly: true, sameSite: 'strict', path: '/' });
    rfqId = rfq.id;
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Nie udało się wysłać zapytania' };
  }
  await removeCartId();
  redirect(`/rfq/${rfqId}`);
}

export async function getRfq(rfqId: string): Promise<Rfq> {
  const { rfq } = await call<{ rfq: Rfq }>(`/store/rfqs/${rfqId}`);
  return rfq;
}

// Kupujący (człowiek) pisze w wątku: wiadomość, kontroferta albo koniec negocjacji.
export async function sendBuyerMessage(
  negotiationId: string,
  kind: 'note' | 'counter' | 'stop',
  text: string,
  lines: RfqLine[] = []
): Promise<{ error?: string }> {
  try {
    await call(`/store/rfq-negotiations/${negotiationId}/messages`, {
      method: 'POST',
      body: { author: 'buyer', kind, text, lines: kind === 'counter' ? lines : [] }
    });
    return {};
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Nie udało się wysłać' };
  }
}

export async function acceptRfq(rfqId: string, negotiationIds: string[]): Promise<{ error?: string; order_group_id?: string }> {
  const cookies = await nextCookies();
  const token = cookies.get(tokenCookie(rfqId))?.value;
  if (!token) {
    return { error: 'Brak uprawnień do akceptacji tego zapytania w tej przeglądarce' };
  }
  try {
    const result = await call<{ order_group_id: string }>(`/store/rfqs/${rfqId}/accept`, {
      method: 'POST',
      body: { accept_token: token, negotiation_ids: negotiationIds }
    });
    return { order_group_id: result.order_group_id };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Akceptacja nie powiodła się' };
  }
}
