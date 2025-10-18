/**
 * Formatting helpers shared by quoting and dashboard visualizations.
 */

const MXN_FORMATTER = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatCurrencyMXN(value: number): string {
  if (!Number.isFinite(value)) {
    return MXN_FORMATTER.format(0);
  }
  return MXN_FORMATTER.format(value);
}
