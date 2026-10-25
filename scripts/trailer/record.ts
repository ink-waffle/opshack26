// pnpm trailer:record [--scene a,b] [--no-writes] [--assemble]: records the product trailer's scenes frame by frame.

import { mkdirSync } from 'node:fs';

import { chromium } from 'playwright';

import { prisma } from '@/lib/prismaClient';
import { assemble, CACHE } from '@/scripts/trailer/assemble';
import { loadTrailerData } from '@/scripts/trailer/data';
import { Director, H, SCALE, W } from '@/scripts/trailer/director';
import { SCENES } from '@/scripts/trailer/scenes';

const argValue = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const only = argValue('scene')?.split(',');
  const scenes = only ? SCENES.filter((s) => only.includes(s.name)) : SCENES;
  const clips = `${CACHE}/scenes`;
  const stills = `${CACHE}/stills`;
  mkdirSync(clips, { recursive: true });
  mkdirSync(stills, { recursive: true });
  const data = await loadTrailerData();
  console.log(
    `S1 data: ${data.orderRef}, card after ${data.cardAfterSec} s, labels ${data.labels.map((l) => l.p).join(' ')}`
  );
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
  });
  try {
    for (const scene of scenes) {
      const d = await Director.create({ context });
      const started = Date.now();
      d.startClip({ file: `${clips}/${scene.name}.mp4` });
      await scene.run({ d, data, stills, allowWrites: !hasFlag('no-writes') });
      await d.endClip();
      await d.page.close();
      console.log(
        `${scene.name}: ${(d.frames / 25).toFixed(1)} s of video in ${((Date.now() - started) / 1000).toFixed(0)} s`
      );
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
  if (hasFlag('assemble')) await assemble();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
