// New workers.dev routes and secrets can take a short time to propagate.
// Retry only the public health check; never retry authentication or generation.
export async function waitForRemoteReady(base, {
  fetchImpl = fetch,
  attempts = 12,
  delayMs = 5000,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response;
    try {
      response = await fetchImpl(new URL('/healthz', base), {
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      lastError = error;
    }
    if (response) {
      if (response.ok) {
        const body = await response.json();
        if (body.status !== 'ok') throw new Error('Unexpected /healthz response');
        return;
      }
      lastError = new Error(`/healthz: ${response.status}`);
      await response.body?.cancel();
      if (![404, 502, 503, 504].includes(response.status)) throw lastError;
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error('Remote service did not become ready within the retry window', {cause: lastError});
}
