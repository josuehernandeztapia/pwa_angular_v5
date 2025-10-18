import { Injectable, signal } from '@angular/core';

export interface KeyboardShortcut {
  combo: string;
  description: string;
  context?: string;
}

interface RegisterOptions {
  /**
   * Optional explicit index where the shortcut should be inserted.
   * Values outside the current range fall back to push at the end.
   */
  position?: number;
}

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService {
  private readonly defaultShortcuts: KeyboardShortcut[] = [
    { combo: 'Ctrl + K', description: 'Búsqueda global', context: 'App' },
    { combo: 'Ctrl + N', description: 'Nueva cotización', context: 'Cotizador' },
    { combo: 'Ctrl + C', description: 'Nuevo cliente', context: 'Clientes' },
    { combo: 'Ctrl + D', description: 'Subir documento', context: 'Documentos' },
    { combo: 'Ctrl + /', description: 'Enfocar búsqueda global', context: 'App' },
    { combo: '?', description: 'Ver atajos de teclado', context: 'App' }
  ];

  private readonly shortcutsState = signal<KeyboardShortcut[]>([...this.defaultShortcuts]);
  readonly shortcuts = this.shortcutsState.asReadonly();

  private readonly openState = signal(false);
  readonly isOpenSignal = this.openState.asReadonly();

  getShortcuts(): KeyboardShortcut[] {
    return [...this.shortcutsState()];
  }

  registerShortcut(shortcut: KeyboardShortcut, options: RegisterOptions = {}): void {
    if (!shortcut?.combo?.trim()) {
      return;
    }

    const normalizedCombo = shortcut.combo.trim();
    const sanitized: KeyboardShortcut = {
      ...shortcut,
      combo: normalizedCombo
    };

    const current = this.shortcutsState();
    const existingIndex = current.findIndex(item => item.combo.toLowerCase() === normalizedCombo.toLowerCase());
    let updated = [...current];

    if (existingIndex !== -1) {
      updated[existingIndex] = { ...updated[existingIndex], ...sanitized };
    } else if (options.position !== undefined && options.position >= 0 && options.position <= current.length) {
      updated = [
        ...current.slice(0, options.position),
        sanitized,
        ...current.slice(options.position)
      ];
    } else {
      updated = [...current, sanitized];
    }

    this.shortcutsState.set(updated);
  }

  registerShortcuts(shortcuts: KeyboardShortcut[]): void {
    shortcuts.forEach(shortcut => this.registerShortcut(shortcut));
  }

  removeShortcut(combo: string): void {
    if (!combo) {
      return;
    }
    const lowered = combo.toLowerCase();
    const filtered = this.shortcutsState().filter(item => item.combo.toLowerCase() !== lowered);
    this.shortcutsState.set(filtered);
  }

  reset(): void {
    this.shortcutsState.set([...this.defaultShortcuts]);
  }

  isOpen(): boolean {
    return this.openState();
  }

  open(): void {
    this.openState.set(true);
  }

  close(): void {
    this.openState.set(false);
  }

  toggle(): void {
    this.openState.update(value => !value);
  }
}
