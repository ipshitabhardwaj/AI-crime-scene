/** Current time in ms. A function so server components can use it without lint noise. */
export function nowMs(): number {
  return Date.now();
}
