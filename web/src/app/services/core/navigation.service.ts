import { Injectable } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';
import { Location } from '@angular/common';
import { environment } from '@environments/environment';
import { IconName } from '@shared/icon/icon-definitions';
import { safeWindow } from '@services/utils/ssr/safe-window.util';
import { COTIZADOR_CONTEXTS, getCotizadorNavigationItems, getCotizadorQuickActions, resolveCotizadorPreset } from '../../cotizador/cotizador-contexts';
import { FlowCompletionService } from './flow-completion.service';
import { SummaryMetric } from '@shared/summary-panel.component';
import { PolicyClientType, PolicyMarket } from '@feature-services/configuration/market-policy.service';

export interface BreadcrumbItem {
  label: string;
  route?: string;
  icon?: IconName;
  iconType?: IconName;
  params?: any;
}

export interface NavigationState {
  currentRoute: string;
  previousRoute: string | null;
  breadcrumbs: BreadcrumbItem[];
  pageTitle: string;
  showBackButton: boolean;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: IconName;
  iconType?: IconName;
  route?: string;
  queryParams?: Record<string, any>;
  action?: () => void;
  badge?: number;
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  disabled?: boolean;
  tooltip?: string;
  active?: boolean;
}

export interface ShellNavigationItem {
  label: string;
  route: string;
  iconType: IconName;
  dataCy?: string;
  badge?: number;
  featureFlag?: keyof typeof environment.features;
  queryParams?: Record<string, any>;
  children?: ShellNavigationItem[];
  tooltip?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  private navigationState = new BehaviorSubject<NavigationState>({
    currentRoute: '/',
    previousRoute: null,
    breadcrumbs: [],
    pageTitle: 'Conductores PWA',
    showBackButton: false
  });

  private routeHistory: string[] = [];
  private maxHistoryLength = 10;

  public navigationState$ = this.navigationState.asObservable();

  // Route configurations for breadcrumbs and titles
  private routeConfig: Record<string, {
    title: string;
    breadcrumbs?: BreadcrumbItem[];
    showBackButton?: boolean;
  }> = {
    '/dashboard': {
      title: 'Panel Principal',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' }
      ]
    },
    '/nueva-oportunidad': {
      title: 'Nueva Oportunidad',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Nueva Oportunidad', iconType: 'plus' }
      ],
      showBackButton: true
    },
    '/cotizador': {
      title: 'Cotizador',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Cotizador', iconType: 'currency-dollar' }
      ]
    },
    '/quotation': {
      title: 'Resumen de Cotización',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Cotizador', route: '/cotizador', iconType: 'currency-dollar' },
        { label: 'Resumen', iconType: 'document-text' }
      ],
      showBackButton: true
    },
    '/quotation/create': {
      title: 'Crear Cotización',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Cotizador', route: '/cotizador', iconType: 'currency-dollar' },
        { label: 'Crear cotización', iconType: 'plus' }
      ],
      showBackButton: true
    },
    '/cotizador/ags-individual': {
      title: 'Cotizador AGS Individual',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Cotizador', route: '/cotizador', iconType: 'currency-dollar' },
        { label: 'AGS Individual', iconType: 'truck' }
      ],
      showBackButton: true
    },
    '/cotizador/edomex-colectivo': {
      title: 'Cotizador EdoMex Colectivo',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Cotizador', route: '/cotizador', iconType: 'currency-dollar' },
        { label: 'EdoMex Colectivo', iconType: 'handshake' }
      ],
      showBackButton: true
    },
    '/simulador': {
      title: 'Simulador de Escenarios',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Simulador', iconType: 'target' }
      ]
    },
    '/simulador/ags-ahorro': {
      title: 'Simulador AGS Ahorro',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Simulador', route: '/simulador', iconType: 'target' },
        { label: 'AGS Ahorro', iconType: 'lightbulb' }
      ],
      showBackButton: true
    },
    '/simulador/edomex-individual': {
      title: 'Simulador EdoMex Individual',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Simulador', route: '/simulador', iconType: 'target' },
        { label: 'EdoMex Individual', iconType: 'bank' }
      ],
      showBackButton: true
    },
    '/simulador/tanda-colectiva': {
      title: 'Simulador Tanda Colectiva',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Simulador', route: '/simulador', iconType: 'target' },
        { label: 'Tanda Colectiva', iconType: 'snow' }
      ],
      showBackButton: true
    },
    '/clientes': {
      title: 'Gestión de Clientes',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Clientes', iconType: 'users' }
      ]
    },
    '/expedientes': {
      title: 'Expedientes Digitales',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Expedientes', iconType: 'document-text' }
      ]
    },
    '/proteccion': {
      title: 'Protección Financiera',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Protección', iconType: 'shield' }
      ]
    },
    '/reportes': {
      title: 'Reportes y Análisis',
      breadcrumbs: [
        { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
        { label: 'Reportes', iconType: 'chart' }
      ]
    }
  };

  constructor(
    private router: Router,
    private location: Location,
    private activatedRoute: ActivatedRoute,
    private completion: FlowCompletionService
  ) {
    this.initializeNavigation();
  }

  /**
   * Initialize navigation tracking
   */
  private initializeNavigation(): void {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event) => {
      const navigationEndEvent = event as NavigationEnd;
      this.updateNavigationState(navigationEndEvent.urlAfterRedirects);
    });
  }

  /**
   * Update navigation state based on current route
   */
  private updateNavigationState(url: string): void {
    const currentState = this.navigationState.value;
    const previousRoute = (currentState.currentRoute && currentState.currentRoute !== '/' && currentState.currentRoute !== url)
      ? currentState.currentRoute
      : null;

    // Update route history
    if (previousRoute) {
      this.routeHistory.push(previousRoute);
      if (this.routeHistory.length > this.maxHistoryLength) {
        this.routeHistory.shift();
      }
    }

    const [path, queryString] = url.split('?');
    const params = new URLSearchParams(queryString ?? '');
    const presetParam = params.get('preset');
    const presetContext = resolveCotizadorPreset(presetParam ?? undefined);

    const defaultConfig = {
      title: 'Conductores PWA',
      breadcrumbs: [{ label: 'Dashboard', route: '/dashboard', iconType: 'home' as IconName }],
      showBackButton: false
    };

    const baseConfig = this.routeConfig[path] || defaultConfig;
    let config = this.routeConfig[url] || baseConfig;

    if (path === '/cotizador' && presetContext) {
      const baseBreadcrumbs = baseConfig.breadcrumbs ?? defaultConfig.breadcrumbs;
      config = {
        title: `Cotizador - ${presetContext.label}`,
        breadcrumbs: [
          ...baseBreadcrumbs,
          { label: presetContext.label, iconType: presetContext.iconType, route: url }
        ],
        showBackButton: true
      };
    }

    // Update navigation state
    this.navigationState.next({
      currentRoute: url,
      previousRoute,
      breadcrumbs: config.breadcrumbs || [],
      pageTitle: config.title,
      showBackButton: config.showBackButton || false
    });
  }

  /**
   * Navigate to a specific route
   */
  navigateTo(route: string, queryParams?: any, fragment?: string): Promise<boolean> {
    return this.router.navigate([route], { queryParams, fragment });
  }

  /**
   * Navigate back to previous route
   */
  navigateBack(): void {
    if (this.routeHistory.length > 0) {
      const previousRoute = this.routeHistory.pop();
      if (previousRoute) {
        this.router.navigate([previousRoute]);
        return;
      }
    }

    const win = safeWindow();
    // Fallback to browser back or dashboard
    if (win?.history && win.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  /**
   * Navigate to dashboard
   */
  navigateHome(): Promise<boolean> {
    return this.router.navigate(['/dashboard']);
  }

  /**
   * Get current page title
   */
  getCurrentPageTitle(): Observable<string> {
    return this.navigationState$.pipe(
      map(state => state.pageTitle)
    );
  }

  /**
   * Get current breadcrumbs
   */
  getCurrentBreadcrumbs(): Observable<BreadcrumbItem[]> {
    return this.navigationState$.pipe(
      map(state => state.breadcrumbs)
    );
  }

  /**
   * Check if back button should be shown
   */
  shouldShowBackButton(): Observable<boolean> {
    return this.navigationState$.pipe(
      map(state => state.showBackButton)
    );
  }

  /**
   * Get quick actions for current route
   */
  getShellNavigationItems(): ShellNavigationItem[] {
    const items: ShellNavigationItem[] = [
      { label: 'Dashboard', route: '/dashboard', iconType: 'home', dataCy: 'nav-dashboard' },
      { label: 'Clientes', route: '/clientes', iconType: 'users', dataCy: 'nav-clientes' },
      {
        label: 'Cotizador',
        route: '/cotizador',
        iconType: 'calculator',
        dataCy: 'nav-cotizador',
        children: getCotizadorNavigationItems().map(context => ({
          label: context.label,
          route: context.route,
          iconType: context.iconType,
          dataCy: context.dataCy,
          queryParams: context.queryParams
        }))
      },
      {
        label: 'Simulador',
        route: '/simulador',
        iconType: 'target',
        dataCy: 'nav-simulador',
        children: [
          { label: 'Plan de Ahorro', route: '/simulador/ags-ahorro', iconType: 'piggy-bank', dataCy: 'nav-simulador-ahorro' },
          { label: 'Venta a Plazo', route: '/simulador/edomex-individual', iconType: 'credit-card', dataCy: 'nav-simulador-plazo' },
          { label: 'Tanda Colectiva', route: '/simulador/tanda-colectiva', iconType: 'users', dataCy: 'nav-simulador-tanda' }
        ]
      },
      { label: 'Documentos', route: '/documentos', iconType: 'document', dataCy: 'nav-documentos' },
      { label: 'Entregas', route: '/entregas', iconType: 'truck', dataCy: 'nav-entregas' },
      { label: 'GNV', route: '/gnv', iconType: 'fuel', dataCy: 'nav-gnv', featureFlag: 'enableGnvBff' },
      { label: 'Protección', route: '/proteccion', iconType: 'shield', dataCy: 'nav-proteccion' },
      {
        label: 'Configuración',
        route: '/configuracion',
        iconType: 'settings',
        dataCy: 'nav-configuracion',
        children: [
          { label: 'General', route: '/configuracion', iconType: 'settings', dataCy: 'nav-config-general' },
          { label: 'Políticas', route: '/configuracion/politicas', iconType: 'document-text', dataCy: 'nav-config-politicas' },
          { label: 'Flow Builder', route: '/configuracion/flow-builder', iconType: 'link', dataCy: 'nav-config-flow', featureFlag: 'enableFlowBuilder' },
          { label: 'Integraciones', route: '/integraciones', iconType: 'package', dataCy: 'nav-integraciones', featureFlag: 'enableIntegrationsConfig' },
          { label: 'Administración', route: '/administracion', iconType: 'shield', dataCy: 'nav-admin', featureFlag: 'enableAdminConfig' },
          { label: 'Uso del Sistema', route: '/usage', iconType: 'device-mobile', dataCy: 'nav-usage', featureFlag: 'enableUsageModule' }
        ]
      }
    ];

    return this.filterNavigationItems(items);
  }

  private filterNavigationItems(items: ShellNavigationItem[]): ShellNavigationItem[] {
    return items
      .filter(item => this.isFeatureEnabled(item.featureFlag))
      .map(item => ({
        ...item,
        children: item.children ? this.filterNavigationItems(item.children) : undefined
      }));
  }

  private isFeatureEnabled(flag?: keyof typeof environment.features): boolean {
    if (!flag) {
      return true;
    }

    const features = environment.features as Record<string, any>;
    return features[flag] !== false;
  }

  getQuickActions(): Observable<QuickAction[]> {
    return this.navigationState$.pipe(
      map(state => {
        const route = state.currentRoute === '/' ? '/dashboard' : state.currentRoute;
        
        // Define quick actions based on current route
        switch (route) {
          case '/dashboard':
            return this.markCurrentRoute(route, [
              {
                id: 'new-opportunity',
                label: 'Nueva Oportunidad',
                icon: 'plus',
                iconType: 'plus',
                route: '/nueva-oportunidad',
                color: 'primary' as const,
                tooltip: 'Crear una nueva oportunidad'
              },
              {
                id: 'quick-quote',
                label: 'Cotización Rápida',
                icon: 'currency-dollar',
                iconType: 'currency-dollar',
                route: '/cotizador',
                queryParams: { source: 'quick-action', view: 'new-quote' },
                color: 'success' as const,
                tooltip: 'Abrir el cotizador con el flujo rápido'
              },
              {
                id: 'simulator',
                label: 'Simulador',
                icon: 'target',
                iconType: 'target',
                route: '/simulador',
                queryParams: { source: 'quick-action' },
                color: 'secondary' as const,
                tooltip: 'Ir al simulador de escenarios'
              },
              {
                id: 'documents-hub',
                label: 'Documentos',
                icon: 'document',
                iconType: 'document',
                route: '/documentos',
                queryParams: { source: 'quick-action' },
                color: 'warning' as const,
                tooltip: 'Revisar documentación pendiente'
              },
              {
                id: 'post-sale',
                label: 'Postventa',
                icon: 'clipboard-list',
                iconType: 'clipboard-list',
                route: '/postventa',
                queryParams: { source: 'quick-action' },
                color: 'primary' as const,
                tooltip: 'Gestionar upselling postventa'
              }
            ]);

          case '/clientes':
            return this.markCurrentRoute(route, [
              {
                id: 'new-client',
                label: 'Nuevo Cliente',
                icon: 'user',
                iconType: 'user',
                route: '/clientes/nuevo',
                queryParams: { source: 'quick-action' },
                color: 'primary' as const,
                tooltip: 'Registrar un nuevo cliente'
              },
              {
                id: 'import-clients',
                label: 'Importar',
                icon: 'download-tray',
                iconType: 'download-tray',
                route: '/clientes',
                queryParams: { view: 'import', source: 'quick-action' },
                color: 'secondary' as const,
                tooltip: 'Importar clientes desde archivo'
              }
            ]);

          case '/cotizador':
            return this.markCurrentRoute(route, getCotizadorQuickActions().map(context => {
              const queryParams = context.queryParams ? { ...context.queryParams } : {};
              if (!('source' in queryParams)) {
                queryParams['source'] = 'quick-action';
              }
              return {
                id: context.id,
                label: context.label,
                icon: context.iconType,
                iconType: context.iconType,
                route: context.route,
                queryParams,
                color: context.color,
                tooltip: context.tooltip
              };
            }));

          case '/simulador':
            return this.markCurrentRoute(route, [
              {
                id: 'ags-saving',
                label: 'AGS Ahorro',
                icon: 'lightbulb',
                iconType: 'lightbulb',
                route: '/simulador/ags-ahorro',
                queryParams: { source: 'quick-action' },
                color: 'warning' as const,
                tooltip: 'Comparar escenarios de ahorro AGS'
              },
              {
                id: 'edomex-individual',
                label: 'EdoMex Individual',
                icon: 'bank',
                iconType: 'bank',
                route: '/simulador/edomex-individual',
                queryParams: { source: 'quick-action' },
                color: 'primary' as const,
                tooltip: 'Escenario individual Estado de México'
              },
              {
                id: 'collective-tanda',
                label: 'Tanda Colectiva',
                icon: 'snow',
                iconType: 'snow',
                route: '/simulador/tanda-colectiva',
                queryParams: { source: 'quick-action' },
                color: 'secondary' as const,
                tooltip: 'Simular una tanda colectiva'
              }
            ]);

          default:
            return [];
        }
      })
    );
  }

  /**
   * Execute quick action
   */
  executeQuickAction(actionId: string): void {
    // Find the action and execute it
    this.getQuickActions().pipe(take(1)).subscribe(actions => {
      const action = actions.find(a => a.id === actionId);
      if (action) {
        if (action.disabled) {
          return;
        }
        if (action.route) {
          this.navigateTo(action.route, action.queryParams).then(() => {
            this.maybeShowQuickActionOverlay(action);
          });
        } else if (action.action) {
          action.action();
        }
      }
    });
  }

  refreshQuickActions(): void {
    const current = this.navigationState.getValue();
    this.navigationState.next({ ...current });
  }

  private maybeShowQuickActionOverlay(action: QuickAction): void {
    if (!action.route) {
      return;
    }

    if (action.route.startsWith('/cotizador')) {
      this.presentCotizadorQuickActionOverlay(action);
      return;
    }

    if (action.route.startsWith('/simulador')) {
      this.presentSimulatorQuickActionOverlay(action);
      return;
    }

    if (action.route.startsWith('/documentos')) {
      this.presentDocumentsQuickActionOverlay(action);
      return;
    }

    if (action.route.startsWith('/postventa')) {
      this.presentPostSaleQuickActionOverlay(action);
    }
  }

  private presentCotizadorQuickActionOverlay(action: QuickAction): void {
    const presetCandidate = (action.queryParams?.['preset'] as string | undefined) ?? action.id;
    const context = resolveCotizadorPreset(presetCandidate) ?? COTIZADOR_CONTEXTS.find(item => item.id === action.id);

    const metrics: SummaryMetric[] = context
      ? [
          { label: 'Mercado', value: this.getMarketLabel(context.market) },
          { label: 'Tipo de cliente', value: this.getClientTypeLabel(context.clientType) }
        ]
      : [
          { label: 'Contexto', value: action.label ?? 'Cotizador' }
        ];

    metrics.push({
      label: 'Dato origen',
      value: environment.features.enableMockData ? 'DEMO' : 'REAL',
      badge: environment.features.enableMockData ? 'warning' : 'success'
    });

    const nextSteps = [
      'Revisa el paquete sugerido y ajusta condiciones comerciales.',
      'Formaliza la cotización o consulta otro preset si es necesario.'
    ];

    this.completion.open({
      title: context ? `Cotizador listo (${context.label})` : 'Cotizador listo',
      description: 'El cotizador se configuró con el contexto seleccionado. Continúa desde el paso de producto.',
      metrics,
      nextSteps,
      actions: [
        {
          id: 'go-cotizador',
          label: 'Trabajar cotización',
          kind: 'primary',
          execute: () => Promise.resolve()
        },
        {
          id: 'open-dashboard',
          label: 'Ver dashboard',
          kind: 'ghost',
          execute: () => this.navigateTo('/dashboard')
        }
      ]
    });
  }

  private presentSimulatorQuickActionOverlay(action: QuickAction): void {
    const scenarioLabel = action.label ?? 'Simulador';
    const metrics: SummaryMetric[] = [
      { label: 'Escenario', value: scenarioLabel },
      {
        label: 'Modo de datos',
        value: environment.features.enableMockData ? 'DEMO' : 'REAL',
        badge: environment.features.enableMockData ? 'warning' : 'success'
      }
    ];

    const nextSteps = [
      'Ajusta variables de enganche y plazo para comparar opciones.',
      'Guarda el escenario y compártelo con el equipo comercial.'
    ];

    this.completion.open({
      title: `Simulador listo (${scenarioLabel})`,
      description: 'Configura los parámetros y guarda el escenario para tu cliente.',
      metrics,
      nextSteps,
      actions: [
        {
          id: 'continue-simulator',
          label: 'Continuar en simulador',
          kind: 'primary',
          execute: () => Promise.resolve()
        },
        {
          id: 'open-dashboard',
          label: 'Ver dashboard',
          kind: 'ghost',
          execute: () => this.navigateTo('/dashboard')
        }
      ]
    });
  }

  private presentDocumentsQuickActionOverlay(action: QuickAction): void {
    const metrics: SummaryMetric[] = [
      {
        label: 'Sección',
        value: 'Documentos'
      },
      {
        label: 'Modo de datos',
        value: environment.features.enableMockData ? 'DEMO' : 'REAL',
        badge: environment.features.enableMockData ? 'warning' : 'success'
      }
    ];

    const nextSteps = [
      'Filtra por pendientes y valida observaciones recientes.',
      'Coordina con el equipo o cliente para subir evidencia faltante.'
    ];

    this.completion.open({
      title: 'Expedientes listos para revisión',
      description: 'Accede a la vista de documentos y prioriza los pendientes críticos.',
      metrics,
      nextSteps,
      actions: [
        {
          id: 'review-documents',
          label: 'Revisar documentos',
          kind: 'primary',
          execute: () => Promise.resolve()
        },
        {
          id: 'view-activity',
          label: 'Ver actividad',
          kind: 'ghost',
          execute: () => this.navigateTo('/dashboard', { tab: 'activity' })
        }
      ]
    });
  }

  private presentPostSaleQuickActionOverlay(action: QuickAction): void {
    const metrics: SummaryMetric[] = [
      {
        label: 'Gestión',
        value: 'Postventa'
      },
      {
        label: 'Modo de datos',
        value: environment.features.enableMockData ? 'DEMO' : 'REAL',
        badge: environment.features.enableMockData ? 'warning' : 'success'
      }
    ];

    const nextSteps = [
      'Captura evidencia fotográfica y genera upselling para el cliente.',
      'Actualiza el estado de la gestión en el dashboard.'
    ];

    this.completion.open({
      title: 'Postventa lista para gestionar',
      description: 'Prepara la evidencia y construye la cotización de servicios adicionales.',
      metrics,
      nextSteps,
      actions: [
        {
          id: 'open-postsale',
          label: 'Ir a postventa',
          kind: 'primary',
          execute: () => Promise.resolve()
        },
        {
          id: 'open-dashboard',
          label: 'Ver dashboard',
          kind: 'ghost',
          execute: () => this.navigateTo('/dashboard')
        }
      ]
    });
  }

  private getMarketLabel(market: PolicyMarket): string {
    switch (market) {
      case 'aguascalientes':
        return 'Aguascalientes';
      case 'edomex':
        return 'EdoMex';
      case 'otros':
        return 'Otros mercados';
      default:
        return market;
    }
  }

  private getClientTypeLabel(clientType: PolicyClientType): string {
    return clientType === 'colectivo' ? 'Colectivo' : 'Individual';
  }

  private markCurrentRoute(currentRoute: string, actions: QuickAction[]): QuickAction[] {
    const normalized = currentRoute.split('?')[0];

    return actions.map(action => {
      if (!action.route) {
        return action;
      }

      const isCurrent = normalized === action.route || normalized.startsWith(`${action.route}/`);

      return {
        ...action,
        disabled: isCurrent,
        active: isCurrent
      };
    });
  }

  /**
   * Check if current route matches pattern
   */
  isCurrentRoute(routePattern: string): Observable<boolean> {
    return this.navigationState$.pipe(
      map(state => {
        if (routePattern.includes('*')) {
          const pattern = routePattern.replace('*', '.*');
          return new RegExp(`^${pattern}$`).test(state.currentRoute);
        }
        return state.currentRoute === routePattern;
      })
    );
  }

  /**
   * Get route parameters
   */
  getRouteParams(): Observable<any> {
    return this.activatedRoute.params;
  }

  /**
   * Get query parameters
   */
  getQueryParams(): Observable<any> {
    return this.activatedRoute.queryParams;
  }

  /**
   * Update page title dynamically
   */
  setPageTitle(title: string): void {
    const currentState = this.navigationState.value;
    this.navigationState.next({
      ...currentState,
      pageTitle: title
    });
    
    // Also update document title
    document.title = `${title} - Conductores PWA`;
  }

  /**
   * Update breadcrumbs dynamically
   */
  setBreadcrumbs(breadcrumbs: BreadcrumbItem[]): void {
    const currentState = this.navigationState.value;
    this.navigationState.next({
      ...currentState,
      breadcrumbs
    });
  }

  /**
   * Show/hide back button
   */
  setShowBackButton(show: boolean): void {
    const currentState = this.navigationState.value;
    this.navigationState.next({
      ...currentState,
      showBackButton: show
    });
  }

  /**
   * Get navigation history
   */
  getNavigationHistory(): string[] {
    return [...this.routeHistory];
  }

  /**
   * Clear navigation history
   */
  clearNavigationHistory(): void {
    this.routeHistory = [];
  }
}
