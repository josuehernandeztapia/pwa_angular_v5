import { Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { safeWindow } from '@services/utils/ssr/safe-window.util';

export interface FlowContextEntry<T = any> {
  key: string;
  data: T;
  breadcrumbs?: string[];
  timestamp: number;
  expiresAt?: number | null;
}

export interface FlowContextOptions {
  breadcrumbs?: string[];
  /** Time to live in milliseconds */
  ttlMs?: number;
  /** Persist entry to storage (default true) */
  persist?: boolean;
}

@Injectable({ providedIn: 'root' })
export class FlowContextService {
  private readonly storageKey = '__flow_context_state__';
  private readonly contextMap = new Map<string, FlowContextEntry<any>>();
  private readonly breadcrumbsSignal = signal<string[]>(['Dashboard']);
  private readonly contextsSignal = signal<FlowContextEntry<any>[]>([]);

  readonly breadcrumbs = this.breadcrumbsSignal.asReadonly();
  readonly contexts = this.contextsSignal.asReadonly();

  readonly breadcrumbs$ = toObservable(this.breadcrumbsSignal);
  readonly contexts$ = toObservable(this.contextsSignal);

  constructor() {
    this.restoreFromStorage();
  }

  saveContext<T>(key: string, data: T, options: FlowContextOptions = {}): FlowContextEntry<T> {
    const persist = options.persist ?? true;
    const existing = this.contextMap.get(key);
    const entry: FlowContextEntry<T> = {
      key,
      data: this.clone(data),
      breadcrumbs: options.breadcrumbs ?? existing?.breadcrumbs,
      timestamp: Date.now(),
      expiresAt: options.ttlMs ? Date.now() + options.ttlMs : existing?.expiresAt ?? null
    };

    this.contextMap.set(key, entry);

    if (entry.breadcrumbs && entry.breadcrumbs.length) {
      this.setBreadcrumbs(entry.breadcrumbs);
    }

    if (persist) {
      this.persist();
    }

    this.emitContexts();

    return entry;
  }

  updateContext<T>(key: string, updater: (current: T | null) => T, options: FlowContextOptions = {}): FlowContextEntry<T> {
    const current = this.getContextData<T>(key);
    const next = updater(current);
    const existing = this.contextMap.get(key);
    return this.saveContext(key, next, {
      breadcrumbs: options.breadcrumbs ?? existing?.breadcrumbs,
      ttlMs: options.ttlMs ?? (existing?.expiresAt ? existing.expiresAt - Date.now() : undefined),
      persist: options.persist
    });
  }

  getContext<T>(key: string): FlowContextEntry<T> | null {
    const entry = this.contextMap.get(key) as FlowContextEntry<T> | undefined;
    if (!entry) {
      return null;
    }

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.contextMap.delete(key);
      this.persist();
      this.emitContexts();
      return null;
    }

    return entry;
  }

  getContextData<T>(key: string): T | null {
    const entry = this.getContext<T>(key);
    return entry ? this.clone(entry.data) : null;
  }

  clearContext(key: string, persist = true): void {
    if (this.contextMap.delete(key) && persist) {
      this.persist();
    }
    this.emitContexts();
  }

  clearAll(): void {
    this.contextMap.clear();
    this.persist();
    this.emitContexts();
  }

  setBreadcrumbs(breadcrumbs: string[]): void {
    if (!breadcrumbs || breadcrumbs.length === 0) {
      this.breadcrumbsSignal.set(['Dashboard']);
      return;
    }
    this.breadcrumbsSignal.set([...breadcrumbs]);
  }

  private persist(): void {
    const windowRef = safeWindow();
    if (!windowRef?.sessionStorage) {
      return;
    }

    try {
      const serialized = JSON.stringify(Array.from(this.contextMap.values()));
      windowRef.sessionStorage.setItem(this.storageKey, serialized);
    } catch (error) {
      // Swallow storage errors (quota / private mode)
    }
  }

  private restoreFromStorage(): void {
    const windowRef = safeWindow();
    if (!windowRef?.sessionStorage) {
      return;
    }

    try {
      const raw = windowRef.sessionStorage.getItem(this.storageKey);
      if (!raw) {
        this.emitContexts();
        return;
      }

      const parsed: FlowContextEntry[] = JSON.parse(raw);
      const now = Date.now();
      parsed.forEach(entry => {
        if (entry.expiresAt && now > entry.expiresAt) {
          return;
        }
        this.contextMap.set(entry.key, entry);
      });
      this.emitContexts();
    } catch (error) {
      // Ignore parse errors and start fresh
      this.contextMap.clear();
      this.emitContexts();
    }
  }

  private clone<T>(value: T): T {
    if (value === undefined || value === null) {
      return value;
    }

    try {
      return structuredClone(value);
    } catch {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return value;
      }
    }
  }

  private emitContexts(): void {
    const snapshot = Array.from(this.contextMap.values()).map(entry => ({
      ...entry,
      data: this.clone(entry.data)
    }));
    this.contextsSignal.set(snapshot);
  }
}
