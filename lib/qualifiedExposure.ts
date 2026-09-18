import { readSession, writeSession } from "./browserStorage";

/** Only acknowledged, continuously visible impressions are marked as recorded. */
export function observeQualifiedExposures(
  elements: HTMLElement[],
  recorded: Set<string>,
  record: (id: string) => Promise<void>,
) {
  const visible = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const attempts = new Map<string, number>();
  const pending = new Set<string>();
  let disposed = false;
  const arm = (id: string) => {
    if (disposed || recorded.has(id) || timers.has(id) || pending.has(id)
      || !visible.has(id) || document.visibilityState !== "visible" || (attempts.get(id) || 0) >= 3) return;
    const storageKey = `indieclash_exposure_${id}_${new Date().toISOString().slice(0, 10)}`;
    if (readSession(storageKey)) { recorded.add(id); return; }
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      if (disposed || !visible.has(id) || document.visibilityState !== "visible") return;
      attempts.set(id, (attempts.get(id) || 0) + 1);
      pending.add(id);
      void record(id).then(() => {
        recorded.add(id);
        writeSession(storageKey, "1");
      }).catch(() => {
        // A failed telemetry request must neither lock the UI nor suppress retries.
      }).finally(() => { pending.delete(id); arm(id); });
    }, 4_000 * ((attempts.get(id) || 0) + 1)));
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.qualifiedExposureId;
      if (!id) continue;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.7) { visible.add(id); arm(id); }
      else { visible.delete(id); clearTimeout(timers.get(id)); timers.delete(id); }
    }
  }, { threshold: [0.7] });
  elements.forEach((element) => observer.observe(element));
  const visibilityChanged = () => {
    timers.forEach(clearTimeout);
    timers.clear();
    if (document.visibilityState === "visible") visible.forEach(arm);
  };
  document.addEventListener("visibilitychange", visibilityChanged);
  return () => {
    disposed = true;
    observer.disconnect();
    timers.forEach(clearTimeout);
    document.removeEventListener("visibilitychange", visibilityChanged);
  };
}
