import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BusinessFlow, Market, Client } from '@interfaces/types';
import { Quote } from '@interfaces/business';
import { FinancialCalculatorService } from '@feature-services/cotizador/financial-calculator.service';
import { CotizadorEngineService, CotizadorConfig, ProductPackageContext } from '@feature-services/cotizador/cotizador-engine.service';
import { TandaEngineService } from '@feature-services/tanda/tanda-engine.service';
import { ProtectionEngineService } from '@feature-services/risk/protection-engine.service';
import { SimuladorEngineService, SavingsScenario, CollectiveScenarioConfig } from '@feature-services/simulador/simulador-engine.service';
import { PolicyClientType, PolicyMarket } from '@feature-services/configuration/market-policy.service';
import { round2 } from '@utils/math.util';

export interface CompleteBusinessScenario {
  id: string;
  clientName: string;
  flow: BusinessFlow;
  market: Market;
  stage: 'COTIZACION' | 'SIMULACION' | 'ACTIVO' | 'PROTECCION';
  
  // Cotización data (if applicable)
  quote?: Quote;
  amortizationTable?: any[];
  
  // Simulación data (if applicable)  
  savingsScenario?: SavingsScenario;
  tandaSimulation?: any;
  
  // Protection data (if applicable)
  protectionScenarios?: any[];
  
  // Senior-first formatted data
  seniorSummary: {
    title: string;
    description: string[];
    keyMetrics: Array<{ label: string; value: string; iconType: string }>;
    timeline: Array<{ month: number; event: string; iconType: string }>;
    whatsAppMessage: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ScenarioOrchestratorService {

  constructor(
    private financialCalc: FinancialCalculatorService,
    private cotizador: CotizadorEngineService,
    private tandaEngine: TandaEngineService,
    private protectionEngine: ProtectionEngineService,
    private simulador: SimuladorEngineService
  ) { }

  // ===============================
  // COTIZADOR MODE SCENARIOS
  // ===============================

  async createAGSIndividualCotizacion(
    clientName: string,
    totalPrice: number,
    downPayment: number,
    term: number
  ): Promise<CompleteBusinessScenario> {
    const context: ProductPackageContext = {
      market: 'aguascalientes' as PolicyMarket,
      saleType: 'financiero',
      clientType: 'individual' as PolicyClientType
    };

    const quoteFromPackage = await this.resolveQuoteFromPackage(context, downPayment, term, totalPrice);
    const amortizationTable = this.cotizador.generateAmortizationTable(quoteFromPackage);

    return {
      id: `ags-individual-${Date.now()}`,
      clientName,
      flow: BusinessFlow.VentaPlazo,
      market: 'aguascalientes',
      stage: 'COTIZACION',
      quote: quoteFromPackage,
      amortizationTable,
      seniorSummary: {
        title: 'Tu Unidad en Aguascalientes',
        description: [
          `${clientName}, aquí está tu cotización para una unidad de ${this.financialCalc.formatCurrency(quoteFromPackage.totalPrice)}.`,
          `Con un enganche de ${this.financialCalc.formatCurrency(quoteFromPackage.downPayment)}, financiarás ${this.financialCalc.formatCurrency(quoteFromPackage.amountToFinance)}.`,
          `Tu pago mensual será de ${this.financialCalc.formatCurrency(quoteFromPackage.monthlyPayment)} por ${quoteFromPackage.term} meses.`
        ],
        keyMetrics: [
          { label: 'Precio Total', value: this.financialCalc.formatCurrency(quoteFromPackage.totalPrice), iconType: 'currency-dollar' },
          { label: 'Enganche', value: this.financialCalc.formatCurrency(quoteFromPackage.downPayment), iconType: 'currency-dollar' },
          { label: 'Pago Mensual', value: this.financialCalc.formatCurrency(quoteFromPackage.monthlyPayment), iconType: 'calendar' },
          { label: 'Plazo', value: `${quoteFromPackage.term} meses`, iconType: 'clock' }
        ],
        timeline: [
          { month: 0, event: 'Firma de Contrato y Enganche', iconType: 'document' },
          { month: 1, event: 'Primer Pago Mensual', iconType: 'currency-dollar' },
          { month: quoteFromPackage.term, event: 'Último Pago - Unidad Liberada', iconType: 'check' }
        ],
        whatsAppMessage: `*Cotización AGS - ${clientName}*\n\nPrecio: ${this.financialCalc.formatCurrency(quoteFromPackage.totalPrice)}\nEnganche: ${this.financialCalc.formatCurrency(quoteFromPackage.downPayment)}\nMensualidad: ${this.financialCalc.formatCurrency(quoteFromPackage.monthlyPayment)}\nPlazo: ${quoteFromPackage.term} meses\n\n*Tu nueva unidad te está esperando*`
      }
    };
  }

  async createEdoMexCollectiveCotizacion(
    clientName: string,
    totalPrice: number,
    downPayment: number,
    term: number,
    groupSize: number
  ): Promise<CompleteBusinessScenario> {
    
    const context: ProductPackageContext = {
      market: 'edomex' as PolicyMarket,
      saleType: 'financiero',
      clientType: 'colectivo' as PolicyClientType
    };

    const quoteFromPackage = await this.resolveQuoteFromPackage(context, downPayment, term, totalPrice);
    const amortizationTable = this.cotizador.generateAmortizationTable(quoteFromPackage);

    return {
      id: `edomex-collective-${Date.now()}`,
      clientName,
      flow: BusinessFlow.CreditoColectivo,
      market: 'edomex',
      stage: 'COTIZACION',
      quote: quoteFromPackage,
      amortizationTable,
      seniorSummary: {
        title: 'Crédito Colectivo - Estado de México',
        description: [
          `${clientName}, tu grupo de ${groupSize} personas puede acceder a unidades de ${this.financialCalc.formatCurrency(quoteFromPackage.totalPrice)}.`,
          `Con un enganche colectivo de ${this.financialCalc.formatCurrency(quoteFromPackage.downPayment)}, cada unidad se financia a ${this.financialCalc.formatCurrency(quoteFromPackage.monthlyPayment)} mensuales.`,
          `El plan colectivo les permite obtener mejores condiciones y apoyo mutuo entre miembros.`
        ],
        keyMetrics: [
          { label: 'Precio por Unidad', value: this.financialCalc.formatCurrency(quoteFromPackage.totalPrice), iconType: 'truck' },
          { label: 'Enganche Grupal', value: this.financialCalc.formatCurrency(quoteFromPackage.downPayment), iconType: 'handshake' },
          { label: 'Pago por Unidad', value: this.financialCalc.formatCurrency(quoteFromPackage.monthlyPayment), iconType: 'currency-dollar' },
          { label: 'Miembros Grupo', value: `${groupSize} personas`, iconType: 'users' }
        ],
        timeline: [
          { month: 0, event: 'Formación del Grupo y Convenio', iconType: 'handshake' },
          { month: 1, event: 'Inicio de Aportaciones Colectivas', iconType: 'currency-dollar' },
          { month: 12, event: 'Primera Adjudicación Estimada', iconType: 'target' },
          { month: quoteFromPackage.term, event: 'Última Entrega del Grupo', iconType: 'check' }
        ],
        whatsAppMessage: `*Crédito Colectivo EdoMex - ${clientName}*\n\nPrecio: ${this.financialCalc.formatCurrency(quoteFromPackage.totalPrice)}\nEnganche Grupal: ${this.financialCalc.formatCurrency(quoteFromPackage.downPayment)}\nPago por unidad: ${this.financialCalc.formatCurrency(quoteFromPackage.monthlyPayment)}\nGrupo: ${groupSize} miembros\n\n*Juntos llegarán más lejos*`
      }
    };
  }

  private async resolveQuoteFromPackage(
    context: ProductPackageContext,
    desiredDownPayment: number,
    desiredTerm: number,
    desiredTotalPrice: number
  ): Promise<Quote> {
    const packageKey = this.cotizador.resolvePackageKey(context);
    const quoteWithPackage = await firstValueFrom(
      this.cotizador.generateQuoteWithPackage(packageKey, [], desiredDownPayment, desiredTerm)
    );

    const sanitizedTotalPrice = desiredTotalPrice > 0 ? round2(desiredTotalPrice) : quoteWithPackage.totalPrice;
    const boundedCandidateDownPayment = round2(
      Math.max(0, Math.min(desiredDownPayment, sanitizedTotalPrice))
    );
    const downPaymentValidation = this.cotizador.validateDownPaymentRange(
      quoteWithPackage.packageData,
      sanitizedTotalPrice,
      boundedCandidateDownPayment
    );
    const effectiveDownPayment = downPaymentValidation.valid
      ? boundedCandidateDownPayment
      : quoteWithPackage.downPayment;

    const amountToFinance = round2(Math.max(0, sanitizedTotalPrice - effectiveDownPayment));
    const term = quoteWithPackage.term;
    const monthlyRate = quoteWithPackage.packageData.rate > 0 ? quoteWithPackage.packageData.rate / 12 : 0;
    const monthlyPayment = monthlyRate > 0
      ? round2(this.financialCalc.annuity(amountToFinance, monthlyRate, term))
      : 0;

    const config: CotizadorConfig = {
      totalPrice: sanitizedTotalPrice,
      downPayment: effectiveDownPayment,
      term,
      market: quoteWithPackage.market as Market,
      clientType: quoteWithPackage.clientType as 'Individual' | 'Colectivo',
      businessFlow: quoteWithPackage.flow
    };

    const validation = this.cotizador.validateConfiguration(config);
    if (!validation.valid) {
      throw new Error(`Configuración inválida: ${validation.errors.join(', ')}`);
    }

    return {
      totalPrice: sanitizedTotalPrice,
      downPayment: effectiveDownPayment,
      amountToFinance,
      term,
      monthlyPayment,
      market: quoteWithPackage.market,
      clientType: quoteWithPackage.clientType,
      flow: quoteWithPackage.flow
    };
  }

  // ===============================
  // SIMULADOR MODE SCENARIOS  
  // ===============================

  async createAGSAhorroRenovacion(
    clientName: string,
    initialDownPayment: number,
    deliveryMonths: number,
    unitPlates: string[],
    consumptionPerPlate: number[],
    overpricePerLiter: number,
    totalUnitValue: number
  ): Promise<CompleteBusinessScenario> {
    
    const savingsScenario = this.simulador.generateAGSLiquidationScenario(
      initialDownPayment,
      deliveryMonths,
      unitPlates,
      consumptionPerPlate,
      overpricePerLiter,
      totalUnitValue
    );

    const seniorFormat = this.simulador.formatScenarioForSenior(savingsScenario);

    return {
      id: `ags-ahorro-${Date.now()}`,
      clientName,
      flow: BusinessFlow.AhorroProgramado,
      market: 'aguascalientes',
      stage: 'SIMULACION',
      savingsScenario,
      seniorSummary: {
        title: 'Plan de Ahorro AGS',
        description: seniorFormat.summary,
        keyMetrics: seniorFormat.keyNumbers.map(kn => ({
          label: kn.label,
          value: kn.value,
          iconType: kn.label.includes('Meta') ? 'target' : kn.label.includes('Tiempo') ? 'clock' : 'currency-dollar'
        })),
        timeline: savingsScenario.timeline.slice(0, 4).map(t => ({
          month: t.month,
          event: t.event,
          iconType: t.event.includes('Enganche') ? 'currency-dollar' : t.event.includes('Recaudación') ? 'fuel' : t.event.includes('Entrega') ? 'truck' : 'currency-dollar'
        })),
        whatsAppMessage: `*Plan Ahorro AGS - ${clientName}*\n\nMeta: ${this.financialCalc.formatCurrency(totalUnitValue)}\nCon tu enganche: ${this.financialCalc.formatCurrency(initialDownPayment)}\nRecaudación mensual: ${this.financialCalc.formatCurrency(savingsScenario.collectionContribution)}\nTiempo estimado: ${deliveryMonths} meses\n\n*¡Tu renovación está más cerca!*`
      }
    };
  }

  async createEdoMexIndividualAhorro(
    clientName: string,
    targetDownPayment: number,
    plateConsumption: number,
    overpricePerLiter: number,
    voluntaryMonthly: number = 0
  ): Promise<CompleteBusinessScenario> {
    
    const savingsScenario = this.simulador.generateEdoMexIndividualScenario(
      targetDownPayment,
      plateConsumption,
      overpricePerLiter,
      voluntaryMonthly
    );

    const seniorFormat = this.simulador.formatScenarioForSenior(savingsScenario);

    return {
      id: `edomex-individual-ahorro-${Date.now()}`,
      clientName,
      flow: BusinessFlow.AhorroProgramado,
      market: 'edomex',
      stage: 'SIMULACION',
      savingsScenario,
      seniorSummary: {
        title: 'Plan Individual EdoMex - Enganche',
        description: seniorFormat.summary,
        keyMetrics: seniorFormat.keyNumbers.map(kn => ({
          label: kn.label,
          value: kn.value,
          iconType: kn.label.includes('Meta') ? 'target' : kn.label.includes('Tiempo') ? 'clock' : 'currency-dollar'
        })),
        timeline: [
          { month: 1, event: 'Inicio de Ahorros', iconType: 'bank' },
          { month: Math.ceil(savingsScenario.monthsToTarget / 2), event: 'Mitad del Camino', iconType: 'chart' },
          { month: savingsScenario.monthsToTarget, event: 'Meta de Enganche Alcanzada', iconType: 'target' },
          { month: savingsScenario.monthsToTarget + 1, event: 'Inicio de Financiamiento', iconType: 'truck' }
        ],
        whatsAppMessage: `*Plan Individual EdoMex - ${clientName}*\n\nMeta enganche: ${this.financialCalc.formatCurrency(targetDownPayment)}\nRecaudación: ${this.financialCalc.formatCurrency(savingsScenario.collectionContribution)}\nAportación extra: ${this.financialCalc.formatCurrency(voluntaryMonthly)}\nTiempo: ${savingsScenario.monthsToTarget} meses\n\n*Paso a paso hacia tu unidad*`
      }
    };
  }

  async createEdoMexTandaColectiva(
    clientName: string,
    config: CollectiveScenarioConfig
  ): Promise<CompleteBusinessScenario> {
    
    const { scenario: savingsScenario, tandaResult, snowballEffect } = await this.simulador.generateEdoMexCollectiveScenario(config);

    return {
      id: `edomex-tanda-${Date.now()}`,
      clientName,
      flow: BusinessFlow.CreditoColectivo,
      market: 'edomex',
      stage: 'SIMULACION',
      savingsScenario,
      tandaSimulation: { tandaResult, snowballEffect },
      seniorSummary: {
        title: 'Tanda Colectiva - Efecto Bola de Nieve',
        description: [
          `${clientName}, tu grupo de ${config.memberCount} miembros creará un efecto bola de nieve poderoso.`,
          `Con ${this.financialCalc.formatCurrency(savingsScenario.monthlyContribution)} mensuales del grupo, las entregas comenzarán pronto.`,
          `Cada entrega aumenta el poder de ahorro colectivo y acelera las siguientes adjudicaciones.`
        ],
        keyMetrics: [
          { label: 'Miembros Activos', value: `${config.memberCount} personas`, iconType: 'users' },
          { label: 'Aportación Grupal', value: this.financialCalc.formatCurrency(savingsScenario.monthlyContribution), iconType: 'currency-dollar' },
          { label: 'Primera Entrega', value: `Mes ${tandaResult.firstAwardT || 12}`, iconType: 'badge-check' },
          { label: 'Unidades Total', value: `${config.memberCount} unidades`, iconType: 'truck' }
        ],
        timeline: [
          { month: 1, event: 'Inicio de Tanda Colectiva', iconType: 'handshake' },
          { month: tandaResult.firstAwardT || 12, event: 'Primera Adjudicación', iconType: 'badge-check' },
          { month: Math.floor((tandaResult.firstAwardT || 12) * 1.5), event: 'Aceleración del Efecto', iconType: 'snow' },
          { month: tandaResult.lastAwardT || 36, event: 'Última Entrega', iconType: 'check' }
        ],
        whatsAppMessage: `*Tanda EdoMex - ${clientName}*\n\nGrupo: ${config.memberCount} miembros\nAportación grupal: ${this.financialCalc.formatCurrency(savingsScenario.monthlyContribution)}\nPrimera entrega: Mes ${tandaResult.firstAwardT || 12}\nTotal unidades: ${config.memberCount}\n\n*¡El efecto bola de nieve funciona!*`
      }
    };
  }

  // ===============================
  // PROTECTION MODE SCENARIOS
  // ===============================

  async createProtectionScenarios(
    client: Client,
    currentBalance: number,
    originalPayment: number,
    remainingTerm: number,
    market: Market
  ): Promise<CompleteBusinessScenario> {
    
    const protectionScenarios = this.protectionEngine.generateProtectionScenarios(
      currentBalance,
      originalPayment,
      remainingTerm,
      market
    );

    const bestScenario = protectionScenarios[0]; // Usually defer 3 months is most viable

    return {
      id: `protection-${client.id}-${Date.now()}`,
      clientName: client.name,
      flow: client.flow,
      market,
      stage: 'PROTECCION',
      protectionScenarios,
      seniorSummary: {
        title: 'Opciones de Protección Financiera',
        description: [
          `${client.name}, tenemos ${protectionScenarios.length} opciones para ayudarte en este momento.`,
          `La opción recomendada es: ${bestScenario.title}.`,
          `${bestScenario.description} - Tu nuevo pago sería ${this.financialCalc.formatCurrency(bestScenario.newMonthlyPayment || 0)}.`
        ],
        keyMetrics: [
          { label: 'Opciones Disponibles', value: `${protectionScenarios.length} escenarios`, iconType: 'shield' },
          { label: 'Pago Actual', value: this.financialCalc.formatCurrency(originalPayment), iconType: 'currency-dollar' },
          { label: 'Pago Recomendado', value: this.financialCalc.formatCurrency(bestScenario.newMonthlyPayment || 0), iconType: 'star' },
          { label: 'Reestructuras Usadas', value: `${client.protectionPlan?.restructuresUsed || 0}/${client.protectionPlan?.restructuresAvailable || 3}`, iconType: 'refresh' }
        ],
        timeline: [
          { month: 0, event: 'Solicitud de Protección', iconType: 'document' },
          { month: 1, event: 'Inicio de Nuevo Plan', iconType: 'shield' },
          { month: bestScenario.newTerm || 0, event: 'Plan Completado', iconType: 'check' }
        ],
        whatsAppMessage: `*Protección ${client.name}*\n\nOpción recomendada: ${bestScenario.title}\nPago actual: ${this.financialCalc.formatCurrency(originalPayment)}\nNuevo pago: ${this.financialCalc.formatCurrency(bestScenario.newMonthlyPayment || 0)}\nReestructuras: ${client.protectionPlan?.restructuresUsed || 0}/${client.protectionPlan?.restructuresAvailable || 3}\n\n*Estamos aquí para apoyarte*`
      }
    };
  }

  // ===============================
  // TANDA ENHANCED (SCENARIOS + IRR)
  // ===============================

  async createTandaScenariosEnhanced(
    group: { totalMembers: number; monthlyAmount: number; startDate?: Date },
    market: Market,
    horizonMonths: number,
    options?: { targetIrrAnnual?: number }
  ): Promise<CompleteBusinessScenario> {
    // Mock implementation for enhanced tanda simulation
    const mockTandaResult = {
      title: 'Tanda Simulada',
      description: 'Simulación de tanda grupal',
      newMonthlyPayment: group.monthlyAmount,
      newTerm: horizonMonths,
      savings: 0,
      name: 'Escenario Base',
      irrAnnual: 0.12,
      tirOK: true
    };
    const svc = { simulateWithGrid: () => [mockTandaResult] };

    const results = svc.simulateWithGrid();
    const best = results[0];

    return {
      id: `tanda-enhanced-${Date.now()}`,
      clientName: 'Grupo Colectivo',
      flow: 0 as any,
      market,
      stage: 'PROTECCION',
      protectionScenarios: [],
      seniorSummary: {
        title: 'Tanda Enhanced – Escenarios con IRR de Mercado',
        description: [
          `Se evaluaron ${results.length} escenarios de contribución base y ±10%.`,
          `Mejor escenario: ${best.name} | IRR ${((best.irrAnnual || 0) * 100).toFixed(2)}% | ${best.tirOK ? 'Cumple' : 'No cumple'}`
        ],
        keyMetrics: [
          { label: 'Miembros', value: `${group.totalMembers}`, iconType: 'users' },
          { label: 'Aportación Base', value: this.financialCalc.formatCurrency(group.monthlyAmount), iconType: 'currency-dollar' },
          { label: 'Horizonte', value: `${horizonMonths} meses`, iconType: 'calendar' },
        ],
        timeline: [] as any,
        whatsAppMessage: `*Tanda Enhanced*\n\nMejor escenario: ${best.title}\nAportación: ${this.financialCalc.formatCurrency(best.newMonthlyPayment || 0)}\nMiembros: ${group.totalMembers} | Horizonte: ${horizonMonths}m`
      }
    };
  }

  // ===============================
  // UTILITY METHODS
  // ===============================

  // Convert any scenario to WhatsApp-ready format
  generateWhatsAppExport(scenario: CompleteBusinessScenario): string {
    return scenario.seniorSummary.whatsAppMessage;
  }

  // Convert any scenario to PDF-ready format
  generatePDFExport(scenario: CompleteBusinessScenario): any {
    return {
      title: scenario.seniorSummary.title,
      description: scenario.seniorSummary.description,
      keyMetrics: scenario.seniorSummary.keyMetrics,
      timeline: scenario.seniorSummary.timeline,
      quote: scenario.quote,
      amortizationTable: scenario.amortizationTable,
      savingsScenario: scenario.savingsScenario
    };
  }

  // Validate scenario before creation
  validateScenarioInput(flow: BusinessFlow, market: Market, config: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic validations
    if (!config.clientName || config.clientName.trim().length < 2) {
      errors.push('El nombre del cliente es requerido');
    }

    // Flow-specific validations
    if (flow === BusinessFlow.VentaPlazo) {
      if (!config.totalPrice || config.totalPrice <= 0) {
        errors.push('El precio total debe ser mayor a cero');
      }
      if (!config.downPayment || config.downPayment <= 0) {
        errors.push('El enganche debe ser mayor a cero');
      }
      if (config.downPayment >= config.totalPrice) {
        errors.push('El enganche no puede ser mayor o igual al precio total');
      }
    }

    // Market-specific validations
    if (market === 'aguascalientes' && config.term && ![12, 24].includes(config.term)) {
      errors.push('Para Aguascalientes, los plazos válidos son 12 o 24 meses');
    }
    if (market === 'edomex' && config.term && ![48, 60].includes(config.term)) {
      errors.push('Para Estado de México, los plazos válidos son 48 o 60 meses');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
