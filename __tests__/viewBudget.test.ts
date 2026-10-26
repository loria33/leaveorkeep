import {
  formatCountdown,
  getViewBudget,
  LOW_BUDGET_FRACTION,
} from '../src/utils/viewBudget';

describe('getViewBudget', () => {
  it('is calm while plenty of views remain', () => {
    const budget = getViewBudget(40, 55, false);
    expect(budget.tone).toBe('ok');
    expect(budget.label).toBe('40 views left');
    expect(budget.fraction).toBeCloseTo(40 / 55);
  });

  it('turns amber at the low threshold', () => {
    const low = Math.floor(55 * LOW_BUDGET_FRACTION);
    expect(getViewBudget(low, 55, false).tone).toBe('low');
    expect(getViewBudget(low + 1, 55, false).tone).toBe('ok');
  });

  it('uses the singular for one view', () => {
    expect(getViewBudget(1, 55, false).label).toBe('1 view left');
  });

  it('reports the limit when blocked or empty', () => {
    expect(getViewBudget(0, 55, true)).toMatchObject({
      tone: 'blocked',
      label: 'Limit reached',
      fraction: 0,
    });
    expect(getViewBudget(0, 55, false).tone).toBe('blocked');
    expect(getViewBudget(3, 55, true).tone).toBe('blocked');
  });

  it('clamps out-of-range values', () => {
    expect(getViewBudget(99, 55, false).fraction).toBe(1);
    expect(getViewBudget(-3, 55, false).remaining).toBe(0);
    expect(getViewBudget(5, 0, false).fraction).toBe(1);
  });

  it('gives each tone its own colour', () => {
    const colours = new Set(
      [
        getViewBudget(40, 55, false),
        getViewBudget(5, 55, false),
        getViewBudget(0, 55, true),
      ].map(b => b.color),
    );
    expect(colours.size).toBe(3);
  });
});

describe('formatCountdown', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatCountdown(12 * 60 * 1000 + 34 * 1000)).toBe('12:34');
    expect(formatCountdown(5 * 1000)).toBe('0:05');
  });

  it('rounds up partial seconds and never goes negative', () => {
    expect(formatCountdown(1500)).toBe('0:02');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-4000)).toBe('0:00');
  });
});
