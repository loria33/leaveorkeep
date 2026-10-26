/**
 * Presentation helpers for the free "views left" budget shown to non-premium
 * users. Pure functions, so the header badge and the upgrade sheet agree on
 * wording, thresholds and colours.
 */

export type ViewBudgetTone = 'ok' | 'low' | 'blocked';

export interface ViewBudget {
  tone: ViewBudgetTone;
  /** Views still available, clamped to 0..max */
  remaining: number;
  max: number;
  /** Share of the budget still available, 0..1 */
  fraction: number;
  /** Short badge text: "12 views left", "1 view left", "Limit reached" */
  label: string;
  /** Accent colour for text and the fill bar */
  color: string;
  background: string;
  border: string;
}

/** At or below this share of the budget the badge turns amber */
export const LOW_BUDGET_FRACTION = 0.2;

const PALETTE: Record<
  ViewBudgetTone,
  Pick<ViewBudget, 'color' | 'background' | 'border'>
> = {
  ok: {
    color: '#00D9FF',
    background: 'rgba(0, 217, 255, 0.2)',
    border: 'rgba(0, 217, 255, 0.4)',
  },
  low: {
    color: '#FFC857',
    background: 'rgba(255, 200, 87, 0.2)',
    border: 'rgba(255, 200, 87, 0.45)',
  },
  blocked: {
    color: '#FF7A8A',
    background: 'rgba(255, 122, 138, 0.2)',
    border: 'rgba(255, 122, 138, 0.45)',
  },
};

export const getViewBudget = (
  remaining: number,
  max: number,
  isBlocked: boolean,
): ViewBudget => {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.max(0, Math.min(remaining, safeMax));
  const fraction = clamped / safeMax;

  let tone: ViewBudgetTone = 'ok';
  if (isBlocked || clamped === 0) {
    tone = 'blocked';
  } else if (fraction <= LOW_BUDGET_FRACTION) {
    tone = 'low';
  }

  const label =
    tone === 'blocked'
      ? 'Limit reached'
      : `${clamped} ${clamped === 1 ? 'view' : 'views'} left`;

  return {
    tone,
    remaining: clamped,
    max: safeMax,
    fraction,
    label,
    ...PALETTE[tone],
  };
};

/** "12:34" for a millisecond countdown; rounds up and never goes negative. */
export const formatCountdown = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};
