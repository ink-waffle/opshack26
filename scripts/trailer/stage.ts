// HTML for full-screen stage overlays: title, driver message + watchman reading, outro.

import type { TrailerData } from '@/scripts/trailer/data';
import { MARK_PATH } from '@/scripts/trailer/runtime';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CARD =
  'background:#fffef7;border-radius:20px;box-shadow:0 0 0 1px #e2ded4,0 24px 48px -22px rgb(66 61 51 / 0.45);';

const mark = (size: number, color = '#12110e') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="display:block"><path fill="${color}" d="${MARK_PATH}"/></svg>`;

export function titleHtml() {
  return `
<div style="position:absolute;inset:0;background:#f1eee6;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <div data-a="logo" style="display:flex;align-items:center;gap:16px;opacity:0">
    ${mark(46)}<div class="display" style="font-size:40px;line-height:1">Control Room</div>
  </div>
  <div data-a="l1" class="display" style="font-size:70px;line-height:1.08;margin-top:58px;opacity:0">Agents prepare the decision.</div>
  <div data-a="l2" class="display" style="font-size:70px;line-height:1.08;opacity:0;color:#2c707b">People make it.</div>
  <div data-a="sub" style="margin-top:44px;font-size:20px;color:#726958;opacity:0">For Bahn’s car delivery exceptions: ferries, breakdowns, drivers, pickups</div>
</div>`;
}

export function messageHtml(data: TrailerData) {
  const rows = data.labels
    .map(
      (l, i) => `
    <div style="margin-top:${i === 0 ? 18 : 14}px">
      <div style="display:flex;align-items:baseline;gap:12px">
        <div style="font-size:16px;line-height:22px;color:${i === 0 ? '#12110e' : '#423d33'};font-weight:${i === 0 ? 600 : 500}">${esc(l.label)}</div>
        <div style="margin-left:auto;font-family:var(--font-reddit-mono),monospace;font-size:17px;font-weight:600;color:${i === 0 ? '#2c707b' : '#5a5346'}" data-a="p${i}">0.00</div>
      </div>
      <div style="margin-top:7px;height:8px;border-radius:99px;background:#ebe7de;overflow:hidden">
        <div data-a="bar${i}" style="height:100%;width:0%;border-radius:99px;background:${i === 0 ? '#43afc1' : '#b7afa0'}"></div>
      </div>
    </div>`
    )
    .join('');
  const initials = data.driver
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  return `
<div style="position:absolute;left:0;right:0;top:96px;display:flex;justify-content:center;align-items:flex-start;gap:22px">
  <div data-a="chat" style="${CARD}width:560px;padding:22px 24px 24px;opacity:0">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:42px;height:42px;border-radius:99px;background:#e2ded4;display:flex;align-items:center;justify-content:center;font-weight:600;color:#423d33;font-size:15px">${esc(initials)}</div>
      <div>
        <div style="font-weight:600;font-size:17px;color:#12110e;line-height:22px">${esc(data.driver)}</div>
        <div style="font-size:14px;color:#726958;line-height:20px">Driver · driver chat · <span style="font-family:var(--font-reddit-mono),monospace">${esc(data.orderRef)}</span></div>
      </div>
      <div style="margin-left:auto;font-size:14px;color:#8a7f6b">12:00 EEST</div>
    </div>
    <div data-a="typing" style="margin-top:18px;display:inline-flex;gap:6px;background:#f1eee6;border-radius:4px 16px 16px 16px;padding:14px 16px">
      <i data-a="d0" style="width:8px;height:8px;border-radius:99px;background:#8a7f6b;display:block"></i>
      <i data-a="d1" style="width:8px;height:8px;border-radius:99px;background:#8a7f6b;display:block"></i>
      <i data-a="d2" style="width:8px;height:8px;border-radius:99px;background:#8a7f6b;display:block"></i>
    </div>
    <div data-a="bubble" style="display:none;margin-top:18px;background:#f1eee6;border-radius:4px 16px 16px 16px;padding:14px 18px;font-size:18px;line-height:28px;color:#2a2721">“${esc(data.message)}”</div>
  </div>
  <div data-a="arrow" style="align-self:center;opacity:0;color:#8a7f6b">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
  </div>
  <div data-a="watch" style="${CARD}width:540px;padding:22px 24px 24px;opacity:0">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:42px;height:42px;border-radius:12px;background:#dcf4f7;display:flex;align-items:center;justify-content:center;color:#2c707b">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>
      </div>
      <div>
        <div style="font-weight:600;font-size:17px;color:#12110e;line-height:22px">Watchman</div>
        <div style="font-size:14px;color:#726958;line-height:20px">Jev, a typed decision model, scores the message</div>
      </div>
    </div>
    ${rows}
    <div data-a="route" style="margin-top:22px;opacity:0;display:flex;align-items:center;gap:10px;background:#dcf4f7;border-radius:12px;padding:12px 14px;color:#2c707b;font-size:16px;font-weight:500">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      Starts the playbook <span style="color:#12110e;font-weight:600">${esc(data.playbook)}</span>
    </div>
  </div>
</div>`;
}

export type Tile = { name: string; line: string; img: string };

export function outroHtml(tiles: Tile[]) {
  const tile = (t: Tile, i: number) => `
  <div data-a="t${i}" style="width:404px;opacity:0">
    <div style="${CARD}padding:7px;border-radius:16px"><img src="${t.img}" style="display:block;width:390px;height:219px;border-radius:10px;object-fit:cover"/></div>
    <div style="margin-top:14px;display:flex;align-items:baseline;gap:10px">
      <span style="font-family:var(--font-reddit-mono),monospace;font-size:14px;color:#8a7f6b">${i + 1}</span>
      <span class="display" style="font-size:22px">${esc(t.name)}</span>
    </div>
    <div style="margin-top:4px;font-size:16px;line-height:23px;color:#423d33">${esc(t.line)}</div>
  </div>`;
  return `
<div style="position:absolute;inset:0;background:#f1eee6">
  <div data-a="grid" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px">
    <div style="display:flex;gap:28px">${tiles.slice(0, 3).map(tile).join('')}</div>
    <div style="display:flex;gap:28px">${tiles
      .slice(3)
      .map((t, i) => tile(t, i + 3))
      .join('')}</div>
  </div>
  <div data-a="end" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0">
    <div style="display:flex;align-items:center;gap:16px">${mark(52)}<div class="display" style="font-size:46px;line-height:1">Control Room</div></div>
    <div class="display" style="margin-top:46px;font-size:46px;line-height:1.15">Built by “SELL Me This Hackathon” and Claude.</div>
    <div style="margin-top:18px;font-size:21px;color:#726958">For Bahn’s challenge “The Car Delivery Control Room” · Prompt Operations Hackathon 2026</div>
    <div style="margin-top:34px;display:inline-flex;align-items:center;gap:10px;padding:12px 20px;border-radius:999px;background:#12110e;color:#fffef7;font-family:var(--font-reddit-mono),monospace;font-size:19px">github.com/ink-waffle/opshack26</div>
  </div>
</div>`;
}
