import { DestroyRef, Inject, Injectable, PLATFORM_ID, Optional, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, of, fromEvent, TimeoutError, timer } from 'rxjs';
import { catchError, finalize, tap, retryWhen, timeout, mergeMap, map } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '@core-services/auth.service';
import { LoadingService } from '@core-services/loading.service';
import { ToastService } from '@core-services/toast.service';
import { environment } from '@environments/environment';
import { safeWindow } from '@services/utils/ssr/safe-window.util';
import { resolveHttpClient } from '@services/utils/http-client.util';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
}

export interface ApiError {
  message: string;
  status: number;
  statusText: string;
  url?: string;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'UPLOAD';

interface BaseRequestOptions {
  headers?: HttpHeaders;
  showLoading?: boolean;
  showError?: boolean;
  retryAttempts?: number;
  timeoutMs?: number;
}

interface GetRequestOptions extends BaseRequestOptions {
  params?: HttpParams | { [param: string]: string | string[] };
}

interface MutationRequestOptions extends BaseRequestOptions {
  successMessage?: string;
}

interface ResilienceOptions {
  showError: boolean;
  retryAttempts?: number;
  timeoutMs?: number;
}

@Injectable({
  providedIn: 'root'
})
export class HttpClientService {
  private readonly http: HttpClient;
  private readonly baseUrl = environment.apiUrl || 'http://localhost:3000/api';
  private readonly defaultTimeoutMs = environment.timeouts?.api ?? 30000;
  private readonly uploadTimeoutMs = environment.timeouts?.fileUpload ?? 120000;
  private readonly baseRetryDelayMs = 300;
  private readonly maxRetryDelayMs = 4000;
  
  // Connection status
  private connectionSubject = new BehaviorSubject<boolean>(true);
  public isConnected$ = this.connectionSubject.asObservable();
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) platformId: Object,
    @Optional() http: HttpClient,
    private authService: AuthService,
    private loadingService: LoadingService,
    private toast: ToastService
  ) {
    this.http = http ?? resolveHttpClient();
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      const win = safeWindow();
      const online = win?.navigator?.onLine ?? true;
      this.connectionSubject.next(online);
      this.setupConnectionMonitoring();
    }
  }

  private getStoredToken(): string | null {
    if (!this.isBrowser) {
      return null;
    }

    try {
      return safeWindow()?.localStorage?.getItem('auth_token') ?? null;
    } catch {
      return null;
    }
  }

  private setupConnectionMonitoring(): void {
    const win = safeWindow();
    if (!win) {
      return;
    }

    fromEvent(win, 'online')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.connectionSubject.next(true);
        this.toast.success('Conexión restaurada');
      });

    fromEvent(win, 'offline')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.connectionSubject.next(false);
        this.toast.error('Sin conexión a internet');
      });
  }

  /**
   * GET request
   */
  get<T>(url: string, options: GetRequestOptions = {}): Observable<ApiResponse<T>> {
    const { showLoading = true, showError = true } = options;

    if (showLoading) {
      this.loadingService.setLoading(true, `GET ${url}`);
    }

    const fullUrl = this.buildUrl(url);
    const httpOptions = this.buildHttpOptions(options);

    const request$ = this.http
      .get<ApiResponse<T>>(fullUrl, { ...httpOptions, observe: 'body' as const, responseType: 'json' as const })
      .pipe(tap(response => this.handleSuccess(response)));

    return this.decorateWithResilience('GET', request$, {
      showError,
      retryAttempts: options.retryAttempts,
      timeoutMs: options.timeoutMs
    }).pipe(
      finalize(() => {
        if (showLoading) {
          this.loadingService.setLoading(false, `GET ${url}`);
        }
      })
    );
  }

  /**
   * POST request
   */
  post<T>(url: string, body: any, options: MutationRequestOptions = {}): Observable<ApiResponse<T>> {
    const { showLoading = true, showError = true, successMessage } = options;

    if (showLoading) {
      this.loadingService.setLoading(true, `POST ${url}`);
    }

    const fullUrl = this.buildUrl(url);
    const httpOptions = this.buildHttpOptions(options);

    const request$ = this.http
      .post<ApiResponse<T>>(fullUrl, body, { ...httpOptions, observe: 'body' as const, responseType: 'json' as const })
      .pipe(
        tap(response => {
          this.handleSuccess(response);
          if (successMessage) {
            this.toast.success(successMessage);
          }
        })
      );

    return this.decorateWithResilience('POST', request$, {
      showError,
      retryAttempts: options.retryAttempts,
      timeoutMs: options.timeoutMs
    }).pipe(
      finalize(() => {
        if (showLoading) {
          this.loadingService.setLoading(false, `POST ${url}`);
        }
      })
    );
  }

  /**
   * PUT request
   */
  put<T>(url: string, body: any, options: MutationRequestOptions = {}): Observable<ApiResponse<T>> {
    const { showLoading = true, showError = true, successMessage } = options;

    if (showLoading) {
      this.loadingService.setLoading(true, `PUT ${url}`);
    }

    const fullUrl = this.buildUrl(url);
    const httpOptions = this.buildHttpOptions(options);

    const request$ = this.http
      .put<ApiResponse<T>>(fullUrl, body, { ...httpOptions, observe: 'body' as const, responseType: 'json' as const })
      .pipe(
        tap(response => {
          this.handleSuccess(response);
          if (successMessage) {
            this.toast.success(successMessage);
          }
        })
      );

    return this.decorateWithResilience('PUT', request$, {
      showError,
      retryAttempts: options.retryAttempts,
      timeoutMs: options.timeoutMs
    }).pipe(
      finalize(() => {
        if (showLoading) {
          this.loadingService.setLoading(false, `PUT ${url}`);
        }
      })
    );
  }

  /**
   * PATCH request
   */
  patch<T>(url: string, body: any, options: MutationRequestOptions = {}): Observable<ApiResponse<T>> {
    const { showLoading = true, showError = true, successMessage } = options;

    if (showLoading) {
      this.loadingService.setLoading(true, `PATCH ${url}`);
    }

    const fullUrl = this.buildUrl(url);
    const httpOptions = this.buildHttpOptions(options);

    const request$ = this.http
      .patch<ApiResponse<T>>(fullUrl, body, { ...httpOptions, observe: 'body' as const, responseType: 'json' as const })
      .pipe(
        tap(response => {
          this.handleSuccess(response);
          if (successMessage) {
            this.toast.success(successMessage);
          }
        })
      );

    return this.decorateWithResilience('PATCH', request$, {
      showError,
      retryAttempts: options.retryAttempts,
      timeoutMs: options.timeoutMs
    }).pipe(
      finalize(() => {
        if (showLoading) {
          this.loadingService.setLoading(false, `PATCH ${url}`);
        }
      })
    );
  }

  /**
   * DELETE request
   */
  delete<T>(url: string, options: MutationRequestOptions = {}): Observable<ApiResponse<T>> {
    const { showLoading = true, showError = true, successMessage } = options;

    if (showLoading) {
      this.loadingService.setLoading(true, `DELETE ${url}`);
    }

    const fullUrl = this.buildUrl(url);
    const httpOptions = this.buildHttpOptions(options);

    const request$ = this.http
      .delete<ApiResponse<T>>(fullUrl, { ...httpOptions, observe: 'body' as const, responseType: 'json' as const })
      .pipe(
        tap(response => {
          this.handleSuccess(response);
          if (successMessage) {
            this.toast.success(successMessage);
          }
        })
      );

    return this.decorateWithResilience('DELETE', request$, {
      showError,
      retryAttempts: options.retryAttempts,
      timeoutMs: options.timeoutMs
    }).pipe(
      finalize(() => {
        if (showLoading) {
          this.loadingService.setLoading(false, `DELETE ${url}`);
        }
      })
    );
  }

  /**
   * File upload
   */
  uploadFile(url: string, file: File, additionalData?: Record<string, any>): Observable<ApiResponse<any>> {
    this.loadingService.setLoading(true, 'Uploading file');

    const formData = new FormData();
    formData.append('file', file);

    if (additionalData) {
      Object.keys(additionalData).forEach(key => {
        formData.append(key, additionalData[key]);
      });
    }

    const fullUrl = this.buildUrl(url);
    const headers = this.getAuthHeaders();

    const request$ = this.http
      .post<ApiResponse<any>>(fullUrl, formData, { headers })
      .pipe(
        tap(response => {
          this.handleSuccess(response);
          this.toast.success('Archivo subido exitosamente');
        })
      );

    return this.decorateWithResilience('UPLOAD', request$, {
      showError: true,
      retryAttempts: 2,
      timeoutMs: this.uploadTimeoutMs
    }).pipe(finalize(() => this.loadingService.setLoading(false, 'Uploading file')));
  }

  private decorateWithResilience<T>(
    method: HttpMethod,
    stream$: Observable<ApiResponse<T>>,
    options: ResilienceOptions
  ): Observable<ApiResponse<T>> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const retryAttempts = options.retryAttempts ?? this.getDefaultRetryAttempts(method);

    let pipeline$ = stream$;

    if (timeoutMs > 0) {
      pipeline$ = pipeline$.pipe(timeout({ each: timeoutMs }));
    }

    if (retryAttempts > 0) {
      pipeline$ = pipeline$.pipe(
        retryWhen(errors => this.createRetryStrategy(errors, method, retryAttempts))
      );
    }

    return pipeline$.pipe(
      catchError(error => this.handleError(error as HttpErrorResponse | TimeoutError, options.showError))
    );
  }

  private createRetryStrategy(
    errors: Observable<unknown>,
    method: HttpMethod,
    maxAttempts: number
  ): Observable<number> {
    return errors.pipe(
      mergeMap((error, index) => {
        const attempt = index + 1;
        const canRetry = this.isRetryableError(error) && attempt <= maxAttempts;

        if (!canRetry) {
          return throwError(() => error);
        }

        const backoff = Math.min(this.baseRetryDelayMs * Math.pow(2, index), this.maxRetryDelayMs);
        try {
          console.warn(`Retrying ${method} request (attempt ${attempt} of ${maxAttempts})`, error);
        } catch {}
        return timer(backoff);
      })
    );
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof TimeoutError) {
      return true;
    }

    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return true;
      }

      return [408, 425, 429, 500, 502, 503, 504].includes(error.status);
    }

    return false;
  }

  private getDefaultRetryAttempts(method: HttpMethod): number {
    switch (method) {
      case 'GET':
        return 3;
      case 'DELETE':
      case 'PUT':
      case 'PATCH':
        return 2;
      case 'UPLOAD':
        return 2;
      default:
        return 0;
    }
  }

  /**
   * Build full URL
   */
  private buildUrl(endpoint: string): string {
    // Remove leading slash if present
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    return `${this.baseUrl}/${cleanEndpoint}`;
  }

  /**
   * Build HTTP options with authentication headers
   */
  private buildHttpOptions(options: { params?: HttpParams | { [param: string]: string | string[] }; headers?: HttpHeaders } = {}): { params?: HttpParams | { [param: string]: string | string[] }; headers?: HttpHeaders } {
    const { params, headers } = options;
    return {
      params,
      headers: this.mergeHeaders(headers)
    };
  }

  /**
   * Get authentication headers
   */
  private getAuthHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    // Add auth token if available
    const token = this.getStoredToken();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  /**
   * Merge custom headers with default headers
   */
  private mergeHeaders(customHeaders?: HttpHeaders): HttpHeaders {
    const defaultHeaders = this.getAuthHeaders();
    
    if (!customHeaders) {
      return defaultHeaders;
    }

    let mergedHeaders = defaultHeaders;
    customHeaders.keys().forEach(key => {
      mergedHeaders = mergedHeaders.set(key, customHeaders.get(key) || '');
    });

    return mergedHeaders;
  }

  /**
   * Handle successful responses
   */
  private handleSuccess<T>(response: ApiResponse<T>): void {
    this.connectionSubject.next(true);
    if (response.success && response.message) {
      try {
        console.log('API Success:', response.message);
      } catch {}
    }
  }

  /**
   * Handle API errors
   */
  private handleError(error: HttpErrorResponse | TimeoutError, showError: boolean = true): Observable<never> {
    let errorMessage = 'Ha ocurrido un error inesperado';
    let status = 0;
    let statusText = 'Unknown Error';
    let url: string | undefined;

    if (error instanceof TimeoutError) {
      errorMessage = 'La solicitud excedió el tiempo de espera';
      statusText = 'Timeout';
      this.connectionSubject.next(false);
    } else {
      status = error.status ?? 0;
      statusText = error.statusText ?? 'Unknown Error';
      url = error.url || undefined;

      if (error.error instanceof ErrorEvent && error.error.message) {
        errorMessage = `Error: ${error.error.message}`;
      } else if (status === 0) {
        errorMessage = 'No se puede conectar al servidor';
        this.connectionSubject.next(false);
      } else {
        switch (status) {
          case 400:
            errorMessage = error.error?.message || 'Solicitud inválida';
            break;
          case 401:
            errorMessage = 'No autorizado. Por favor, inicia sesión nuevamente';
            this.authService.logout();
            break;
          case 403:
            errorMessage = 'No tienes permisos para realizar esta acción';
            break;
          case 404:
            errorMessage = 'Recurso no encontrado';
            break;
          case 408:
            errorMessage = 'La solicitud está tardando demasiado';
            break;
          case 422:
            errorMessage = 'Datos de entrada inválidos';
            if (error.error?.errors) {
              const validationErrors = Object.values(error.error.errors).flat();
              errorMessage = validationErrors.join(', ');
            }
            break;
          case 429:
            errorMessage = 'Demasiadas solicitudes. Inténtalo nuevamente en unos segundos';
            break;
          case 500:
            errorMessage = 'Error interno del servidor';
            break;
          case 502:
            errorMessage = 'La pasarela de servicio no responde';
            break;
          case 503:
            errorMessage = 'Servicio no disponible temporalmente';
            break;
          case 504:
            errorMessage = 'El servicio no respondió a tiempo';
            break;
          default:
            errorMessage = `Error ${status}: ${statusText}`;
        }
      }
    }

    const apiError: ApiError = {
      message: errorMessage,
      status,
      statusText,
      url
    };

    if (showError) {
      this.toast.error(errorMessage);
    }

    return throwError(() => apiError);
  }

  /**
   * Check if API is available
   */
  checkApiHealth(): Observable<boolean> {
    return this.get<{ status: string }>('health', { 
      showLoading: false, 
      showError: false 
    }).pipe(
      map(response => response.success && response.data?.status === 'ok'),
      catchError(() => {
        this.connectionSubject.next(false);
        return of(false);
      })
    );
  }

  /**
   * Get current connection status
   */
  isConnected(): boolean {
    if (!this.isBrowser) {
      return this.connectionSubject.value;
    }
    const win = safeWindow();
    return this.connectionSubject.value && (win?.navigator?.onLine ?? true);
  }
}
