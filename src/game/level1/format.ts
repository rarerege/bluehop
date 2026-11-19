/** Pure formatting helpers for Level 1 (no Pixi imports, so they are unit-testable). */

/** Format a 48-bit BD_ADDR as XX:XX:XX:XX:XX:XX. */
export function formatBdAddr(addr: number): string {
  const hex = Math.floor(addr).toString(16).padStart(12, '0').toUpperCase();
  return hex.match(/../g)!.join(':');
}

/** AM_ADDR as 3 bits, e.g. 3 → "011". */
export function amBits(am: number): string {
  return am.toString(2).padStart(3, '0');
}

/** PM_ADDR as 2 hex digits (8 bits), e.g. 1 → "01". */
export function pmHex(pm: number): string {
  return pm.toString(16).padStart(2, '0').toUpperCase();
}
