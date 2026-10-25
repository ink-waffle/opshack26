// Shows or sets control.sim_clock: `pnpm clock:local [--reset] [--at <ISO>] [--speed <n>]`.

import { parseArgs } from 'util';

import { BAHN_SNAPSHOT_AT } from '@/lib/bahn/collections';
import { computeSimNow, getSimClock, setSimClock } from '@/lib/clock';
import { prisma } from '@/lib/prismaClient';

async function main() {
  const { values } = parseArgs({
    options: {
      reset: { type: 'boolean', default: false },
      at: { type: 'string' },
      speed: { type: 'string' },
    },
  });
  const anchorSim = values.reset ? BAHN_SNAPSHOT_AT : values.at ? new Date(values.at) : undefined;
  if (anchorSim && Number.isNaN(anchorSim.getTime())) throw new Error(`Invalid --at: ${values.at}`);
  const speed = values.speed === undefined ? undefined : Number(values.speed);
  if (speed !== undefined && !(speed >= 0)) throw new Error(`Invalid --speed: ${values.speed}`);

  const clock =
    anchorSim || speed !== undefined
      ? await setSimClock({ anchorSim, speed })
      : await getSimClock();
  console.log(
    `sim now ${computeSimNow({ clock }).toISOString()} (anchorSim ${clock.anchorSim.toISOString()}, anchorReal ${clock.anchorReal.toISOString()}, speed ${clock.speed})`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
