// Crossfades the recorded scene clips into the trailer, its 720p and GIF cuts, the poster and the story clips.

import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { TRAILER_ORDER } from '@/scripts/trailer/scenes';

export const CACHE = path.resolve('node_modules/.cache/trailer');
export const OUT = path.resolve('public/brand/trailer');
const FADE = 0.6;
// Each clip fades to the canvas colour at the cut, so two captions never overlap mid-transition.
const CANVAS = '0xF1EEE6';

type Part = { scene: string; from?: number; to?: number };

// 18–22 s clips in the format of the reference stories (720×406, 25 fps, silent).
const STORIES: Record<string, Part[]> = {
  'control-room-story': [{ scene: 'queue' }, { scene: 'approve', from: 0.4 }],
  'playbooks-story': [{ scene: 'agents' }, { scene: 'playbook' }, { scene: 'proven' }],
  'meta-story': [{ scene: 'meta' }, { scene: 'playbook', from: 6.6 }, { scene: 'next-run' }],
};

const ff = (args: string[]) =>
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });

export function duration(file: string) {
  const out = execFileSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ]);
  return Number(out.toString().trim());
}

const clip = (scene: string) => `${CACHE}/scenes/${scene}.mp4`;

// Scene clips come from JPEG frames (full range, BT.601); the outputs are tagged BT.709 limited range.
function colorRange(file: string) {
  const out = execFileSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=color_range',
    '-of',
    'csv=p=0',
    file,
  ]);
  return out.toString().trim() === 'tv' ? 'tv' : 'pc';
}
const mb = (file: string) => (statSync(file).size / 1e6).toFixed(1);

// Builds `-i` inputs and an xfade chain; returns the args and the total length.
function crossfade(parts: Part[], tail: string) {
  const inputs: string[] = [];
  const filters: string[] = [];
  let total = 0;
  parts.forEach((p, i) => {
    const full = duration(clip(p.scene));
    const from = p.from ?? 0;
    const to = Math.min(p.to ?? full, full);
    inputs.push('-i', clip(p.scene));
    const range = colorRange(clip(p.scene));
    const color = `scale=in_range=${range}:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709`;
    const len = to - from;
    const fades = [
      i > 0 ? `fade=t=in:st=0:d=${FADE}:color=${CANVAS}` : '',
      i < parts.length - 1
        ? `fade=t=out:st=${(len - FADE).toFixed(3)}:d=${FADE}:color=${CANVAS}`
        : '',
    ].filter(Boolean);
    const chain = [
      `trim=start=${from}:end=${to}`,
      'setpts=PTS-STARTPTS',
      'fps=25',
      color,
      'format=yuv420p',
      ...fades,
    ];
    filters.push(`[${i}:v]${chain.join(',')}[s${i}]`);
    if (i === 0) {
      total = len;
      return;
    }
    const prev = i === 1 ? '[s0]' : `[x${i - 1}]`;
    filters.push(
      `${prev}[s${i}]xfade=transition=fade:duration=${FADE}:offset=${(total - FADE).toFixed(3)}[x${i}]`
    );
    total += len - FADE;
  });
  const last = parts.length === 1 ? '[s0]' : `[x${parts.length - 1}]`;
  filters.push(`${last}${tail}[out]`);
  return { args: [...inputs, '-filter_complex', filters.join(';'), '-map', '[out]'], total };
}

const TAGS = [
  '-color_range',
  'tv',
  '-colorspace',
  'bt709',
  '-color_primaries',
  'bt709',
  '-color_trc',
  'bt709',
];
const H264 = [
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  ...TAGS,
  '-movflags',
  '+faststart',
  '-an',
  '-r',
  '25',
];

export async function assemble() {
  mkdirSync(OUT, { recursive: true });
  const master = `${OUT}/trailer.mp4`;
  const { args, total } = crossfade(
    TRAILER_ORDER.map((scene) => ({ scene })),
    'null'
  );
  ff([...args, ...H264, '-preset', 'slow', '-crf', '19', '-tune', 'stillimage', master]);
  console.log(`trailer.mp4 ${total.toFixed(1)} s, ${mb(master)} MB`);

  const small = `${OUT}/trailer-720p.mp4`;
  for (const crf of [24, 27, 30]) {
    ff([
      '-i',
      master,
      '-vf',
      'scale=1280:720:flags=lanczos',
      ...H264,
      '-preset',
      'slow',
      '-crf',
      String(crf),
      '-tune',
      'stillimage',
      small,
    ]);
    if (statSync(small).size < 9.5e6) break;
  }
  console.log(`trailer-720p.mp4 ${mb(small)} MB`);

  ff(['-ss', '2.6', '-i', master, '-frames:v', '1', `${OUT}/poster.png`]);

  // Teaser: the message → card → facts stretch, at 800 px.
  const gif = `${OUT}/trailer-teaser.gif`;
  const start = duration(clip('title')) - FADE + 2.6;
  for (const fps of [12, 10, 8]) {
    ff([
      '-ss',
      start.toFixed(2),
      '-t',
      '11',
      '-i',
      master,
      '-vf',
      `fps=${fps},scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      '-loop',
      '0',
      gif,
    ]);
    if (statSync(gif).size < 8e6) break;
  }
  console.log(`trailer-teaser.gif ${mb(gif)} MB`);

  for (const [name, parts] of Object.entries(STORIES)) {
    const file = `${OUT}/${name}.mp4`;
    const story = crossfade(parts, 'scale=720:406:flags=lanczos,setsar=1,trim=end=22');
    ff([...story.args, ...H264, '-preset', 'slow', '-crf', '20', file]);
    console.log(`${name}.mp4 ${duration(file).toFixed(1)} s, ${mb(file)} MB`);
  }
}

if (process.argv[1]?.endsWith('assemble.ts')) {
  assemble().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
