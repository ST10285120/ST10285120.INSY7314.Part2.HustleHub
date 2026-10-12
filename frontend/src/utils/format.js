const priceFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPrice(amount) {
  return `R${priceFormatter.format(Number(amount))}`;
}
