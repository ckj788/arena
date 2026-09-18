/** Bound the entire operation, including stalled session locks and response bodies.
 * Mutations are never automatically retried: a lost response may have committed.
 */
export async function withDeadline<T>(operation: PromiseLike<T>, ms = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("The request timed out. Check your connection. Before resubmitting, check whether your last action succeeded.")), ms);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function fetchJsonWithDeadline<T>(input: RequestInfo | URL, init?: RequestInit, ms = 20_000) {
  const controller = new AbortController();
  try {
    return await withDeadline((async () => {
      const response = await fetch(input, { ...init, signal: controller.signal });
      const payload = await response.json() as T;
      return { response, payload };
    })(), ms);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("The service returned an invalid response. Please try again later.");
    if (error instanceof TypeError) throw new Error("Unable to reach Indie Clash. Please check your connection.");
    throw error;
  } finally { controller.abort(); }
}
