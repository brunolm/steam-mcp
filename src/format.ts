export function toHours(minutes: number | undefined): number {
  return Math.round(((minutes ?? 0) / 60) * 10) / 10;
}

export function unixToDate(seconds: number | undefined): string | undefined {
  if (!seconds) return undefined;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
