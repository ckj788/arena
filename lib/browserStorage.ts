// Privacy settings and storage quotas must not break navigation or discovery.
export function readSession(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
export function writeSession(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch {}
}
export function removeSession(key: string): void {
  try { sessionStorage.removeItem(key); } catch {}
}
export function discoverySeed(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
