// Frame-accurate recorder: every frame sets camera, cursor and overlays in the page, then grabs one screenshot.

import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';

import type { BrowserContext, CDPSession, Locator, Page } from 'playwright';

import { RUNTIME_SRC } from '@/scripts/trailer/runtime';

export const FPS = 25;
export const W = 1440;
export const H = 810;
export const SCALE = 4 / 3;
export const BASE_URL = process.env.TRAILER_BASE_URL ?? 'http://localhost:3001';

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type Cam = { x: number; y: number; z: number };
export type Op = {
  sel: string;
  html?: string;
  text?: string;
  style?: Record<string, string>;
  scrollTop?: number;
};

export type State = {
  cam: Cam;
  cursor: { x: number; y: number; o: number; press: number };
  ripple: { x: number; y: number; t: number };
  ring: { x: number; y: number; w: number; h: number; o: number };
  caption: { eyebrow: string; text: string; o: number };
  tag: { text: string; o: number };
  dim: number;
  stage: number;
  ops: Op[];
};

export type Anim = { start?: () => void; step: (t: number) => void; ease?: (t: number) => number };

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  out: (t: number) => 1 - Math.pow(1 - t, 3),
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type FitOptions = {
  pad?: number;
  maxZ?: number;
  minZ?: number;
  bottomSafe?: number;
  topSafe?: number;
};

export class Director {
  readonly page: Page;
  private cdp: CDPSession;
  private ffmpeg: ChildProcess | null = null;
  frames = 0;
  followMouse = true;
  state: State = {
    cam: { x: W / 2, y: H / 2, z: 1 },
    cursor: { x: W / 2, y: H / 2, o: 0, press: 0 },
    ripple: { x: 0, y: 0, t: -1 },
    ring: { x: 0, y: 0, w: 0, h: 0, o: 0 },
    caption: { eyebrow: '', text: '', o: 0 },
    tag: { text: '', o: 0 },
    dim: 0,
    stage: 0,
    ops: [],
  };
  private lastMouse: Point = { x: -1, y: -1 };
  // The camera the page actually shows; box() inverts this one, not the pending state.
  private applied: Cam = { x: W / 2, y: H / 2, z: 1 };

  private constructor(args: { page: Page; cdp: CDPSession }) {
    this.page = args.page;
    this.cdp = args.cdp;
  }

  static async create(args: { context: BrowserContext }) {
    const page = await args.context.newPage();
    const cdp = await args.context.newCDPSession(page);
    return new Director({ page, cdp });
  }

  startClip(args: { file: string }) {
    this.frames = 0;
    this.ffmpeg = spawn(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-f',
        'image2pipe',
        '-framerate',
        String(FPS),
        '-c:v',
        'mjpeg',
        '-i',
        '-',
      ].concat([
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '14',
        '-pix_fmt',
        'yuv420p',
        '-r',
        String(FPS),
        args.file,
      ]),
      { stdio: ['pipe', 'inherit', 'inherit'] }
    );
  }

  async endClip() {
    const proc = this.ffmpeg;
    if (!proc?.stdin) return;
    proc.stdin.end();
    await once(proc, 'close');
    this.ffmpeg = null;
  }

  async goto(args: { path: string; wait?: Locator | string }) {
    const { path, wait } = args;
    await this.page.goto(BASE_URL + path, { waitUntil: 'networkidle', timeout: 90_000 });
    this.applied = { x: W / 2, y: H / 2, z: 1 };
    if (typeof wait === 'string')
      await this.page.getByText(wait).first().waitFor({ timeout: 30_000 });
    else if (wait) await wait.waitFor({ timeout: 30_000 });
    await this.install();
  }

  async install() {
    await this.page.evaluate(RUNTIME_SRC);
    await this.page.evaluate(() => document.fonts.ready.then(() => true));
    await this.page.waitForTimeout(250);
    this.lastMouse = { x: -1, y: -1 };
  }

  // Doc-space rect of a locator under the current camera.
  async box(target: Locator, args: { inflate?: number } = {}): Promise<Rect> {
    const bb = await target.boundingBox();
    if (!bb) throw new Error('no bounding box for target');
    const { x, y, z } = this.applied;
    const tx = W / 2 - x * z;
    const ty = H / 2 - y * z;
    const pad = args.inflate ?? 0;
    return {
      x: (bb.x - tx) / z - pad,
      y: (bb.y - ty) / z - pad,
      w: bb.width / z + 2 * pad,
      h: bb.height / z + 2 * pad,
    };
  }

  async point(
    target: Locator,
    args: { ax?: number; ay?: number; dx?: number; dy?: number } = {}
  ): Promise<Point> {
    const r = await this.box(target);
    return {
      x: r.x + r.w * (args.ax ?? 0.5) + (args.dx ?? 0),
      y: r.y + r.h * (args.ay ?? 0.5) + (args.dy ?? 0),
    };
  }

  async docSize() {
    return this.page.evaluate(() => ({
      w: document.body.scrollWidth,
      h: document.body.scrollHeight,
    }));
  }

  // Camera that fits a doc rect into the frame, leaving room for the caption at the bottom.
  async fit(r: Rect, args: FitOptions = {}): Promise<Cam> {
    const pad = args.pad ?? 36;
    const bottomSafe = args.bottomSafe ?? 150;
    const topSafe = args.topSafe ?? 0;
    const availH = H - bottomSafe - topSafe;
    const z = clamp(
      Math.min(W / (r.w + 2 * pad), availH / (r.h + 2 * pad)),
      args.minZ ?? 0.4,
      args.maxZ ?? 2.2
    );
    let cx = r.x + r.w / 2;
    let cy = r.y + r.h / 2 + (H / 2 - (topSafe + availH / 2)) / z;
    const doc = await this.docSize();
    const halfW = W / (2 * z);
    const halfH = H / (2 * z);
    if (doc.w * z >= W) cx = clamp(cx, halfW, doc.w - halfW);
    cy = Math.max(cy, halfH);
    if (doc.h * z >= H) cy = Math.min(cy, doc.h - halfH + (bottomSafe * 0.6) / z);
    return { x: cx, y: cy, z };
  }

  private async apply() {
    await this.page.evaluate((st) => (window as any).__trailer.apply(st), this.state);
    this.applied = { ...this.state.cam };
  }

  async frame() {
    const s = this.state;
    await this.apply();
    if (this.followMouse && s.cursor.o > 0.5) {
      const { x, y, z } = s.cam;
      const vx = W / 2 + (s.cursor.x - x) * z;
      const vy = H / 2 + (s.cursor.y - y) * z;
      if (Math.abs(vx - this.lastMouse.x) + Math.abs(vy - this.lastMouse.y) > 0.5) {
        await this.page.mouse.move(vx, vy);
        this.lastMouse = { x: vx, y: vy };
      }
    }
    const shot = await this.cdp.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 95,
      optimizeForSpeed: true,
      clip: { x: 0, y: 0, width: W, height: H, scale: SCALE },
    });
    const buf = Buffer.from(shot.data, 'base64');
    const stdin = this.ffmpeg?.stdin;
    if (stdin && !stdin.write(buf)) await once(stdin, 'drain');
    this.frames += 1;
    s.ops = [];
  }

  async still(args: { file: string; scale?: number }) {
    await this.apply();
    const png = args.file.endsWith('.png');
    const shot = await this.cdp.send('Page.captureScreenshot', {
      format: png ? 'png' : 'jpeg',
      quality: png ? undefined : 88,
      clip: { x: 0, y: 0, width: W, height: H, scale: args.scale ?? SCALE },
    });
    writeFileSync(args.file, Buffer.from(shot.data, 'base64'));
  }

  // Plays animations in parallel over `sec` seconds, one screenshot per frame.
  async play(sec: number, ...anims: Anim[]) {
    for (const a of anims) a.start?.();
    const n = Math.max(1, Math.round(sec * FPS));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      for (const a of anims) a.step((a.ease ?? ease.inOut)(t));
      await this.frame();
    }
  }

  hold(sec: number, ...anims: Anim[]) {
    return this.play(sec, ...anims);
  }

  // Slow push-in while holding, so stills never look frozen.
  drift(amount = 0.035): Anim {
    let from: Cam;
    return {
      start: () => (from = { ...this.state.cam }),
      step: (t) => (this.state.cam = { ...from, z: from.z * (1 + amount * t) }),
      ease: ease.linear,
    };
  }

  cam(to: Cam): Anim {
    let from: Cam;
    return {
      start: () => (from = { ...this.state.cam }),
      step: (t) => {
        const z = Math.exp(lerp(Math.log(from.z), Math.log(to.z), t));
        this.state.cam = { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), z };
      },
      ease: ease.inOutSine,
    };
  }

  async setCam(c: Cam) {
    this.state.cam = { ...c };
    await this.apply();
  }

  cursorTo(to: Point, args: { arc?: number } = {}): Anim {
    let from: Point;
    return {
      start: () => (from = { x: this.state.cursor.x, y: this.state.cursor.y }),
      step: (t) => {
        const arc = args.arc ?? 0.12;
        const mx = (from.x + to.x) / 2 - (to.y - from.y) * arc;
        const my = (from.y + to.y) / 2 + (to.x - from.x) * arc;
        const u = 1 - t;
        this.state.cursor.x = u * u * from.x + 2 * u * t * mx + t * t * to.x;
        this.state.cursor.y = u * u * from.y + 2 * u * t * my + t * t * to.y;
      },
    };
  }

  setCursor(p: Point, o = 0) {
    this.state.cursor = { ...this.state.cursor, x: p.x, y: p.y, o };
  }

  fadeCursor(to: number): Anim {
    let from = 0;
    return {
      start: () => (from = this.state.cursor.o),
      step: (t) => (this.state.cursor.o = lerp(from, to, t)),
    };
  }

  // Visual click: press, ripple; `onPress` fires at the bottom of the press (for real clicks).
  async click(args: { onPress?: () => Promise<void> } = {}) {
    const c = this.state.cursor;
    this.state.ripple = { x: c.x, y: c.y, t: -1 };
    await this.play(0.16, { step: (t) => (this.state.cursor.press = t), ease: ease.out });
    if (args.onPress) await args.onPress();
    await this.play(
      0.5,
      { step: (t) => (this.state.cursor.press = 1 - Math.min(1, t * 2.4)) },
      { step: (t) => (this.state.ripple.t = t), ease: ease.out }
    );
    this.state.ripple.t = -1;
  }

  // Real click at the cursor position (viewport coords from the camera).
  async realClick() {
    const { x, y, z } = this.applied;
    const c = this.state.cursor;
    await this.page.mouse.click(W / 2 + (c.x - x) * z, H / 2 + (c.y - y) * z);
  }

  caption(eyebrow: string, text: string): Anim {
    let from: { eyebrow: string; text: string; o: number };
    return {
      start: () => (from = { ...this.state.caption }),
      step: (t) => {
        const same = from.text === text && from.eyebrow === eyebrow;
        if (same || from.o < 0.05) {
          this.state.caption = { eyebrow, text, o: Math.max(from.o, t) };
          return;
        }
        if (t < 0.4) this.state.caption = { ...from, o: from.o * (1 - t / 0.4) };
        else this.state.caption = { eyebrow, text, o: (t - 0.4) / 0.6 };
      },
      ease: ease.inOutSine,
    };
  }

  captionOut(): Anim {
    let from = 0;
    return {
      start: () => (from = this.state.caption.o),
      step: (t) => (this.state.caption.o = from * (1 - t)),
    };
  }

  tag(text: string, to = 1): Anim {
    let from = 0;
    return {
      start: () => {
        from = this.state.tag.o;
        if (to > 0) this.state.tag.text = text;
      },
      step: (t) => (this.state.tag.o = lerp(from, to, t)),
    };
  }

  ring(r: Rect | null, to = 1): Anim {
    let from: State['ring'];
    return {
      start: () => (from = { ...this.state.ring }),
      step: (t) => {
        const target = r ?? from;
        const base = from.o < 0.05 ? target : from;
        this.state.ring = {
          x: lerp(base.x, target.x, t),
          y: lerp(base.y, target.y, t),
          w: lerp(base.w, target.w, t),
          h: lerp(base.h, target.h, t),
          o: lerp(from.o, to, t),
        };
      },
    };
  }

  dim(to: number): Anim {
    let from = 0;
    return {
      start: () => (from = this.state.dim),
      step: (t) => (this.state.dim = lerp(from, to, t)),
    };
  }

  stage(to: number): Anim {
    let from = 0;
    return {
      start: () => (from = this.state.stage),
      step: (t) => (this.state.stage = lerp(from, to, t)),
    };
  }

  // Per-frame DOM tweak (overlays, typed text, reveals).
  fx(fn: (t: number) => Op | Op[], easing: (t: number) => number = ease.inOut): Anim {
    return {
      step: (t) => {
        const r = fn(t);
        this.state.ops.push(...(Array.isArray(r) ? r : [r]));
      },
      ease: easing,
    };
  }

  async setStage(html: string) {
    await this.page.evaluate((h) => {
      const el = document.getElementById('tr-stage');
      if (el) el.innerHTML = h;
    }, html);
  }

  resetOverlays() {
    this.state.ring.o = 0;
    this.state.tag.o = 0;
    this.state.dim = 0;
    this.state.stage = 0;
    this.state.ripple.t = -1;
  }
}
