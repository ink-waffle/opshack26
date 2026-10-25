// Mock roadside / tow lookup: two deterministic candidates near a reported location (info only, nothing booked).

import type { BookingResult, RoadsideOption, RoadsideProvider } from '@/lib/providers';
import { between, seededRandom, shortId } from '@/lib/providers/seeded';

async function find(args: { location: string }): Promise<RoadsideOption[]> {
  const { location } = args;
  const random = seededRandom(location.toLowerCase());
  return [
    {
      providerId: `roadside-${shortId(`${location}:assist`)}`,
      name: 'Nordic Roadside Assist',
      kind: 'ROADSIDE_ASSIST',
      etaMinutes: between({ min: 40, max: 95, random }),
      coverage: 'Diagnosis on site; can tow to the nearest partner workshop.',
      note: 'Mock provider. The owner decides; nothing is booked.',
    },
    {
      providerId: `tow-${shortId(`${location}:tow`)}`,
      name: 'Baltic Tow & Recovery',
      kind: 'TOW',
      etaMinutes: between({ min: 60, max: 150, random }),
      coverage: 'Flatbed tow, covered storage overnight.',
      note: 'Mock provider. The owner decides; nothing is booked.',
    },
  ];
}

async function order(args: {
  option: RoadsideOption;
  location: string;
  orderId: string;
  at: Date;
}): Promise<BookingResult> {
  const { option, location, orderId, at } = args;
  const reference = `${option.kind === 'TOW' ? 'TOW' : 'RSA'}-${shortId(`${option.providerId}:${orderId}:${at.toISOString()}`).slice(0, 6).toUpperCase()}`;
  return {
    ok: true,
    bookingReference: reference,
    priceCents: null,
    statement: `${option.name} ordered to ${location} (simulated, ref ${reference}); arrival in about ${option.etaMinutes} min. Price to be confirmed by the provider.`,
  };
}

export const mockRoadside: RoadsideProvider = { id: 'mock', find, order };
