// The trailer's scenes. Each one records a clip; the assembler crossfades them in order.

import { existsSync, readFileSync } from 'node:fs';

import type { Locator } from 'playwright';

import type { TrailerData } from '@/scripts/trailer/data';
import { type Anim, type Director, ease, type Op, type Rect } from '@/scripts/trailer/director';
import { messageHtml, outroHtml, type Tile, titleHtml } from '@/scripts/trailer/stage';

export type SceneContext = { d: Director; data: TrailerData; stills: string; allowWrites: boolean };
export type Scene = { name: string; run: (ctx: SceneContext) => Promise<void> };

const prog = (sec: number, a: number, b: number) =>
  ease.inOut(Math.max(0, Math.min(1, (sec - a) / (b - a))));

// Fade-and-rise for `[data-a=key]` between seconds a and b.
const rise = (key: string, sec: number, a: number, b: number, dy = 18): Op => {
  const p = prog(sec, a, b);
  return {
    sel: `#tr-stage [data-a="${key}"]`,
    style: { opacity: String(p), transform: `translateY(${(1 - p) * dy}px)` },
  };
};

// Linear over the play; fn gets seconds since the play started.
const timeline = (d: Director, dur: number, fn: (sec: number) => Op[]): Anim =>
  d.fx((t) => fn(t * dur), ease.linear);

const union = (...rs: Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  const x2 = Math.max(...rs.map((r) => r.x + r.w));
  const y2 = Math.max(...rs.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
};

const inflate = (r: Rect, by: number): Rect => ({
  x: r.x - by,
  y: r.y - by,
  w: r.w + 2 * by,
  h: r.h + 2 * by,
});

const ancestor = (l: Locator, cls: string) =>
  l.locator(`xpath=ancestor::*[contains(@class,"${cls}")][1]`);

function cardPath(data: TrailerData, ref: string) {
  const id = data.cardIds[ref];
  if (!id) throw new Error(`no decision card for ${ref}; run pnpm demo:prime`);
  return `/cards/${id}`;
}

// A clean still (no caption, cursor or ring) for the outro tiles.
async function shoot(ctx: SceneContext, name: string) {
  const { d } = ctx;
  const saved = {
    caption: d.state.caption.o,
    cursor: d.state.cursor.o,
    ring: d.state.ring.o,
    tag: d.state.tag.o,
  };
  Object.assign(d.state, {
    caption: { ...d.state.caption, o: 0 },
    cursor: { ...d.state.cursor, o: 0 },
    ring: { ...d.state.ring, o: 0 },
    tag: { ...d.state.tag, o: 0 },
  });
  await d.still({ file: `${ctx.stills}/${name}.jpg`, scale: 2 / 3 });
  d.state.caption.o = saved.caption;
  d.state.cursor.o = saved.cursor;
  d.state.ring.o = saved.ring;
  d.state.tag.o = saved.tag;
}

// Caption fades in, then the camera holds with a slow drift.
async function captionHold(
  d: Director,
  eyebrow: string,
  text: string,
  sec: number,
  ...anims: Anim[]
) {
  await d.play(Math.min(0.6, sec), d.caption(eyebrow, text), ...anims);
  if (sec > 0.6) await d.play(sec - 0.6, d.drift(0.02));
}

const title: Scene = {
  name: 'title',
  run: async ({ d }) => {
    await d.goto({ path: '/', wait: 'Needs your decision' });
    await d.setStage(titleHtml());
    d.state.stage = 1;
    const dur = 3.8;
    await d.play(
      dur,
      timeline(d, dur, (s) => [
        rise('logo', s, 0.1, 0.7),
        rise('l1', s, 0.5, 1.1, 26),
        rise('l2', s, 1.0, 1.6, 26),
        rise('sub', s, 1.6, 2.2, 10),
      ])
    );
  },
};

const message: Scene = {
  name: 'message',
  run: async (ctx) => {
    const { d, data } = ctx;
    await d.goto({ path: `/orders/${data.orderRef}`, wait: 'What happened' });
    await d.setCam(
      await d.fit({ x: 0, y: 0, w: 1440, h: 810 }, { pad: 0, bottomSafe: 0, maxZ: 1.06 })
    );
    await d.setStage(messageHtml(data));
    d.state.dim = 1;
    d.state.stage = 1;
    const ps = data.labels.map((l) => l.p);
    const dur = 7.4;
    const text = 'A driver writes. The watchman reads it and starts the right playbook.';
    await d.play(
      dur,
      d.drift(0.04),
      d.fx((t) => {
        d.state.caption = { eyebrow: 'Watchman', text, o: prog(t * dur, 0.4, 1.0) };
        return [];
      }, ease.linear),
      timeline(d, dur, (s) => {
        const ops: Op[] = [rise('chat', s, 0.05, 0.6, 24)];
        const typing = s < 1.3;
        ops.push({
          sel: '#tr-stage [data-a="typing"]',
          style: { display: typing ? 'inline-flex' : 'none' },
        });
        ops.push({
          sel: '#tr-stage [data-a="bubble"]',
          style: { display: typing ? 'none' : 'block', opacity: String(prog(s, 1.3, 1.6)) },
        });
        for (let i = 0; i < 3; i++) {
          const ph = (Math.sin(s * 7 - i * 0.9) + 1) / 2;
          ops.push({
            sel: `#tr-stage [data-a="d${i}"]`,
            style: { opacity: String(0.35 + 0.65 * ph) },
          });
        }
        ops.push(rise('arrow', s, 2.3, 2.7, 0), rise('watch', s, 2.5, 3.1, 24));
        ps.forEach((p, i) => {
          const f = prog(s, 3.1 + i * 0.25, 4.2 + i * 0.25);
          ops.push({
            sel: `#tr-stage [data-a="bar${i}"]`,
            style: { width: `${(p * f * 100).toFixed(1)}%` },
          });
          ops.push({ sel: `#tr-stage [data-a="p${i}"]`, text: (p * f).toFixed(2) });
        });
        ops.push(rise('route', s, 4.7, 5.2, 10));
        return ops;
      })
    );
    await shoot(ctx, 'watchman');
  },
};

const queue: Scene = {
  name: 'queue',
  run: async (ctx) => {
    const { d, data } = ctx;
    await d.goto({ path: '/', wait: 'Needs your decision' });
    const heading = await d.box(d.page.getByRole('heading', { level: 1 }).first());
    const rows = d.page.locator('a[href^="/cards/"]');
    const newRow = d.page.locator('a[href^="/cards/"]', { hasText: data.orderRef }).first();
    const row4 = await d.box(rows.nth(3));
    await d.setCam(await d.fit(union(heading, row4), { pad: 24, bottomSafe: 140 }));
    await shoot(ctx, 'queue');
    const nr = await d.box(newRow, { inflate: 4 });
    d.setCursor({ x: nr.x + nr.w * 0.8, y: nr.y + nr.h + 150 }, 0);
    await d.play(0.6, d.tag(`${data.cardAfterSec} s after the message`), d.fadeCursor(1));
    await d.play(
      1.0,
      d.ring(nr),
      d.cursorTo({ x: nr.x + nr.w * 0.42, y: nr.y + nr.h * 0.62 }),
      d.caption('Decision card', `${data.cardAfterSec} seconds later, a card waits for a person.`)
    );
    await d.play(1.7, d.drift(0.02));
    // Push in on a countdown and its reason.
    const row2 = await d.box(rows.nth(1));
    const clock = { x: row2.x + row2.w * 0.66, y: row2.y, w: row2.w * 0.34, h: row2.h };
    const target = await d.fit(union(clock, { x: clock.x - 420, y: row2.y, w: 10, h: row2.h }), {
      pad: 30,
      bottomSafe: 150,
      maxZ: 1.9,
    });
    await d.play(
      1.2,
      d.cam(target),
      d.ring(null, 0),
      d.tag('', 0),
      d.cursorTo({ x: clock.x + 60, y: clock.y + clock.h * 0.35 })
    );
    await d.play(
      0.3,
      d.ring({ x: clock.x + 2, y: clock.y + 10, w: clock.w - 20, h: clock.h - 20 })
    );
    await captionHold(
      d,
      'Control room',
      'Sorted by time left, never by priority. Every deadline says why.',
      3.0
    );
  },
};

const cardFacts: Scene = {
  name: 'card-facts',
  run: async (ctx) => {
    const { d, data } = ctx;
    const page = d.page;
    await d.goto({ path: cardPath(data, 'CD-420299'), wait: 'What happened' });
    const head = await d.box(page.getByText('CD-420299', { exact: true }).first());
    const chips = page.locator('button[aria-expanded]');
    const provider = chips.filter({ hasText: 'Provider answer' }).first();
    const quote = chips.filter({ hasText: 'Ferry quote' }).first();
    const happened = await d.box(page.getByText('What happened', { exact: true }).first());
    const chipBox = await d.box(provider);
    const r = union(head, happened, chipBox, { x: head.x, y: head.y, w: 640, h: 10 });
    await d.setCam(await d.fit({ ...r, y: r.y - 10 }, { pad: 26, bottomSafe: 140, maxZ: 1.75 }));
    await shoot(ctx, 'card');
    d.setCursor({ x: chipBox.x + 300, y: chipBox.y + 140 }, 0);
    await d.play(
      0.5,
      d.fadeCursor(1),
      d.caption('Decision card', 'What is wrong, in plain words, with every fact behind it.')
    );
    await d.play(0.9, d.drift(0.015));
    // Open a fact: an observed provider answer, then a quote.
    const openChip = async (chip: Locator, text: string) => {
      await d.play(0.8, d.cursorTo(await d.point(chip, { ax: 0.35 })));
      await d.click({ onPress: () => d.realClick() });
      const pop = page.locator(`[id="${await chip.getAttribute('aria-controls')}"]`);
      await pop.waitFor({ timeout: 5000 });
      await page.waitForTimeout(150);
      const pb = await d.box(pop);
      const cb = await d.box(chip);
      const view = union(
        cb,
        { ...pb, h: Math.min(pb.h, 270) },
        { x: pb.x - 160, y: cb.y - 70, w: 10, h: 10 }
      );
      await d.play(
        1.0,
        d.cam(await d.fit(view, { pad: 30, bottomSafe: 150, maxZ: 1.75 })),
        d.caption('Facts', text)
      );
      await d.play(2.2, d.drift(0.015));
    };
    await openChip(provider, 'Every fact shows its source, its time and how strong it is.');
    await openChip(quote, 'A quote is never shown as a booking.');
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 400);
    // Option A with its promise slack.
    const optionA = page.locator('div[class*="grid-cols-[2rem"]').first();
    const ob = await d.box(optionA);
    const top = { ...ob, h: Math.min(ob.h, 300) };
    const slack = await d.box(optionA.getByText(/Promise holds/).first(), { inflate: 5 });
    await d.play(
      1.1,
      d.cam(await d.fit(top, { pad: 24, bottomSafe: 140, maxZ: 1.6 })),
      d.cursorTo({ x: slack.x + slack.w * 0.6, y: slack.y + slack.h * 0.6 })
    );
    await d.play(0.3, d.ring(slack));
    await captionHold(
      d,
      'Options',
      'At most three options, each checked against the delivery promise.',
      2.8
    );
    await d.play(0.3, d.ring(null, 0), d.fadeCursor(0));
  },
};

const nextRun: Scene = {
  name: 'next-run',
  run: async (ctx) => {
    const { d, data } = ctx;
    const page = d.page;
    await d.goto({ path: cardPath(data, 'CD-420154'), wait: 'What happened' });
    const optionA = page.locator('div[class*="grid-cols-[2rem"]').first();
    const why = optionA.locator('p', { hasText: 'Why:' }).first();
    const wb = await d.box(why, { inflate: 8 });
    const ob = await d.box(optionA);
    await d.setCam(
      await d.fit({ ...ob, h: wb.y + wb.h - ob.y + 20 }, { pad: 24, bottomSafe: 140, maxZ: 1.6 })
    );
    await d.play(0.6, d.caption('Meta-system', 'The next run follows the approved rule.'));
    await d.play(0.4, d.ring(wb));
    await d.play(2.6, d.drift(0.02));
  },
};

const approve: Scene = {
  name: 'approve',
  run: async (ctx) => {
    const { d, data } = ctx;
    const page = d.page;
    await d.goto({ path: cardPath(data, 'CD-420360'), wait: 'What happened' });
    const optionA = page.locator('div[class*="grid-cols-[2rem"]').first();
    const summary = optionA.locator('summary').first();
    const ob = await d.box(optionA);
    await d.setCam(
      await d.fit(
        { ...ob, y: ob.y + ob.h * 0.35, h: ob.h * 0.65 + 120 },
        { pad: 24, bottomSafe: 140, maxZ: 1.5 }
      )
    );
    const sp = await d.point(summary, { ax: 0.15 });
    d.setCursor({ x: sp.x + 260, y: sp.y + 120 }, 0);
    await d.play(
      0.5,
      d.fadeCursor(1),
      d.caption('Decide', 'Approve, and exactly this plan runs. Nothing else.')
    );
    await d.play(0.8, d.cursorTo(sp));
    await d.click({ onPress: () => d.realClick() });
    await page.waitForTimeout(300);
    const steps = await d.box(optionA.locator('details').first(), { inflate: 10 });
    await d.play(1.0, d.cam(await d.fit(steps, { pad: 40, bottomSafe: 150, maxZ: 1.6 })));
    await d.play(2.2, d.drift(0.02));
    const button = page.getByRole('button', { name: /^Approve A/ }).first();
    const bb = await d.box(button, { inflate: 4 });
    const wont = await d.box(
      ancestor(page.getByText('The agent will not', { exact: true }).first(), 'rounded-panel')
    );
    await d.play(
      1.1,
      d.cam(await d.fit(union(wont, bb), { pad: 24, bottomSafe: 150, maxZ: 1.6 })),
      d.cursorTo({ x: bb.x + bb.w * 0.5, y: bb.y + bb.h * 0.55 }),
      d.caption('Limits', 'Each card also says what the agent will not do.')
    );
    await d.play(2.2, d.drift(0.015));
    if (!ctx.allowWrites) {
      await d.click();
      await d.play(1.0);
      return;
    }
    const t0 = Date.now();
    await d.click({ onPress: () => d.realClick() });
    await d.play(0.3);
    // Let the page refresh itself while the paused run resumes and carries out the plan.
    await page.evaluate(() => ((window as any).__trHidden = false));
    const next = page.getByText('What happens next', { exact: true }).first();
    await page.getByText('The run is done', { exact: false }).first().waitFor({ timeout: 120_000 });
    const sec = Math.max(1, Math.round((Date.now() - t0) / 1000));
    console.log(`approve: run closed ${sec} s after the click`);
    await page.evaluate(() => ((window as any).__trHidden = true));
    await page.waitForTimeout(400);
    await d.install();
    const section = ancestor(next, 'border-t');
    const nb = (await section.count()) ? await d.box(section) : await d.box(next);
    const first = await d.box(next);
    d.setCursor(d.state.cursor, 0);
    await d.setCam(
      await d.fit(
        { x: first.x - 10, y: first.y - 10, w: 700, h: Math.min(nb.h, 420) },
        { pad: 24, bottomSafe: 140, topSafe: 70, maxZ: 1.5 }
      )
    );
    await d.play(
      0.6,
      d.tag(`${sec} s later`),
      d.caption('Carry out', 'The paused run resumes and books it. Bookings here are simulated.')
    );
    await d.play(2.8, d.drift(0.025));
    await shoot(ctx, 'approved');
  },
};

const agents: Scene = {
  name: 'agents',
  run: async (ctx) => {
    const { d } = ctx;
    const page = d.page;
    await d.goto({ path: '/', wait: 'Agents on it' });
    const headingAgents = await d.box(page.getByRole('heading', { name: /Agents on it/ }).first());
    const wait = page.locator('a[href^="/orders/"]', { hasText: 'Waiting until' }).first();
    const wb = await d.box(wait, { inflate: 4 });
    await d.setCam(await d.fit(union(headingAgents, wb), { pad: 40, bottomSafe: 150, maxZ: 1.6 }));
    await d.play(0.6, d.caption('Agents on it', 'Waits are checked against the next commitment.'));
    await d.play(0.4, d.ring(wb));
    await d.play(2.8, d.drift(0.025));
  },
};

// Scrolls the scroll container around `target` so the target sits near its top.
async function scrollTo(d: Director, target: Locator, sec: number) {
  const info = await target.evaluate((el) => {
    let n: HTMLElement | null = el.parentElement;
    while (
      n &&
      !(n.scrollHeight > n.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowY))
    ) {
      n = n.parentElement;
    }
    if (!n) return null;
    n.setAttribute('data-tr-scroll', '1');
    const delta = el.getBoundingClientRect().top - n.getBoundingClientRect().top;
    const max = n.scrollHeight - n.clientHeight;
    return {
      from: n.scrollTop,
      to: Math.min(max, n.scrollTop + delta / (window as any).__trailerZ - 16),
    };
  });
  if (!info) return;
  await d.play(
    sec,
    d.fx((t) => ({ sel: '[data-tr-scroll="1"]', scrollTop: info.from + (info.to - info.from) * t }))
  );
}

const playbook: Scene = {
  name: 'playbook',
  run: async (ctx) => {
    const { d } = ctx;
    const page = d.page;
    await d.goto({ path: '/playbooks/missed-connection', wait: 'Check the whole remaining trip' });
    await page.waitForTimeout(800);
    const collect = await d.box(page.getByText('Check the whole remaining trip').first());
    const decides = await d.box(page.getByText('Dispatcher decides', { exact: true }).first());
    const ask = await d.box(page.getByText('Ask the provider about the failed attempt').first());
    const book = await d.box(page.getByText('Book, cancel and inform').first());
    await d.setCam(
      await d.fit(union(collect, decides, ask, book), { pad: 40, bottomSafe: 130, maxZ: 1.3 })
    );
    await shoot(ctx, 'playbook');
    const block = page.getByText('Rebook the rest of the trip').first();
    const bp = await d.point(block);
    d.setCursor({ x: bp.x + 260, y: bp.y + 200 }, 0);
    await d.play(
      0.6,
      d.fadeCursor(1),
      d.caption(
        'Playbooks',
        'Every exception follows a fixed diagram. AI works only inside its steps.'
      )
    );
    await d.play(0.4, d.drift(0.02));
    await d.play(0.8, d.cursorTo(bp));
    await d.click({ onPress: () => d.realClick() });
    await page.waitForTimeout(500);
    const tools = page.getByText('Tools it may use', { exact: true }).first();
    await tools.waitFor();
    const panelTitle = await d.box(
      page.getByRole('heading', { name: 'Rebook the rest of the trip' }).first()
    );
    const tb = await d.box(tools);
    const blockBox = await d.box(block);
    await d.play(
      1.2,
      d.cam(
        await d.fit(union(blockBox, panelTitle, { ...tb, h: tb.h + 220 }), {
          pad: 24,
          bottomSafe: 140,
          maxZ: 1.4,
        })
      )
    );
    await captionHold(
      d,
      'Playbooks',
      'Click a step: its instructions, its tools and its fixed branches.',
      2.6
    );
    await d.play(0.3, d.fadeCursor(0));
    const approved = page.getByText('Approved changes (chief dispatcher)', { exact: true }).first();
    await page.evaluate((z) => ((window as any).__trailerZ = z), d.state.cam.z);
    await scrollTo(d, approved, 1.0);
    const ab = await d.box(approved);
    const greenBox = { x: ab.x - 6, y: ab.y - 6, w: panelTitle.w + 12, h: 210 };
    await d.play(0.9, d.cam(await d.fit(greenBox, { pad: 40, bottomSafe: 150, maxZ: 1.6 })));
    await captionHold(
      d,
      'Playbooks',
      'Changes learned from dispatchers apply only after approval.',
      2.7
    );
  },
};

const proven: Scene = {
  name: 'proven',
  run: async (ctx) => {
    const { d } = ctx;
    const page = d.page;
    await d.goto({ path: '/playbooks', wait: 'Proven on Bahn' });
    await page.getByText('4 of 4', { exact: true }).first().waitFor({ timeout: 60_000 });
    const heading = await d.box(
      page.getByText('recorded agent proposals, replayed', { exact: false }).first()
    );
    const stat1 = await d.box(page.getByText('4 of 4', { exact: true }).first());
    const stat3 = await d.box(page.getByText('10 of 10', { exact: true }).first());
    const r = union(heading, stat1, stat3, { ...stat3, y: stat3.y + 60 });
    await d.setCam(await d.fit(r, { pad: 30, bottomSafe: 150, maxZ: 1.6 }));
    await shoot(ctx, 'proven');
    await d.play(
      0.6,
      d.caption(
        'Live replay on Bahn’s own 14 decisions',
        '4 of 4 corrected proposals blocked. 0 of 6 approved ones.'
      )
    );
    await d.play(2.6, d.drift(0.02));
    const blockLine = page.getByText('The rules block it', { exact: false }).first();
    const para = await d.box(blockLine.locator('xpath=..'));
    const id = await d.box(page.getByText('CD-420194', { exact: true }).first());
    const row = inflate(union(id, para, { x: id.x, y: id.y, w: 10, h: para.h + 40 }), 10);
    await d.play(1.2, d.cam(await d.fit(row, { pad: 30, bottomSafe: 150, maxZ: 1.4 })));
    await d.play(0.3, d.ring(row));
    await captionHold(
      d,
      'Facts and rules',
      'Each block names the rule. Code checks it, not a model.',
      2.5
    );
  },
};

const meta: Scene = {
  name: 'meta',
  run: async (ctx) => {
    const { d } = ctx;
    const page = d.page;
    await d.goto({ path: '/meta', wait: 'Waiting for the chief dispatcher' });
    const corrected = page.getByText('What the dispatcher corrected', { exact: true }).first();
    const cb = await d.box(corrected);
    const proposal = ancestor(corrected, 'rounded-card');
    const pb = await d.box(proposal);
    const titleBox = { x: pb.x, y: pb.y, w: pb.w, h: cb.y - pb.y + 150 };
    await d.setCam(await d.fit(titleBox, { pad: 24, bottomSafe: 140, maxZ: 1.5 }));
    await shoot(ctx, 'meta');
    await d.play(
      0.6,
      d.caption('Meta-system', 'A dispatcher’s correction becomes a proposed rule.')
    );
    await d.play(2.0, d.drift(0.02));
    const follows = page.getByText('Follows the dispatcher’s correction', { exact: false }).first();
    const fb = await d.box(follows);
    const numbers =
      (await follows.locator('xpath=..').innerText()).split('\n').find((l) => l.includes('%')) ??
      '';
    const after = page.getByText('After approval', { exact: true }).first();
    const ab = await d.box(after);
    const r = union(
      ab,
      fb,
      { x: fb.x, y: fb.y + 70, w: 10, h: 10 },
      { x: pb.x, y: fb.y, w: 10, h: 10 }
    );
    await d.play(1.1, d.cam(await d.fit(r, { pad: 24, bottomSafe: 140, maxZ: 1.5 })));
    const big = { x: fb.x - 10, y: fb.y - 8, w: 270, h: 74 };
    await d.play(0.3, d.ring(big));
    const nums = numbers.replace(/\s+/g, ' ').trim();
    await captionHold(
      d,
      'Backtest on recorded runs',
      `Replayed on recorded runs first. Judge’s confidence: ${nums}.`,
      3.0
    );
    await d.play(0.3, d.ring(null, 0));
    const button = page.getByRole('button', { name: /Approve for every future run/ }).first();
    const bb = await d.box(button);
    await d.play(
      0.9,
      d.cam(
        await d.fit(
          { x: bb.x - 20, y: bb.y - 170, w: 720, h: 230 },
          { pad: 20, bottomSafe: 150, maxZ: 1.5 }
        )
      )
    );
    d.setCursor({ x: bb.x + bb.w + 220, y: bb.y + 90 }, 0);
    await d.play(
      0.4,
      d.fadeCursor(1),
      d.caption('Meta-system', 'Nothing changes until the chief dispatcher says yes.')
    );
    await d.play(0.8, d.cursorTo({ x: bb.x + bb.w * 0.5, y: bb.y + bb.h * 0.55 }));
    // Visual only: the live demo needs this amendment still proposed.
    await d.click();
    await d.play(0.7, d.drift(0.015));
  },
};

const OUTRO_TILES: { still: string; name: string; line: string }[] = [
  {
    still: 'watchman',
    name: 'Watchman',
    line: 'Reads every message and clock, starts the right playbook.',
  },
  { still: 'playbook', name: 'Playbooks', line: 'Fixed diagrams, fixed branches. AI only fills them in.' },
  {
    still: 'proven',
    name: 'Facts and rules',
    line: 'Every claim cites a fact. Code checks every option.',
  },
  { still: 'queue', name: 'Decision cards', line: 'One decision per card, sorted by time left.' },
  { still: 'meta', name: 'Meta-system', line: 'Corrections become rules, tested before approval.' },
];

const outro: Scene = {
  name: 'outro',
  run: async (ctx) => {
    const { d, stills } = ctx;
    await d.goto({ path: '/', wait: 'Needs your decision' });
    const tiles: Tile[] = OUTRO_TILES.map((t) => {
      const file = `${stills}/${t.still}.jpg`;
      const img = existsSync(file)
        ? `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`
        : '';
      return { name: t.name, line: t.line, img };
    });
    await d.setStage(outroHtml(tiles));
    await d.page.waitForTimeout(400);
    d.state.stage = 1;
    const dur = 8.3;
    await d.play(
      dur,
      timeline(d, dur, (s) => {
        const ops: Op[] = [0, 1, 2, 3, 4].map((i) =>
          rise(`t${i}`, s, 0.1 + i * 0.25, 0.7 + i * 0.25, 24)
        );
        const out = prog(s, 5.0, 5.5);
        ops.push({
          sel: '#tr-stage [data-a="grid"]',
          style: { opacity: String(1 - out), transform: `scale(${1 - 0.03 * out})` },
        });
        ops.push(rise('end', s, 5.5, 6.1, 16));
        return ops;
      })
    );
  },
};

export const SCENES: Scene[] = [
  title,
  message,
  queue,
  cardFacts,
  agents,
  playbook,
  proven,
  meta,
  nextRun,
  approve,
  outro,
];

// Assembly order differs from recording order: approve writes, so it is recorded last before the outro.
export const TRAILER_ORDER = [
  'title',
  'message',
  'queue',
  'card-facts',
  'approve',
  'agents',
  'playbook',
  'proven',
  'meta',
  'next-run',
  'outro',
];
