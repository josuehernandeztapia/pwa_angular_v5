import { DestroyRef, Injectable, PLATFORM_ID, Renderer2, RendererFactory2, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Observable, Subject, throwError } from 'rxjs';
import { delay, switchMap, map } from 'rxjs/operators';
import { environment } from '@environments/environment';
import { Actor, Client, DOC_NAME_COMPROBANTE, DOC_NAME_INE, DOC_NAME_KYC_CONTAINS, DocumentStatus, EventType } from '@interfaces/types';
import { EventLog } from '@interfaces/types';
import { ClientsApiService } from '@data-access/clients/clients-api.service';
import { ScriptLoaderService } from '@core-services/script-loader.service';

// Port exacto de TypeScript declarations desde React types.ts líneas 3-14
declare global {
  interface HTMLElementTagNameMap {
    'metamap-button': HTMLElement;
  }
}

@Injectable({
  providedIn: 'root'
})
export class MetaMapService {

  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private readonly scriptLoader = inject(ScriptLoaderService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Port exacto de production MetaMap credentials desde React
  private readonly METAMAP_CONFIG = {
    clientId: environment.services?.metamap?.clientId || '',
    flowId: environment.services?.metamap?.flowId || '',
    sdkUrl: 'https://sdk.getmati.com'
  };

  // Event subjects for MetaMap callbacks
  private kycSuccessSubject = new Subject<{ clientId: string; verificationData: any }>();
  private kycExitSubject = new Subject<{ clientId: string; reason: string }>();

  public kycSuccess$ = this.kycSuccessSubject.asObservable();
  public kycExit$ = this.kycExitSubject.asObservable();

  constructor(private clientsApi: ClientsApiService) {
    this.ensureMetaMapSDK();
  }

  private ensureMetaMapSDK(): void {
    if (!this.isBrowser) {
      return;
    }

    this.scriptLoader
      .load({
        src: this.METAMAP_CONFIG.sdkUrl,
        target: 'head',
        async: true,
        preserveOnDestroy: true
      })
      .catch(() => {
        // Best-effort loading; failures will surface when trying to use the SDK
      });
  }

  /**
   * Port exacto de createMetaMapButton desde React KycModalContent component líneas 546-580
   */
  createKycButton(
    containerId: string, 
    client: Client,
    onSuccess?: (data: any) => void,
    onExit?: (reason: string) => void
  ): Observable<(HTMLElement & { clientid?: string; flowid?: string; metadata?: string }) | null> {
    return new Observable((observer: any) => {
      if (!this.isBrowser) {
        observer.next(null);
        observer.complete();
        return;
      }

      const container = this.documentRef.getElementById(containerId);
      if (!container) {
        observer.error(`Container with ID ${containerId} not found`);
        return;
      }

      this.ensureMetaMapSDK();

      const metamapButton = this.renderer.createElement('metamap-button') as HTMLElement & { clientid?: string; flowid?: string; metadata?: string };

      const clientId = this.METAMAP_CONFIG.clientId;
      const flowId = this.METAMAP_CONFIG.flowId;
      const metadata = JSON.stringify({ clientId: client.id, clientName: client.name });

      (metamapButton as any).clientid = clientId;
      (metamapButton as any).flowid = flowId;
      (metamapButton as any).metadata = metadata;

      this.renderer.setAttribute(metamapButton, 'clientid', clientId);
      this.renderer.setAttribute(metamapButton, 'flowid', flowId);
      this.renderer.setAttribute(metamapButton, 'metadata', metadata);

      this.renderer.appendChild(container, metamapButton);

      const successUnlisten = this.renderer.listen(metamapButton, 'metamap:verificationSuccess', (event: Event) => {
        const detail = (event as CustomEvent).detail;
        this.kycSuccessSubject.next({ clientId: client.id, verificationData: detail });
        onSuccess?.(detail);
      });

      const exitUnlisten = this.renderer.listen(metamapButton, 'metamap:userFinished', (event: Event) => {
        const detail = (event as CustomEvent).detail as any;
        const reason = detail?.reason || 'User cancelled';
        this.kycExitSubject.next({ clientId: client.id, reason });
        onExit?.(reason);
      });

      queueMicrotask(() => {
        observer.next(metamapButton);
        observer.complete();
      });

      return () => {
        successUnlisten();
        exitUnlisten();
        if (container.contains(metamapButton)) {
          this.renderer.removeChild(container, metamapButton);
        }
      };
    });
  }

  /**
   * Port exacto de completeKyc desde React simulationService.ts líneas 515-522
   */
  completeKyc(clientId: string, verificationData?: any): Observable<Client> {
    return this.clientsApi.getClientById(clientId).pipe(
      switchMap(client => {
        if (!client) {
          return throwError(() => new Error('Client not found'));
        }

        const kycDoc = client.documents.find(doc => doc.name.includes('Verificación Biométrica'));
        if (!kycDoc) {
          return throwError(() => new Error('KYC document not configured for client'));
        }

        const healthScore = Math.min((client.healthScore || 0) + 15, 100);

        return this.clientsApi.updateDocumentStatus(client.id, kycDoc.id, DocumentStatus.Aprobado, {
          completedAt: new Date(),
          verificationId: verificationData?.verificationId,
          verificationScore: verificationData?.score
        }).pipe(
          switchMap(() =>
            this.clientsApi.addClientEvent(client.id, {
              message: 'Verificación biométrica completada exitosamente.',
              actor: Actor.Cliente,
              type: EventType.KYCCompleted
            })
          ),
          switchMap(() => this.clientsApi.updateClient(client.id, { healthScore })),
          switchMap(() => this.clientsApi.getClientById(client.id)),
          map(updated => updated ?? client)
        );
      }),
      delay(800)
    );
  }

  /**
   * Port exacto de KYC prerequisite validation desde React KycButton component líneas 639-673
   */
  validateKycPrerequisites(client: Client): {
    canStartKyc: boolean;
    isKycComplete: boolean;
    missingDocs: string[];
    tooltipMessage: string;
  } {
    const ine = client.documents.find(d => d.name === DOC_NAME_INE);
    const comprobante = client.documents.find(d => d.name === DOC_NAME_COMPROBANTE);
    const kyc = client.documents.find(d => d.name.includes(DOC_NAME_KYC_CONTAINS));
    
    const coreDocsApproved = ine?.status === DocumentStatus.Aprobado && 
                            comprobante?.status === DocumentStatus.Aprobado;
    const isKycComplete = kyc?.status === DocumentStatus.Aprobado;
    
    const missingDocs: string[] = [];
    if (ine?.status !== DocumentStatus.Aprobado) missingDocs.push(DOC_NAME_INE);
    if (comprobante?.status !== DocumentStatus.Aprobado) missingDocs.push(DOC_NAME_COMPROBANTE);

    let tooltipMessage = '';
    if (isKycComplete) {
      tooltipMessage = 'El KYC ya ha sido aprobado.';
    } else if (!coreDocsApproved) {
      tooltipMessage = 'Se requiere aprobar INE y Comprobante de Domicilio para iniciar KYC.';
    } else {
      tooltipMessage = 'Listo para iniciar verificación biométrica.';
    }

    return {
      canStartKyc: coreDocsApproved && !isKycComplete,
      isKycComplete,
      missingDocs,
      tooltipMessage
    };
  }

  /**
   * Get KYC verification status details
   */
  getKycStatus(client: Client): {
    status: 'not_started' | 'prerequisites_missing' | 'ready' | 'in_progress' | 'completed' | 'failed';
    statusMessage: string;
    canRetry: boolean;
    verificationId?: string;
    completedAt?: Date;
  } {
    const validation = this.validateKycPrerequisites(client);
    const kycDoc = client.documents.find(d => d.name.includes(DOC_NAME_KYC_CONTAINS));
    
    if (!kycDoc) {
      return {
        status: 'not_started',
        statusMessage: 'KYC no configurado para este cliente',
        canRetry: false
      };
    }

    switch (kycDoc.status) {
      case DocumentStatus.Aprobado:
        return {
          status: 'completed',
          statusMessage: 'Verificación biométrica completada',
          canRetry: false,
          verificationId: (kycDoc as any).verificationId,
          completedAt: (kycDoc as any).completedAt
        };
      
      case DocumentStatus.Rechazado:
        return {
          status: 'failed',
          statusMessage: 'Verificación biométrica falló',
          canRetry: true
        };
        
      case DocumentStatus.EnRevision:
        return {
          status: 'in_progress',
          statusMessage: 'Verificación en proceso',
          canRetry: false
        };
        
      default:
        if (!validation.canStartKyc) {
          return {
            status: 'prerequisites_missing',
            statusMessage: validation.tooltipMessage,
            canRetry: false
          };
        }
        
        return {
          status: 'ready',
          statusMessage: 'Listo para verificación biométrica',
          canRetry: false
        };
    }
  }

  /**
   * Simulate KYC failure for testing
   */
  simulateKycFailure(clientId: string, reason: string = 'Identity verification failed'): Observable<Client> {
    return this.clientsApi.getClientById(clientId).pipe(
      switchMap(client => {
        if (!client) {
          return throwError(() => new Error('Client not found'));
        }

        const kycDoc = client.documents.find(doc => doc.name.includes('Verificación Biométrica'));
        if (!kycDoc) {
          return throwError(() => new Error('KYC document not configured for client'));
        }

        return this.clientsApi.updateDocumentStatus(client.id, kycDoc.id, DocumentStatus.Rechazado, {
          reviewNotes: reason,
          reviewedAt: new Date()
        }).pipe(
          switchMap(() =>
          this.clientsApi.addClientEvent(client.id, {
            message: `Verificación biométrica falló: ${reason}`,
            actor: Actor.Sistema,
            type: EventType.KYCFailed
          })
          ),
          switchMap(() => this.clientsApi.getClientById(client.id)),
          map(updated => updated ?? client)
        );
      }),
      delay(500)
    );
  }

  /**
   * Check MetaMap SDK availability
   */
  checkSDKAvailability(): Observable<boolean> {
    return new Observable<boolean>((observer: any) => {
      if (!this.isBrowser) {
        observer.next(false);
        observer.complete();
        return;
      }

      const checkSDK = () => {
        const defaultView = this.documentRef.defaultView as (Window & typeof globalThis) | null;
        const sdkLoaded = !!(defaultView as any)?.Mati
          || !!this.documentRef.querySelector('metamap-button')
          || Array.from(this.documentRef.querySelectorAll('div')).some(d => {
            const datasetTag = (d as HTMLElement).dataset?.['tag'];
            const attrTag = (d as HTMLElement).getAttribute?.('data-tag');
            return (datasetTag || attrTag) === 'METAMAP-BUTTON';
          });
        observer.next(sdkLoaded);
        observer.complete();
      };

      // Check immediately
      if (this.documentRef.readyState === 'complete') {
        checkSDK();
      } else {
        const defaultView = this.documentRef.defaultView;
        if (!defaultView) {
          observer.next(false);
          observer.complete();
          return;
        }

        const unlisten = this.renderer.listen(defaultView, 'load', () => {
          checkSDK();
          unlisten();
        });

        this.destroyRef.onDestroy(unlisten);
      }
    }).pipe(delay(100));
  }
}
