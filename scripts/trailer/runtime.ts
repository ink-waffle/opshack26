// In-page runtime for the trailer recorder: camera transform on <body>, cursor, captions, overlays.
// Kept as a plain JS string so tsx/esbuild helpers never leak into page.evaluate.

export const MARK_PATH =
  'M15.2105 0C18.2887 0 20.7841 2.49479 20.7841 5.57175C20.784 8.64861 18.2886 11.1431 15.2105 11.1431H5.57817C5.1046 11.1431 4.7207 11.5268 4.7207 12.0002C4.72081 12.4735 5.10467 12.8573 5.57817 12.8573H18.426C21.5042 12.8573 23.9996 15.3517 23.9996 18.4287C23.9995 21.5055 21.5041 24 18.426 24H0V19.2858H18.426C18.8995 19.2858 19.2834 18.902 19.2835 18.4287C19.2835 17.9553 18.8996 17.5715 18.426 17.5715H5.57817C2.50005 17.5715 0.0047187 15.0771 0.00460556 12.0002C0.00460556 8.92325 2.49998 6.42888 5.57817 6.42888H15.2105C15.684 6.42888 16.0679 6.04503 16.068 5.57175C16.068 5.09837 15.6841 4.71462 15.2105 4.71462H0.00125606V0H15.2105Z';

const CSS = `
nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
html { overflow: hidden !important; background: #f1eee6 !important; scrollbar-width: none; }
html::-webkit-scrollbar { display: none; }
body { transform-origin: 0 0; overflow: visible !important; }
* { caret-color: transparent; }
#tr-cursor { position: absolute; left: 0; top: 0; width: 28px; height: 28px; z-index: 2147483600; pointer-events: none;
  transform-origin: 0 0; filter: drop-shadow(0 2px 3px rgb(18 17 14 / 0.28)); opacity: 0; }
#tr-ripple { position: absolute; left: 0; top: 0; width: 48px; height: 48px; margin: -24px 0 0 -24px; border-radius: 999px;
  z-index: 2147483500; pointer-events: none; border: 2px solid #12110e; background: rgb(18 17 14 / 0.08); opacity: 0; }
#tr-ring { position: absolute; left: 0; top: 0; z-index: 2147483400; pointer-events: none; border-radius: 14px;
  box-shadow: 0 0 0 3px #43afc1, 0 0 0 9px rgb(67 175 193 / 0.18); opacity: 0; }
#tr-caption { position: fixed; left: 40px; bottom: 34px; z-index: 2147483640; max-width: 1060px; pointer-events: none;
  padding: 16px 26px 19px; background: rgb(255 254 247 / 0.97); border-radius: 18px;
  box-shadow: 0 0 0 1px #ccc6ba, 0 22px 44px -18px rgb(66 61 51 / 0.42); opacity: 0; }
#tr-caption .eb { display: flex; align-items: center; gap: 9px; font-family: var(--font-poppins), sans-serif;
  font-size: 15px; line-height: 20px; font-weight: 500; color: #726958; margin-bottom: 6px; }
#tr-caption .eb i { width: 9px; height: 9px; border-radius: 99px; background: #43afc1; display: inline-block; }
#tr-caption .tx { font-family: var(--font-archivo), sans-serif; font-variation-settings: 'wdth' 112; font-size: 29px;
  line-height: 35px; font-weight: 800; color: #12110e; letter-spacing: -0.005em; }
#tr-tag { position: fixed; right: 40px; top: 96px; z-index: 2147483640; pointer-events: none; display: flex; align-items: center;
  gap: 10px; padding: 10px 18px; border-radius: 999px; background: #12110e; color: #fffef7; opacity: 0;
  font-family: var(--font-poppins), sans-serif; font-size: 18px; font-weight: 500; }
#tr-tag i { width: 9px; height: 9px; border-radius: 99px; background: #43afc1; display: inline-block; }
#tr-dim { position: fixed; inset: 0; z-index: 2147483300; pointer-events: none; background: rgb(241 238 230 / 0.72);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); opacity: 0; }
#tr-stage { position: fixed; inset: 0; z-index: 2147483620; pointer-events: none; opacity: 0;
  font-family: var(--font-poppins), sans-serif; color: #2a2721; }
#tr-stage .display { font-family: var(--font-archivo), sans-serif; font-variation-settings: 'wdth' 118; font-weight: 800;
  color: #12110e; letter-spacing: -0.01em; }
`;

export const RUNTIME_SRC = `(() => {
  if (window.__trailer) return true;
  const W = window.innerWidth, H = window.innerHeight;
  const st = document.createElement('style'); st.id = 'tr-style'; st.textContent = ${JSON.stringify(CSS)};
  document.head.appendChild(st);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__trHidden === false ? 'visible' : 'hidden' });
  window.scrollTo(0, 0);
  const mk = (id, parent, html) => { const el = document.createElement('div'); el.id = id; if (html) el.innerHTML = html; parent.appendChild(el); return el; };
  const cursor = mk('tr-cursor', document.body, '<svg viewBox="0 0 28 28" width="28" height="28"><path d="M5 3.2 L5 22.6 L10.1 17.9 L13.4 25.4 L16.9 23.9 L13.7 16.5 L20.6 16.3 Z" fill="#12110e" stroke="#fffef7" stroke-width="1.6" stroke-linejoin="round"/></svg>');
  const ripple = mk('tr-ripple', document.body);
  const ring = mk('tr-ring', document.body);
  const dim = mk('tr-dim', document.documentElement);
  const stage = mk('tr-stage', document.documentElement);
  const tag = mk('tr-tag', document.documentElement, '<i></i><span></span>');
  const caption = mk('tr-caption', document.documentElement, '<div class="eb"><i></i><span></span></div><div class="tx"></div>');
  let last = {};
  const apply = (s) => {
    const { cam } = s;
    const tx = W / 2 - cam.x * cam.z, ty = H / 2 - cam.y * cam.z;
    document.body.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + cam.z + ')';
    for (const el of [cursor, ripple, ring]) if (el.parentNode !== document.body) document.body.appendChild(el);
    if (!document.getElementById('tr-style')) document.head.appendChild(st);
    const cs = Math.pow(cam.z, 0.4) / cam.z * (1 - 0.14 * s.cursor.press);
    cursor.style.opacity = s.cursor.o;
    cursor.style.transform = 'translate(' + (s.cursor.x - 5 * cs) + 'px,' + (s.cursor.y - 3 * cs) + 'px) scale(' + cs + ')';
    if (s.ripple.t >= 0 && s.ripple.t <= 1) {
      const rs = (0.35 + 1.1 * s.ripple.t) * Math.pow(cam.z, 0.4) / cam.z;
      ripple.style.opacity = String(0.55 * (1 - s.ripple.t));
      ripple.style.transform = 'translate(' + s.ripple.x + 'px,' + s.ripple.y + 'px) scale(' + rs + ')';
    } else ripple.style.opacity = '0';
    ring.style.opacity = s.ring.o;
    ring.style.left = s.ring.x + 'px'; ring.style.top = s.ring.y + 'px';
    ring.style.width = s.ring.w + 'px'; ring.style.height = s.ring.h + 'px';
    dim.style.opacity = s.dim;
    stage.style.opacity = s.stage;
    if (last.capEb !== s.caption.eyebrow) caption.querySelector('.eb span').textContent = s.caption.eyebrow;
    if (last.capTx !== s.caption.text) caption.querySelector('.tx').textContent = s.caption.text;
    caption.querySelector('.eb').style.display = s.caption.eyebrow ? 'flex' : 'none';
    caption.style.opacity = s.caption.o;
    caption.style.transform = 'translateY(' + (1 - s.caption.o) * 14 + 'px)';
    if (last.tag !== s.tag.text) tag.querySelector('span').textContent = s.tag.text;
    tag.style.opacity = s.tag.o;
    tag.style.transform = 'translateY(' + (1 - s.tag.o) * -10 + 'px)';
    last = { capEb: s.caption.eyebrow, capTx: s.caption.text, tag: s.tag.text };
    for (const op of s.ops) {
      const els = op.sel === '#tr-stage' ? [stage] : Array.from(document.querySelectorAll(op.sel));
      for (const el of els) {
        if (op.html !== undefined && el.__trHtml !== op.html) { el.innerHTML = op.html; el.__trHtml = op.html; }
        if (op.text !== undefined && el.textContent !== op.text) el.textContent = op.text;
        if (op.style) Object.assign(el.style, op.style);
        if (op.scrollTop !== undefined) el.scrollTop = op.scrollTop;
      }
    }
    return true;
  };
  window.__trailer = { apply, W, H };
  return true;
})()`;
