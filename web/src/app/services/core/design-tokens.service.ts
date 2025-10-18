import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

export type DataColorName =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'accent'
  | 'highlight';

export type ChartColorGroup = 'line' | 'bar' | 'progress';

type TokenResolver = (variableName: string) => string;

interface TokenFactory {
  color: {
    bg: {
      readonly light: string;
      readonly dark: string;
    };
    panel: {
      readonly light: string;
      readonly dark: string;
    };
    text: {
      readonly primary: string;
      readonly secondary: string;
      readonly inverse: string;
    };
    brand: {
      readonly primary: string;
      readonly success: string;
      readonly warn: string;
      readonly danger: string;
    };
    data: Record<DataColorName, string>;
    chart: {
      line: {
        readonly primary: string;
        readonly secondary: string;
        readonly grid: string;
        readonly axis: string;
      };
      bar: {
        readonly primary: string;
        readonly secondary: string;
        readonly tertiary: string;
        readonly background: string;
      };
      progress: {
        readonly complete: string;
        readonly inProgress: string;
        readonly pending: string;
      };
    };
    readonly border: string;
    hover: {
      readonly light: string;
      readonly dark: string;
    };
  };
  radius: {
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
  };
  shadow: {
    readonly sm: string;
    readonly md: string;
  };
  font: {
    readonly family: string;
    size: {
      readonly xs: string;
      readonly sm: string;
      readonly base: string;
      readonly lg: string;
      readonly xl: string;
      readonly ['2xl']: string;
      readonly ['3xl']: string;
    };
    weight: {
      readonly normal: string;
      readonly medium: string;
      readonly semibold: string;
      readonly bold: string;
    };
  };
  spacing: {
    readonly xs: string;
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
    readonly xl: string;
    readonly ['2xl']: string;
  };
  transition: {
    readonly fast: string;
    readonly normal: string;
    readonly slow: string;
  };
  breakpoint: {
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
    readonly xl: string;
  };
}

const buildDesignTokens = (resolve: TokenResolver): TokenFactory => ({
  color: {
    bg: {
      get light() { return resolve('--color-bg-secondary'); },
      get dark() { return resolve('--openai-black'); }
    },
    panel: {
      get light() { return resolve('--openai-white'); },
      get dark() { return resolve('--color-primary-800'); }
    },
    text: {
      get primary() { return resolve('--color-text-primary'); },
      get secondary() { return resolve('--color-text-secondary'); },
      get inverse() { return resolve('--color-bg-tertiary'); }
    },
    brand: {
      get primary() { return resolve('--openai-black'); },
      get success() { return resolve('--accent-primary'); },
      get warn() { return resolve('--accent-muted'); },
      get danger() { return resolve('--accent-danger'); }
    },
    data: {
      get primary() { return resolve('--accent-primary-hover'); },
      get secondary() { return resolve('--accent-primary'); },
      get tertiary() { return resolve('--accent-primary-hover'); },
      get warning() { return resolve('--accent-muted'); },
      get danger() { return resolve('--accent-danger'); },
      get neutral() { return resolve('--color-text-secondary'); },
      get accent() { return resolve('--accent-primary'); },
      get highlight() { return resolve('--accent-primary-hover'); }
    } as Record<DataColorName, string>,
    chart: {
      line: {
        get primary() { return resolve('--accent-primary-hover'); },
        get secondary() { return resolve('--accent-primary'); },
        get grid() { return resolve('--color-border-primary'); },
        get axis() { return resolve('--color-text-secondary'); }
      },
      bar: {
        get primary() { return resolve('--accent-primary-hover'); },
        get secondary() { return resolve('--accent-primary'); },
        get tertiary() { return resolve('--accent-primary-hover'); },
        background: 'transparent'
      },
      progress: {
        get complete() { return resolve('--accent-primary'); },
        get inProgress() { return resolve('--accent-primary-hover'); },
        get pending() { return resolve('--color-text-secondary'); }
      }
    },
    get border() { return resolve('--color-border-primary'); },
    hover: {
      get light() { return resolve('--color-bg-tertiary'); },
      get dark() { return resolve('--color-border-focus'); }
    }
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '12px'
  },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.06)',
    md: '0 8px 25px rgba(0,0,0,0.10)'
  },
  font: {
    family: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    size: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem'
    },
    weight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700'
    }
  },
  spacing: {
    xs: '6px',
    sm: '10px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px'
  },
  transition: {
    fast: '150ms ease-in-out',
    normal: '300ms ease-in-out',
    slow: '500ms ease-in-out'
  },
  breakpoint: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px'
  }
});

@Injectable({ providedIn: 'root' })
export class DesignTokensService {
  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly tokens = buildDesignTokens(variable => this.resolveCssColor(variable));

  getToken(path: string): string {
    if (!path) {
      return '';
    }

    const segments = path.split('.');
    let current: any = this.tokens;

    for (const segment of segments) {
      if (current && typeof current === 'object' && segment in current) {
        current = current[segment as keyof typeof current];
      } else {
        return '';
      }
    }

    return typeof current === 'string' ? current : '';
  }

  dataColor(name: DataColorName): string {
    return this.tokens.color.data[name];
  }

  chartColor(group: ChartColorGroup, colorKey: string): string {
    const chartGroup = this.tokens.color.chart[group] as Record<string, string> | undefined;
    return chartGroup?.[colorKey] ?? '';
  }

  private resolveCssColor(variableName: string): string {
    if (!this.isBrowser) {
      return `var(${variableName})`;
    }

    const documentElement = this.documentRef?.documentElement;
    const windowRef = this.documentRef?.defaultView;

    if (!documentElement || !windowRef?.getComputedStyle) {
      return `var(${variableName})`;
    }

    try {
      const styles = windowRef.getComputedStyle(documentElement);
      const value = styles.getPropertyValue(variableName).trim();
      return value || `var(${variableName})`;
    } catch {
      return `var(${variableName})`;
    }
  }
}

