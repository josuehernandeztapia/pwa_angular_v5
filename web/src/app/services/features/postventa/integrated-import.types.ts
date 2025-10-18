import { ImportStatus, ImportMilestoneStatus, VehicleUnit } from '@interfaces/postventa';
import { TriggerEvent } from '@feature-services/contracts/contract-triggers.service';

export interface IntegratedImportStatus extends ImportStatus {
  triggerHistory?: TriggerEvent[];
  deliveryOrderId?: string;
  contractId?: string;

  syncStatus?: 'synced' | 'pending' | 'error';
  lastSyncDate?: Date;
  syncErrorMessage?: string;

  estimatedDeliveryDate?: Date;
  actualDeliveryDate?: Date;
  delayReasons?: string[];
  customsReleaseDate?: Date;
  nextAction?: string;

  assignedUnit?: VehicleUnit;
}

export interface ImportMilestoneEvent {
  id: string;
  clientId: string;
  deliveryOrderId?: string;
  milestone: keyof ImportStatus;
  previousStatus: 'completed' | 'in_progress' | 'pending';
  newStatus: 'completed' | 'in_progress' | 'pending';
  timestamp: Date;

  triggeredBy: 'system' | 'manual' | 'external_update';
  metadata?: {
    estimatedDate?: Date;
    actualDate?: Date;
    documents?: string[];
    notes?: string;
  };

  notificationsSent?: {
    client?: boolean;
    advisor?: boolean;
    whatsapp?: boolean;
  };
}

export interface ImportTrackerMetrics {
  totalActiveImports: number;
  averageTransitTime: number;
  onTimeDeliveryRate: number;
  delayedImports: number;
  milestoneStats: {
    [K in keyof ImportStatus]: {
      averageDuration: number;
      completionRate: number;
      currentCount: number;
    };
  };
  monthlyImportVolume: { month: string; count: number }[];
  delayTrends: { month: string; averageDelay: number }[];
}

export interface EnhancedImportMilestone {
  status?: string;
  state?: string;
  completedAt?: string | Date;
  completionDate?: string | Date;
  startedAt?: string | Date;
  startDate?: string | Date;
  estimatedDate?: string | Date;
  eta?: string | Date;
  estimatedDays?: number;
  documents?: string[];
  requiredDocuments?: string[];
  notes?: string;
  comment?: string;
  metadata?: Record<string, unknown>;
  customsReleaseDate?: string | Date;
}

export interface EnhancedImportStatusResponse {
  clientId?: string;
  milestones?: Partial<Record<keyof ImportStatus | string, EnhancedImportMilestone>>;
  triggerHistory?: TriggerEvent[];
  deliveryOrderId?: string;
  contractId?: string;
  syncStatus?: string;
  sync?: { status?: string; lastSync?: string | Date; lastSyncDate?: string | Date; errorMessage?: string };
  lastSyncDate?: string | Date;
  estimatedDeliveryDate?: string | Date;
  actualDeliveryDate?: string | Date;
  delayReasons?: string[];
  customsReleaseDate?: string | Date;
  assignedUnit?: VehicleUnit & {
    assignedAt?: string | Date;
  };
  postSales?: {
    documentsTransfer?: EnhancedImportMilestone;
    platesDelivered?: EnhancedImportMilestone;
    delivered?: EnhancedImportMilestone;
  };
}
