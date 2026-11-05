'use client';

import { useState } from 'react';

import { Button } from '@/components/atoms/Button/Button';
import { sendCartForQuote } from '@/lib/data/rfq';

// Kupujący wysyła cały koszyk z wiadomością. Sprzedawcy z koszyka dostają zapytanie i negocjują.
export const CartRfqRequest = () => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    const result = await sendCartForQuote(message.trim());
    if (result?.error) {
      setError(result.error);
      setSending(false);
    }
  };

  return (
    <div className="mb-6 w-full rounded-sm border p-4">
      <p className="label-md mb-2">Negocjuj cenę</p>
      <textarea
        className="mb-3 w-full rounded-sm border p-2 text-md"
        rows={3}
        placeholder="Np. Kupujemy całość na firmę. Przy tej ilości prosimy o rabat i dostawę w tym tygodniu."
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <Button
        className="w-full"
        loading={sending}
        disabled={sending || message.trim().length === 0}
        onClick={send}
      >
        Wyślij koszyk z wiadomością
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
};
