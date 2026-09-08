/** "1.4 MB", "820 KB", "2.1 GB"; empty when the size is unknown. */
export const formatBytes = (bytes?: number | null): string => {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
};

/** "July 2023" for a "2023-07" month key. */
export const formatMonthKey = (monthKey: string): string => {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return monthKey;
  try {
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return monthKey;
  }
};
