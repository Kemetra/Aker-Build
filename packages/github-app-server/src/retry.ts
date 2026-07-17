export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  jitter?: () => number;
  onRetry?: (attempt: number) => void;
  signal?: AbortSignal;
}

export async function retryTransient<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const jitter = options.jitter ?? Math.random;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    throwIfAborted(options.signal);
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientGitHubError(error)) throw error;
      options.onRetry?.(attempt);
      const delayMs = baseDelayMs * 2 ** (attempt - 1) + Math.floor(baseDelayMs * Math.max(0, jitter()));
      await delay(delayMs, options.signal);
    }
  }
  throw new Error("retry attempts exhausted");
}

export function isTransientGitHubError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error && typeof error.status === "number" ? error.status : undefined;
  if (status !== undefined) return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  return code !== undefined && ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"].includes(code);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("operation aborted");
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("operation aborted"));
      },
      { once: true },
    );
  });
}
