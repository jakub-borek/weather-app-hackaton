'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/atoms/Button/Button';
import { acceptRfq, getRfq, type Rfq, type RfqMessage, type RfqNegotiation } from '@/lib/data/rfq';

const POLL_MS = 1500;
const pln = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });

const RFQ_STATUS: Record<string, string> = {
  draft: 'Szkic',
  negotiating: 'Negocjacje trwają',
  ready: 'Oferty końcowe gotowe',
  accepted: 'Zaakceptowane, zamówienia złożone',
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
  note: 'Zapytanie',
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
      </div>
    </div>
  );
}

const canAccept = (negotiation: RfqNegotiation) =>
  ['final', 'awaiting_buyer'].includes(negotiation.status) &&
  negotiation.messages.some((message) => message.author === 'seller_agent' && message.lines.length > 0);

function Thread({
  negotiation,
  titles,
  selectable,
  selected,
  onToggle
}: {
  negotiation: RfqNegotiation;
  titles: Map<string, string>;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
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
      <div className="flex flex-1 flex-col gap-2">
        {negotiation.messages.map((message) => (
          <MessageBubble key={message.id} message={message} sellerName={negotiation.seller.name} titles={titles} />
        ))}
        {waiting && <p className="animate-pulse text-xs text-gray-500">{waiting}</p>}
      </div>
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

  // Polling tylko dla otwartego RFQ i widocznej karty (tunel ngrok ma limit requestów).
  useEffect(() => {
    if (!open) return;
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
  }, [rfq.id, open]);

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
          Zamówienia złożone po wynegocjowanych cenach, osobno u każdego sprzedawcy. Grupa zamówień: {rfq.order_group_id}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
