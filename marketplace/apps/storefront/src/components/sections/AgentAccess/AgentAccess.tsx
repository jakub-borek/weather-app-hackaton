'use client';

import { useState } from 'react';

import Link from 'next/link';

import type { AgentAccess as Access } from '@/lib/data/agent';

const STATUS: Record<string, string> = {
  draft: 'Szkic',
  negotiating: 'Negocjacje trwają',
  ready: 'Oferty gotowe do akceptacji',
  accepted: 'Zaakceptowane',
  cancelled: 'Anulowane'
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs text-gray-500">{label}</p>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          onFocus={(event) => event.target.select()}
          className="min-w-0 flex-1 rounded-sm border bg-gray-50 px-2 py-1 font-mono text-xs"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-sm border px-3 py-1 text-sm hover:bg-gray-100"
        >
          {copied ? 'Skopiowano' : 'Kopiuj'}
        </button>
      </div>
    </div>
  );
}

// Karta w koncie klienta: URL dokumentu dla Grok Bota i zapytania, które agent wysłał w imieniu klienta.
export function AgentAccess({ access }: { access: Access }) {
  const prompt = `Jesteś moim agentem zakupowym. Przeczytaj instrukcję ${access.doc_url} i działaj według niej. Moje zamówienie: `;
  return (
    <section className="mt-8 rounded-sm border p-4">
      <p className="label-lg mb-1">Agent zakupowy (Grok Bot)</p>
      <p className="mb-4 text-sm text-gray-600">
        Wklej to Grok Botowi i dopisz, czego potrzebujesz. Agent sam przejrzy katalog, wyśle zapytanie do sprzedawców
        i wynegocjuje ceny. Ofertę akceptujesz tylko ty, tutaj w sklepie.
      </p>
      <CopyField label="Wiadomość dla Grok Bota" value={prompt} />
      <CopyField label="URL dokumentu (endpointy i instrukcja)" value={access.doc_url} />
      <CopyField label="Klucz API agenta (nagłówek x-agent-key)" value={access.key} />

      <p className="label-md mb-2 mt-6">Zapytania wysłane przez agenta</p>
      {access.rfqs.length === 0 ? (
        <p className="text-sm text-gray-500">Jeszcze żadnych. Pojawią się tu, gdy agent wyśle zapytanie.</p>
      ) : (
        <ul className="divide-y rounded-sm border">
          {access.rfqs.map((rfq) => (
            <li key={rfq.id}>
              <Link href={`/rfq/${rfq.id}`} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50">
                <span className="truncate text-sm">{rfq.need_text}</span>
                <span className="shrink-0 text-xs text-gray-500">{STATUS[rfq.status] ?? rfq.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
