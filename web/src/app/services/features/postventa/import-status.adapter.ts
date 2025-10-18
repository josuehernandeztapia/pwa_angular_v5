import { ImportMilestoneStatus, VehicleUnit } from '@interfaces/postventa';
import {
  EnhancedImportMilestone,
  EnhancedImportStatusResponse,
  IntegratedImportStatus
} from './integrated-import.types';

const REQUIRED_IMPORT_KEYS: Array<keyof IntegratedImportStatus> = [
  'pedidoPlanta',
  'unidadFabricada',
  'transitoMaritimo',
  'enAduana',
  'liberada'
];

const STATUS_COMPLETED = new Set(['COMPLETED', 'COMPLETE', 'DONE', 'SUCCESS', 'CLOSED', 'FINISHED']);
const STATUS_IN_PROGRESS = new Set(['IN_PROGRESS', 'INPROGRESS', 'ACTIVE', 'RUNNING', 'PROCESSING']);
const STATUS_PENDING = new Set(['PENDING', 'WAITING', 'TODO', 'SCHEDULED', 'NOT_STARTED']);

const UPPERCASE_UNACCENT = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[^\p{ASCII}]/gu, '')
    .replace(/\s+/g, '_')
    .toUpperCase();

function normalizeStatus(value?: string | null): 'completed' | 'in_progress' | 'pending' {
  if (!value) {
    return 'pending';
  }

  const normalized = UPPERCASE_UNACCENT(value);
  if (STATUS_COMPLETED.has(normalized)) {
    return 'completed';
  }
  if (STATUS_IN_PROGRESS.has(normalized)) {
    return 'in_progress';
  }
  if (STATUS_PENDING.has(normalized)) {
    return 'pending';
  }

  if (normalized.includes('COMP')) {
    return 'completed';
  }
  if (normalized.includes('PROGRESS') || normalized.includes('RUN')) {
    return 'in_progress';
  }
  return 'pending';
}

function parseDate(value?: string | Date | null): Date | undefined {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? undefined : value;
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

function adaptMilestone(raw?: EnhancedImportMilestone | null): ImportMilestoneStatus {
  const status = normalizeStatus(raw?.status ?? raw?.state);
  const completionDate = parseDate(raw?.completedAt ?? raw?.completionDate);
  const startDate = parseDate(raw?.startedAt ?? raw?.startDate);
  const estimatedDate = parseDate(raw?.estimatedDate ?? raw?.eta);

  const milestone: ImportMilestoneStatus = {
    status,
    startDate,
    completionDate,
    estimatedDate,
    documents: raw?.documents ?? raw?.requiredDocuments ?? [],
    notes: raw?.notes ?? raw?.comment,
    completed: status === 'completed',
    inProgress: status === 'in_progress'
  };

  if (completionDate) {
    milestone.completedAt = completionDate;
  }
  if (startDate) {
    milestone.startedAt = startDate;
  }
  if (raw?.estimatedDays != null) {
    milestone.estimatedDays = raw.estimatedDays;
  }

  return milestone;
}

function adaptAssignedUnit(unit?: VehicleUnit & { assignedAt?: string | Date }): VehicleUnit | undefined {
  if (!unit) {
    return undefined;
  }

  const { assignedAt, ...rest } = unit;
  const assignmentDate = parseDate(assignedAt) ?? parseDate((unit as any).assignmentDate);

  return {
    ...(rest as VehicleUnit),
    assignedAt: assignmentDate ?? new Date()
  };
}

function normalizeSyncStatus(value?: string | null): 'synced' | 'pending' | 'error' | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = UPPERCASE_UNACCENT(value);
  if (normalized.includes('ERROR') || normalized.includes('FAIL')) {
    return 'error';
  }
  if (normalized.includes('SYNCED') || normalized.includes('SUCCESS')) {
    return 'synced';
  }
  if (normalized.includes('PENDING') || normalized.includes('WAIT')) {
    return 'pending';
  }
  return undefined;
}

function pickMilestone(
  source: Partial<Record<string, EnhancedImportMilestone | null | undefined>> | undefined,
  key: string
): EnhancedImportMilestone | undefined {
  if (!source) {
    return undefined;
  }
  const milestone = source[key] ?? source[UPPERCASE_UNACCENT(key).toLowerCase()];
  return milestone ?? undefined;
}

export function adaptEnhancedImportStatus(
  raw: EnhancedImportStatusResponse | null | undefined
): IntegratedImportStatus | null {
  if (!raw) {
    return null;
  }

  const milestonesSource = raw.milestones ?? {};

  const baseMilestones = REQUIRED_IMPORT_KEYS.reduce<Record<string, ImportMilestoneStatus>>((acc, key) => {
    const rawMilestone = pickMilestone(milestonesSource, key as string) ?? pickMilestone(milestonesSource, camelToSnake(key as string));
    acc[key as string] = adaptMilestone(rawMilestone);
    return acc;
  }, {});

  const documentosTransferidos =
    adaptMilestone(raw.postSales?.documentsTransfer ?? pickMilestone(milestonesSource, 'documentosTransferidos'));
  const placasEntregadas =
    adaptMilestone(raw.postSales?.platesDelivered ?? pickMilestone(milestonesSource, 'placasEntregadas'));
  const entregada = adaptMilestone(raw.postSales?.delivered ?? pickMilestone(milestonesSource, 'entregada'));

  const syncStatus =
    normalizeSyncStatus(raw.syncStatus) ?? normalizeSyncStatus(raw.sync?.status);

  const integrated: IntegratedImportStatus = {
    pedidoPlanta: baseMilestones['pedidoPlanta'],
    unidadFabricada: baseMilestones['unidadFabricada'],
    transitoMaritimo: baseMilestones['transitoMaritimo'],
    enAduana: baseMilestones['enAduana'],
    liberada: baseMilestones['liberada'],
    documentosTransferidos,
    placasEntregadas,
    entregada,
    triggerHistory: raw.triggerHistory ?? [],
    deliveryOrderId: raw.deliveryOrderId,
    contractId: raw.contractId,
    syncStatus,
    lastSyncDate: parseDate(raw.lastSyncDate ?? raw.sync?.lastSync ?? raw.sync?.lastSyncDate),
    syncErrorMessage: raw.sync?.errorMessage,
    estimatedDeliveryDate: parseDate(raw.estimatedDeliveryDate),
    actualDeliveryDate: parseDate(raw.actualDeliveryDate),
    delayReasons: raw.delayReasons ?? [],
    customsReleaseDate: parseDate(raw.customsReleaseDate ?? pickMilestonesDate(raw, 'customsReleaseDate')),
    assignedUnit: adaptAssignedUnit(raw.assignedUnit),
    nextAction: (raw as any)?.nextAction
  };

  return integrated;
}

function camelToSnake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

function pickMilestonesDate(
  raw: EnhancedImportStatusResponse,
  property: string
): string | Date | undefined {
  const fromMain = (raw as Record<string, unknown>)[property];
  if (fromMain) {
    return fromMain as string | Date;
  }
  const enAduana = raw.milestones?.['enAduana'] ?? raw.milestones?.['en_aduana'];
  if (enAduana && typeof enAduana === 'object') {
    const value = (enAduana as Record<string, unknown>)[property];
    if (value) {
      return value as string | Date;
    }
  }
  return undefined;
}
