import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MockUtilityAdapter {
  readonly networkSimulation = {
    fast: 200,
    normal: 500,
    slow: 1200,
    timeout: 8000
  } as const;

  mockApi<T>(data: T, delayMs: number = this.networkSimulation.normal): Observable<T> {
    return new Observable<T>(observer => {
      const timer = setTimeout(() => {
        try {
          observer.next(this.deepCloneWithDates(data));
          observer.complete();
        } catch (error) {
          observer.error(error);
        }
      }, delayMs);

      return () => clearTimeout(timer);
    });
  }

  delay<T>(data: T, delayMs: number = this.networkSimulation.normal): Promise<T> {
    return new Promise(resolve => {
      setTimeout(() => resolve(this.deepCloneWithDates(data)), delayMs);
    });
  }

  private deepCloneWithDates<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as any;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepCloneWithDates(item)) as any;
    }

    const cloned = {} as any;
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      cloned[key] = this.deepCloneWithDates((obj as any)[key]);
    }
    return cloned;
  }
}
