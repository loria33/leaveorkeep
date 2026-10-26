/**
 * Shared look for the app's modern dark surfaces: deep navy backgrounds,
 * white type, glassy translucent cards and a per-skin accent colour.
 */

export type Skin = 'pink' | 'blue';

export const colors = {
  ink: '#0B1020',
  sheet: '#141A2A',
  text: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.72)',
  textMuted: 'rgba(255, 255, 255, 0.45)',
  surface: 'rgba(255, 255, 255, 0.06)',
  surfaceRaised: 'rgba(255, 255, 255, 0.12)',
  border: 'rgba(255, 255, 255, 0.1)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  teal: '#4ECDC4',
  cyan: '#00D9FF',
  amber: '#FFC857',
  coral: '#FF7A8A',
  tabBar: '#0F1527',
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};

export interface SkinTheme {
  /** Top-to-bottom background gradient stops */
  background: [string, string, string];
  accent: string;
  /** Text colour that reads on top of the accent */
  accentInk: string;
  accentSoft: string;
  accentBorder: string;
  /** Two soft light pools layered over the background */
  glowA: string;
  glowB: string;
}

export const skinThemes: Record<Skin, SkinTheme> = {
  blue: {
    background: ['#0B1020', '#121A2E', '#1B2340'],
    accent: colors.teal,
    accentInk: colors.ink,
    accentSoft: 'rgba(78, 205, 196, 0.16)',
    accentBorder: 'rgba(78, 205, 196, 0.45)',
    glowA: 'rgba(78, 205, 196, 0.06)',
    glowB: 'rgba(0, 217, 255, 0.05)',
  },
  pink: {
    background: ['#140A17', '#201127', '#2B1636'],
    accent: '#FF5C8A',
    accentInk: '#1A0A12',
    accentSoft: 'rgba(255, 92, 138, 0.16)',
    accentBorder: 'rgba(255, 92, 138, 0.45)',
    glowA: 'rgba(255, 92, 138, 0.06)',
    glowB: 'rgba(205, 182, 255, 0.05)',
  },
};

export const getSkinTheme = (skin: Skin): SkinTheme => skinThemes[skin];

/** Restrained tints that give the month list rhythm without competing with content */
export const monthTints = [
  { bg: 'rgba(159, 211, 255, 0.16)', fg: '#9FD3FF' },
  { bg: 'rgba(205, 182, 255, 0.16)', fg: '#CDB6FF' },
  { bg: 'rgba(168, 240, 225, 0.16)', fg: '#A8F0E1' },
  { bg: 'rgba(255, 179, 193, 0.16)', fg: '#FFB3C1' },
];

export const MONTH_ABBREVIATIONS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/** Floating tab bar geometry; scrolling screens reserve getTabBarClearance() at the bottom */
export const TAB_BAR_HEIGHT = 66;
export const TAB_BAR_BOTTOM_GAP = 12;
export const getTabBarClearance = (bottomInset: number): number =>
  TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + Math.max(bottomInset, 16) + 12;
/** Clearance for StyleSheets that cannot read the safe-area inset (sized for the tallest one) */
export const TAB_BAR_CLEARANCE_STATIC = getTabBarClearance(34);
