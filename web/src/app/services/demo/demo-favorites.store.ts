import { Injectable, computed, effect, signal } from '@angular/core';

import { DemoFavoriteSeed, DemoScenarioId } from './demo-scenarios';
import { DemoSeedService } from './demo-seed.service';

const STORAGE_KEY = '__demo_favorites__';
const FAVORITOS_SCENARIO_ID: DemoScenarioId = 'favoritos-export';

@Injectable({ providedIn: 'root' })
export class DemoFavoritesStore {
  private readonly favoritesSignal = signal<DemoFavoriteSeed[]>(this.restore());
  readonly favorites = this.favoritesSignal.asReadonly();
  readonly favoriteIds = computed(() => new Set(this.favoritesSignal().map(item => item.id)));

  constructor(private readonly seeds: DemoSeedService) {
    const exportScenario = this.seeds.getScenario(FAVORITOS_SCENARIO_ID);
    if (exportScenario.favoritesSeed?.length) {
      this.initializeDefaults(exportScenario.favoritesSeed);
    }

    effect(() => {
      const list = this.favoritesSignal();
      this.persist(list);
    });
  }

  toggleFavorite(seed: DemoFavoriteSeed): void {
    const exists = this.favoriteIds().has(seed.id);
    this.favoritesSignal.update(current => {
      if (exists) {
        return current.filter(item => item.id !== seed.id);
      }
      return [...current, seed];
    });
  }

  clear(): void {
    this.favoritesSignal.set([]);
  }

  restoreDefaults(): void {
    const scenario = this.seeds.getScenario(FAVORITOS_SCENARIO_ID);
    const defaults = scenario.favoritesSeed ?? [];
    if (!defaults.length) {
      this.clear();
      return;
    }
    this.favoritesSignal.set(defaults.map(seed => ({ ...seed })));
  }

  private initializeDefaults(defaults: DemoFavoriteSeed[]): void {
    if (this.favoritesSignal().length) {
      return;
    }
    this.favoritesSignal.set(defaults.map(seed => ({ ...seed })));
  }

  private restore(): DemoFavoriteSeed[] {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return [];
      }
      return JSON.parse(stored) as DemoFavoriteSeed[];
    } catch (error) {
      console.warn('[DemoFavoritesStore] Failed to restore favorites', error);
      return [];
    }
  }

  private persist(list: DemoFavoriteSeed[]): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (error) {
      console.warn('[DemoFavoritesStore] Failed to persist favorites', error);
    }
  }
}
