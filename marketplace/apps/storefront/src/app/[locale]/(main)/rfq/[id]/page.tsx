import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { RfqThreads } from '@/components/sections/RfqThreads/RfqThreads';
import { getRfq } from '@/lib/data/rfq';

type Props = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: 'Zapytanie ofertowe',
  description: 'Negocjacje ze sprzedawcami na żywo'
};

export default async function RfqPage(props: Props) {
  const { id } = await props.params;
  const rfq = await getRfq(id).catch(() => null);
  if (!rfq) {
    notFound();
  }
  return <RfqThreads initial={rfq} />;
}
