// Red = promise or safety at stake, orange = needs a decision soon, teal = agent or live work, green = confirmed.
export type Tone = 'danger' | 'warn' | 'ok' | 'info' | 'neutral';

export const TONE_TEXT: Record<Tone, string> = {
  danger: 'text-danger-ink',
  warn: 'text-warn-ink',
  ok: 'text-ok-ink',
  info: 'text-info-ink',
  neutral: 'text-secondary',
};

export const TONE_SOFT: Record<Tone, string> = {
  danger: 'bg-danger-soft text-danger-ink',
  warn: 'bg-warn-soft text-warn-ink',
  ok: 'bg-ok-soft text-ok-ink',
  info: 'bg-info-soft text-info-ink',
  neutral: 'bg-neutral-soft text-neutral-ink',
};

export const TONE_LINE: Record<Tone, string> = {
  danger: 'border-danger-line',
  warn: 'border-warn-line',
  ok: 'border-ok-line',
  info: 'border-info-line',
  neutral: 'border-line',
};

export const TONE_DOT: Record<Tone, string> = {
  danger: 'bg-danger',
  warn: 'bg-warn',
  ok: 'bg-ok',
  info: 'bg-info',
  neutral: 'bg-grey-400',
};
