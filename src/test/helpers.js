/**
 * A stand-in for i18next's `t()` used across service functions.
 * Returns the key itself (with interpolation params appended) instead of a
 * real translation, so tests assert on stable keys rather than on
 * human-readable strings that can change per locale.
 */
export function fakeT(key, params) {
  return params ? `${key}::${JSON.stringify(params)}` : key;
}
