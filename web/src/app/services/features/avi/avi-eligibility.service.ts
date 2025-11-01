import { Injectable } from '@angular/core';

import { BusinessFlow, Document, DocumentStatus } from '@interfaces/types';
import { DocumentRequirementsService } from '@feature-services/documents/document-requirements.service';
import { FlowContext } from '@app/documents/types/document-upload.models';

export interface AviRequirementItem {
  id: string;
  label: string;
  completed: boolean;
  required: boolean;
  helpText?: string;
}

export interface AviReadinessSnapshot {
  isAviRequired: boolean;
  isEligible: boolean;
  completionRatio: number;
  completedCount: number;
  totalCount: number;
  pendingCount: number;
  requirements: AviRequirementItem[];
  blockingReason?: string;
}

interface EvaluateOptions {
  documents?: Document[];
  clientStatus?: string | null;
  flowContext?: Partial<FlowContext> | null;
  showAviOverride?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AviEligibilityService {
  private static readonly EXPEDIENTE_STATES = new Set([
    'expediente en proceso',
    'en expediente',
    'expediente',
    'pendiente evidencia'
  ]);

  constructor(private readonly documentRequirements: DocumentRequirementsService) {}

  evaluate(options: EvaluateOptions = {}): AviReadinessSnapshot {
    const documents = options.documents ?? [];
    const clientStatus = (options.clientStatus ?? '').trim();
    const flowContext = options.flowContext ?? null;
    const isAviRequired = options.showAviOverride ?? this.shouldRequireAvi(flowContext);

    const requirements: AviRequirementItem[] = [];

    const statusRequirement = this.buildStatusRequirement(clientStatus);
    if (statusRequirement) {
      requirements.push(statusRequirement);
    }

    const documentRequirements = this.buildDocumentRequirements(documents);
    requirements.push(...documentRequirements);

    const totalCount = requirements.length;
    const completedCount = requirements.filter(item => item.completed).length;
    const pendingCount = totalCount - completedCount;
    const completionRatio = totalCount === 0 ? 1 : completedCount / totalCount;

    let blockingReason: string | undefined;
    const pendingRequirement = requirements.find(item => item.required && !item.completed) ?? requirements.find(item => !item.completed);
    if (pendingRequirement) {
      blockingReason = pendingRequirement.helpText ?? pendingRequirement.label;
    }

    const isEligible = isAviRequired ? pendingCount === 0 : true;

    return {
      isAviRequired,
      isEligible,
      completionRatio,
      completedCount,
      totalCount,
      pendingCount,
      requirements,
      blockingReason
    };
  }

  private buildStatusRequirement(clientStatus: string): AviRequirementItem | null {
    if (!clientStatus) {
      return null;
    }

    const normalized = clientStatus.toLowerCase();
    const isValid = AviEligibilityService.EXPEDIENTE_STATES.has(normalized);

    return {
      id: 'client-status',
      label: 'Cliente listo en expediente',
      completed: isValid,
      required: true,
      helpText: isValid ? undefined : `Estatus actual: "${clientStatus}". Cambia el expediente a "Expediente en Proceso".`
    };
  }

  private buildDocumentRequirements(documents: Document[]): AviRequirementItem[] {
    if (!documents.length) {
      return [
        {
          id: 'documents-missing',
          label: 'Cargar documentos obligatorios (INE, comprobante de domicilio)',
          completed: false,
          required: true,
          helpText: 'Sube y valida los documentos básicos para habilitar AVI.'
        }
      ];
    }

    const { missingDocs, canStartKyc } = this.documentRequirements.validateKycPrerequisites(documents);

    const items: AviRequirementItem[] = ['INE Vigente', 'Comprobante de domicilio'].map(docName => {
      const doc = documents.find(candidate => candidate.name === docName);
      const approved = doc?.status === DocumentStatus.Aprobado;
      return {
        id: `doc-${docName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label: `${docName} validado`,
        completed: approved,
        required: true,
        helpText: approved ? undefined : `Aprueba el documento "${docName}".`
      };
    });

    if (!canStartKyc) {
      missingDocs
        .filter(name => !['INE Vigente', 'Comprobante de domicilio'].includes(name))
        .forEach(name => {
          items.push({
            id: `doc-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            label: `${name} validado`,
            completed: false,
            required: true,
            helpText: `Aprueba el documento "${name}".`
          });
        });
    }

    return items;
  }

  private shouldRequireAvi(flowContext: Partial<FlowContext> | null): boolean {
    if (!flowContext) {
      return true;
    }

    const businessFlow = flowContext.businessFlow;
    const market = (flowContext.market ?? '').toLowerCase();
    const clientType = flowContext.clientType;

    if (businessFlow === BusinessFlow.VentaDirecta) {
      return false;
    }

    if (businessFlow === BusinessFlow.VentaPlazo || businessFlow === BusinessFlow.CreditoColectivo) {
      return true;
    }

    if (clientType === 'colectivo') {
      return true;
    }

    return market === 'edomex' || market === 'estado_de_mexico';
  }
}
