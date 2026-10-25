import { connection } from 'next/server';

import { SimClockControl } from '@/components/control/SimClockControl';
import { getSimClock } from '@/lib/clock';

// Top-bar sim clock: reads control.sim_clock at request time and hands the anchor to the live control.
export async function SimClock() {
  await connection();
  const row = await getSimClock();
  return (
    <SimClockControl
      clock={{ anchorSim: row.anchorSim, anchorReal: row.anchorReal, speed: row.speed }}
    />
  );
}
