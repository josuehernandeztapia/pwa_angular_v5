/**
 * Lightweight financial math helpers used across quoting and simulation services.
 * These implementations intentionally avoid external dependencies so they can
 * execute inside both browser and test environments.
 */

/**
 * Round a number to a given precision (defaults to 2 decimal places).
 */
export function round2(value: number, precision: number = 2): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

/**
 * Convert a number of months to years, rounding up so partial years count as a full year.
 */
export function monthsToYearsCeil(months: number): number {
  if (!Number.isFinite(months)) {
    return 0;
  }
  return Math.ceil(months / 12);
}

/**
 * Convert a monthly rate (expressed as decimal) to its annual equivalent using compounding.
 */
export function toAnnualFromMonthly(monthlyRate: number): number {
  if (!Number.isFinite(monthlyRate)) {
    return 0;
  }
  return Math.pow(1 + monthlyRate, 12) - 1;
}

/**
 * Financial annuity formula. Returns the periodic payment required to amortize a principal
 * with a fixed rate and number of periods. When the rate is zero we simply return
 * the linear amortization value.
 */
export function annuity(principal: number, periodicRate: number, periods: number): number {
  if (periods <= 0) {
    return 0;
  }
  if (periodicRate === 0) {
    return principal / periods;
  }

  const factor = Math.pow(1 + periodicRate, periods);
  return principal * (periodicRate * factor) / (factor - 1);
}
