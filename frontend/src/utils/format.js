const priceFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPrice(amount) {
  return `R${priceFormatter.format(Number(amount) || 0)}`;
}

/** 0.1968 -> "19.7%" */
export function formatPercent(rate) {
  const pct = Math.round((Number(rate) || 0) * 1000) / 10;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2027-02-28" or an ISO timestamp -> "28 Feb 2027" */
export function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : dateFormatter.format(d);
}
