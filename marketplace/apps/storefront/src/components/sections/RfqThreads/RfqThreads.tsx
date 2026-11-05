'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/atoms/Button/Button';
import { acceptRfq, getRfq, sendBuyerMessage, type Rfq, type RfqMessage, type RfqNegotiation } from '@/lib/data/rfq';

// Czat działa też po zakupie. Zamknięty tylko w wątkach odrzuconych.
const CHAT_CLOSED = ['declined', 'rejected'];

const latestSellerOffer = (negotiation: RfqNegotiation) =>
  [...negotiation.messages].reverse().find((message) => message.author === 'seller_agent' && message.lines.length > 0);

// Odpowiedź kupującego w wątku: wiadomość zawsze, kontroferta i koniec negocjacji w jego kolejce.
function BuyerReply({ negotiation, titles, onSent }: { negotiation: RfqNegotiation; titles: Map<string, string>; onSent: () => void }) {
  const offer = latestSellerOffer(negotiation);
  const myTurn = negotiation.status === 'awaiting_buyer' && !!offer;
  const [text, setText] = useState('');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (kind: 'note' | 'counter' | 'stop') => {
    setSending(true);
    setError(null);
    const lines = (offer?.lines ?? []).map((line) => ({ ...line, unit_price: prices[line.variant_id] ?? line.unit_price }));
    const result = await sendBuyerMessage(negotiation.id, kind, text.trim(), lines);
    if (result.error) {
      setError(result.error);
    } else {
      setText('');
      onSent();
    }
    setSending(false);
  };

  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3">
      {myTurn &&
        offer?.lines.map((line) => (
          <label key={line.variant_id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">Twoja cena: {titles.get(line.variant_id) ?? line.variant_id}</span>
            <input
              type="number"
              className="w-28 rounded-sm border px-2 py-1 text-sm"
              value={prices[line.variant_id] ?? line.unit_price}
              onChange={(event) => setPrices((current) => ({ ...current, [line.variant_id]: Number(event.target.value) }))}
            />
          </label>
        ))}
      <textarea
        className="w-full rounded-sm border p-2 text-sm"
        rows={2}
        placeholder="Napisz do sprzedawcy…"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="tonal" disabled={sending || !text.trim()} onClick={() => send('note')}>
          Wyślij
        </Button>
        {myTurn && (
          <>
            <Button disabled={sending} onClick={() => send('counter')}>
              Kontroferta
            </Button>
            <Button variant="text" disabled={sending} onClick={() => send('stop')}>
              Zakończ negocjacje
            </Button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

const POLL_MS = 1500;
const pln = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });

const RFQ_STATUS: Record<string, string> = {
  draft: 'Szkic',
  negotiating: 'Negocjacje trwają',
  ready: 'Oferty końcowe gotowe',
  accepted: 'Zamówienie złożone',
  cancelled: 'Anulowane'
};
const NEGOTIATION_STATUS: Record<string, string> = {
  awaiting_seller: 'Kolej sprzedawcy',
  awaiting_buyer: 'Kolej kupującego',
  final: 'Oferta końcowa',
  declined: 'Sprzedawca odmówił',
  accepted: 'Zaakceptowana',
  rejected: 'Odrzucona'
};
const KIND: Record<string, string> = {
  note: 'Wiadomość',
  offer: 'Oferta',
  counter: 'Kontroferta',
  final: 'Oferta końcowa',
  decline: 'Odmowa',
  stop: 'Koniec negocjacji'
};

const authorLabel = (message: RfqMessage, sellerName: string) =>
  ({ buyer: 'Kupujący', buyer_agent: 'Agent kupującego', seller_agent: `Agent ${sellerName}`, system: 'System' })[
    message.author
  ] ?? message.author;

function MessageBubble({ message, sellerName, titles }: { message: RfqMessage; sellerName: string; titles: Map<string, string> }) {
  const fromBuyer = message.author === 'buyer' || message.author === 'buyer_agent';
  return (
    <div className={`flex ${fromBuyer ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[90%] rounded-sm px-3 py-2 text-sm ${fromBuyer ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
        <p className="mb-1 text-xs opacity-70">
          {authorLabel(message, sellerName)} · {KIND[message.kind] ?? message.kind} ·{' '}
          {new Date(message.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
        {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
        {message.lines.map((line) => (
          <p key={line.variant_id} className="mt-1 font-medium">
            {line.quantity} × {titles.get(line.variant_id) ?? line.variant_id}: {pln.format(line.unit_price)}/szt. ={' '}
            {pln.format(line.quantity * line.unit_price)}
          </p>
        ))}
        {message.valid_until && (
          <p className="mt-1 text-xs opacity-70">
            {isExpired(message)
              ? 'Oferta wygasła'
              : `Ważna do ${new Date(message.valid_until).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        )}
      </div>
    </div>
  );
}

const isExpired = (message: RfqMessage) => !!message.valid_until && new Date(message.valid_until).getTime() < Date.now();

// Akceptować można ostatnią, jeszcze ważną ofertę sprzedawcy.
const canAccept = (negotiation: RfqNegotiation) => {
  const offers = negotiation.messages.filter((message) => message.author === 'seller_agent' && message.lines.length > 0);
  const latest = offers[offers.length - 1];
  return ['final', 'awaiting_buyer'].includes(negotiation.status) && !!latest && !isExpired(latest);
};

function Thread({
  negotiation,
  titles,
  selectable,
  selected,
  onToggle,
  canReply,
  onSent
}: {
  negotiation: RfqNegotiation;
  titles: Map<string, string>;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  canReply: boolean;
  onSent: () => void;
}) {
  const waiting =
    negotiation.status === 'awaiting_seller'
      ? `Agent ${negotiation.seller.name} pisze…`
      : negotiation.status === 'awaiting_buyer'
        ? 'Agent kupującego analizuje ofertę…'
        : null;
  return (
    <div className="flex flex-col rounded-sm border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="label-md">{negotiation.seller.name}</p>
          <p className="text-xs text-gray-500">
            {NEGOTIATION_STATUS[negotiation.status] ?? negotiation.status} · runda {negotiation.round}
          </p>
        </div>
        {negotiation.latest_total > 0 && <p className="label-md">{pln.format(negotiation.latest_total)}</p>}
      </div>
      {negotiation.order && (
        <div className="mb-3 rounded-sm bg-gray-50 px-3 py-2 text-sm">
          <p className="label-md">Zamówienie #{negotiation.order.display_id}</p>
          <p className="text-xs text-gray-500">
            Razem z dostawą {pln.format(negotiation.order.total)} · status: {negotiation.order.status}
          </p>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2">
        {negotiation.messages.map((message) => (
          <MessageBubble key={message.id} message={message} sellerName={negotiation.seller.name} titles={titles} />
        ))}
        {waiting && <p className="animate-pulse text-xs text-gray-500">{waiting}</p>}
      </div>
      {canReply && !CHAT_CLOSED.includes(negotiation.status) && (
        <BuyerReply negotiation={negotiation} titles={titles} onSent={onSent} />
      )}
      {selectable && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={selected} onChange={onToggle} />
          Wybieram tę ofertę
        </label>
      )}
    </div>
  );
}

export function RfqThreads({ initial }: { initial: Rfq }) {
  const [rfq, setRfq] = useState<Rfq>(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = rfq.status !== 'accepted' && rfq.status !== 'cancelled';

  // Polling dla widocznej karty (tunel ngrok ma limit requestów). Po zakupie dalej działa, bo czat zostaje.
  const live = rfq.status !== 'cancelled';
  useEffect(() => {
    if (!live) return;
    const refresh = () => {
      if (document.hidden) return;
      getRfq(rfq.id)
        .then(setRfq)
        .catch(() => undefined);
    };
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [rfq.id, live]);

  const titles = useMemo(() => new Map(rfq.items.map((item) => [item.variant_id, item.product_title])), [rfq.items]);
  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const accept = async () => {
    setAccepting(true);
    setError(null);
    const result = await acceptRfq(rfq.id, selected);
    if (result.error) {
      setError(result.error);
    } else {
      setRfq(await getRfq(rfq.id));
    }
    setAccepting(false);
  };

  const savingsPct = rfq.summary.list_total > 0 ? Math.round((rfq.summary.savings / rfq.summary.list_total) * 1000) / 10 : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <p className="text-xs uppercase tracking-wide text-gray-500">Zapytanie ofertowe</p>
      <h1 className="heading-md mb-1">{RFQ_STATUS[rfq.status] ?? rfq.status}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {rfq.items.map((item) => `${item.quantity} × ${item.product_title}`).join(', ')}
      </p>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-sm border p-4">
          <p className="text-xs text-gray-500">Wartość koszyka</p>
          <p className="label-lg">{pln.format(rfq.summary.list_total)}</p>
        </div>
        <div className="rounded-sm border p-4">
          <p className="text-xs text-gray-500">Najlepsze oferty</p>
          <p className="label-lg">{pln.format(rfq.summary.best_total)}</p>
        </div>
        <div className="rounded-sm border p-4">
          <p className="text-xs text-gray-500">Oszczędność</p>
          <p className="label-lg">
            {pln.format(rfq.summary.savings)} ({savingsPct}%)
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rfq.negotiations.map((negotiation) => (
          <Thread
            key={negotiation.id}
            negotiation={negotiation}
            titles={titles}
            selectable={open && canAccept(negotiation)}
            selected={selected.includes(negotiation.id)}
            onToggle={() => toggle(negotiation.id)}
            canReply={live}
            onSent={() => getRfq(rfq.id).then(setRfq).catch(() => undefined)}
          />
        ))}
      </div>

      {open && (
        <Button className="w-full sm:w-auto" loading={accepting} disabled={accepting || selected.length === 0} onClick={accept}>
          Akceptuj wybrane oferty ({selected.length})
        </Button>
      )}
      {rfq.status === 'accepted' && (
        <p className="rounded-sm border p-4 text-sm">
          Zamówienia złożone po wynegocjowanych cenach, osobno u każdego sprzedawcy. Zapisz link do tej strony: tu
          widzisz zamówienia i możesz dalej pisać ze sprzedawcą.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
