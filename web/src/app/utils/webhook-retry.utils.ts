import { Observable, defer, throwError, timer } from 'rxjs';
import { mergeMap, retryWhen, scan, tap } from 'rxjs/operators';

export interface WebhookRetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  backoffMultiplier: number;
  jitterRatio: number;
  failureThreshold: number;
  cooldownMs: number;
  maxDelayMs: number;
}

export const DEFAULT_WEBHOOK_RETRY_CONFIG: WebhookRetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  backoffMultiplier: 2,
  jitterRatio: 0.25,
  failureThreshold: 4,
  cooldownMs: 60_000,
  maxDelayMs: 60_000
};

export const WEBHOOK_PROVIDER_CONFIGS: Record<string, Partial<WebhookRetryConfig>> = {
  DEFAULT: {},
  WHATSAPP: { maxAttempts: 6, baseDelayMs: 1500 },
  METAMAP: { maxAttempts: 4, failureThreshold: 3 },
  MIFIEL: { maxAttempts: 5, baseDelayMs: 2000 },
  ODOO: { maxAttempts: 5, baseDelayMs: 1200 },
  CONEKTA: { maxAttempts: 4, baseDelayMs: 1800 }
};

type CircuitState = {
  failures: number;
  openedAt?: number;
};

export class WebhookRetryService {
  private readonly config: WebhookRetryConfig;
  private circuitBreaker = new Map<string, CircuitState>();

  constructor(config: Partial<WebhookRetryConfig> = {}) {
    this.config = { ...DEFAULT_WEBHOOK_RETRY_CONFIG, ...config };
  }

  getConfig(): WebhookRetryConfig {
    return { ...this.config };
  }

  recordSuccess(endpoint: string): void {
    this.circuitBreaker.delete(endpoint);
  }

  recordFailure(endpoint: string): void {
    const state = this.circuitBreaker.get(endpoint) ?? { failures: 0 };
    state.failures += 1;

    if (state.failures >= this.config.failureThreshold) {
      state.openedAt = Date.now();
    }

    this.circuitBreaker.set(endpoint, state);
  }

  checkCircuitBreaker(endpoint: string): boolean {
    const state = this.circuitBreaker.get(endpoint);
    if (!state?.openedAt) {
      return true;
    }

    const elapsed = Date.now() - state.openedAt;
    if (elapsed >= this.config.cooldownMs) {
      this.circuitBreaker.delete(endpoint);
      return true;
    }
    return false;
  }

  getNextDelay(attempt: number): number {
    const exponent = Math.max(attempt - 1, 0);
    const baseDelay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, exponent);
    const jitter = baseDelay * this.config.jitterRatio * (Math.random() - 0.5) * 2;
    const delay = Math.max(this.config.baseDelayMs, Math.round(baseDelay + jitter));
    return Math.min(delay, this.config.maxDelayMs);
  }

  getOpenCircuits(): string[] {
    const now = Date.now();
    const entries: string[] = [];
    this.circuitBreaker.forEach((state, endpoint) => {
      if (state.openedAt && now - state.openedAt <= this.config.cooldownMs) {
        entries.push(endpoint);
      }
    });
    return entries;
  }

  static withExponentialBackoff<T>(
    observable: Observable<T> | (() => Observable<T>),
    config?: Partial<WebhookRetryConfig>
  ): Observable<T> {
    const retryService = new WebhookRetryService(config);
    const retryConfig = retryService.getConfig();
    const source$ = typeof observable === 'function' ? defer(observable as () => Observable<T>) : observable;
    const endpointKey = (config as any)?.endpointKey ?? 'default';

    return source$.pipe(
      tap(() => retryService.recordSuccess(endpointKey)),
      retryWhen(errors =>
        errors.pipe(
          scan((acc: { attempt: number; error: any }, error: any) => ({ attempt: acc.attempt + 1, error }), {
            attempt: 0,
            error: null as any
          }),
          mergeMap(({ attempt, error }) => {
            if (attempt >= retryConfig.maxAttempts) {
              return throwError(() => error ?? new Error('Webhook retry attempts exhausted'));
            }

            retryService.recordFailure(endpointKey);
            if (!retryService.checkCircuitBreaker(endpointKey)) {
              return throwError(() => error ?? new Error('Webhook circuit breaker open'));
            }

            const delayMs = retryService.getNextDelay(attempt);
            return timer(delayMs);
          })
        )
      )
    );
  }
}

type DeadLetterEntry = {
  endpoint: string;
  payload: any;
  error: any;
  attempts: number;
  timestamp: number;
};

export class WebhookDeadLetterQueue {
  private static instance: WebhookDeadLetterQueue | null = null;
  private queue: DeadLetterEntry[] = [];
  private readonly maxSize = 200;

  static getInstance(): WebhookDeadLetterQueue {
    if (!this.instance) {
      this.instance = new WebhookDeadLetterQueue();
    }
    return this.instance;
  }

  addFailedWebhook(endpoint: string, payload: any, error: any, attempts: number): void {
    this.queue.unshift({ endpoint, payload, error, attempts, timestamp: Date.now() });
    if (this.queue.length > this.maxSize) {
      this.queue.pop();
    }
  }

  getFailedWebhooks(): DeadLetterEntry[] {
    return [...this.queue];
  }

  clearDeadLetterQueue(): void {
    this.queue = [];
  }
}
