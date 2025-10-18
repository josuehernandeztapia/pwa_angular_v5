import { Injectable, signal } from '@angular/core';
import { TandaValidationService, TandaFlowContextState, TandaValidationConfig } from '@feature-services/tanda/tanda-validation.service';
import { MarketPolicyContext, MarketPolicyService, TandaPolicyMetadata } from '@feature-services/configuration/market-policy.service';
import { FlowContext, TandaState } from '../types/document-upload.models';

@Injectable({ providedIn: 'root' })
export class DocumentTandaService {
  private readonly state = signal<TandaState>({
    validation: null,
    bannerDismissed: false,
    contribution: undefined,
    rules: undefined
  });

  readonly tandaState = this.state.asReadonly();

  constructor(private readonly marketPolicy: MarketPolicyService,
              private readonly tandaValidation: TandaValidationService) {}

  reset(): void {
    this.state.set({ validation: null, bannerDismissed: false, contribution: undefined, rules: undefined });
  }

  hydrate(snapshot: Partial<TandaState>): void {
    this.state.update(current => ({
      ...current,
      ...snapshot
    }));
  }

  updateRules(rules?: TandaPolicyMetadata): void {
    this.state.update(state => ({ ...state, rules }));
  }

  dismissBanner(): void {
    this.state.update(state => ({ ...state, bannerDismissed: true }));
  }

  setValidation(state: TandaFlowContextState | null): void {
    this.state.update(s => ({ ...s, validation: state }));
  }

  buildConfig(flowContext: FlowContext): TandaValidationConfig | null {
    if (flowContext.clientType !== 'colectivo') {
      return null;
    }

    const policyContext: MarketPolicyContext = {
      market: flowContext.market,
      clientType: flowContext.clientType,
      saleType: flowContext.saleType ?? 'financiero',
      businessFlow: flowContext.businessFlow,
      collectiveSize: flowContext.collectiveMembers ?? undefined,
    };

    const metadata = flowContext.policyContext?.metadata ?? this.marketPolicy.getPolicyMetadata(policyContext);
    const rules = metadata?.tanda;
    this.updateRules(rules);

    const members = flowContext.collectiveMembers ?? rules?.minMembers ?? 0;
    const rounds = flowContext.simulatorData?.rounds ?? rules?.minRounds ?? members;
    const contribution = Number(flowContext.simulatorData?.groupContribution ?? flowContext.simulatorData?.voluntaryMonthly ?? 0);

    this.state.update(state => ({ ...state, contribution, rules }));

    if (!members || !rounds) {
      return null;
    }

    return {
      market: flowContext.market,
      clientType: flowContext.clientType,
      members,
      contribution,
      rounds,
      rotationOrder: flowContext.simulatorData?.rotationOrder ?? undefined,
      startDate: flowContext.simulatorData?.startDate ?? undefined,
      advisorId: flowContext.simulatorData?.advisorId ?? null,
      groupName: flowContext.simulatorData?.groupName ?? null,
    };
  }
}
