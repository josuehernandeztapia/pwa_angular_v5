import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, timer } from 'rxjs';
import { FinancialCalculatorService } from '@feature-services/cotizador/financial-calculator.service';
import { LoadingService } from '@core-services/loading.service';
import { PdfExportService } from '@feature-services/documents/pdf-export.service';
import { CollectiveScenarioConfig, SimuladorEngineService } from '@feature-services/simulador/simulador-engine.service';
import { IconComponent } from '@shared/icon/icon.component';
import { CotizadorEngineService, ProductPackage } from '@feature-services/cotizador/cotizador-engine.service';
import { round2 } from '@utils/math.util';

@Component({
  selector: 'app-edomex-colectivo',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  styleUrls: ['./edomex-colectivo.component.scss'],
  templateUrl: './edomex-colectivo.component.html',
})
export class EdomexColectivoComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  configForm: FormGroup;
  quotation: any = null;
  isCalculating = false;
  private packageData: ProductPackage | null = null;
  private packageTerm = 60;
  private packageDownPaymentPct = 0.15;
  private defaultUnitPrice = 749000;
  private readonly packageLoadingId = 'edomex-colectivo-package';
  private readonly calculationLoadingId = 'edomex-colectivo-calculation';

  constructor(
    private fb: FormBuilder,
    private simuladorEngine: SimuladorEngineService,
    private loadingService: LoadingService,
    private financialCalc: FinancialCalculatorService,
    private pdfExportService: PdfExportService,
    private router: Router,
    private route: ActivatedRoute,
    private cotizadorEngine: CotizadorEngineService
  ) {
    this.configForm = this.fb.group({
      memberCount: [10, [Validators.required, Validators.min(5), Validators.max(50)]],
      unitPrice: [this.defaultUnitPrice, [Validators.required, Validators.min(500000)]],
      avgConsumption: [400, [Validators.required, Validators.min(200)]],
      overpricePerLiter: [3.0, [Validators.required, Validators.min(1.0)]],
      voluntaryMonthly: [0, [Validators.min(0)]],
      collectionUnits: this.fb.array([this.createCollectionUnitGroup()])
    });
  }

  ngOnInit() {
    this.loadCollectivePackage();

    // Check for query params from Nueva Oportunidad
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['memberCount']) {
        this.configForm.patchValue({
          memberCount: parseInt(params['memberCount'])
        });
      }
      if (params['preCalculate'] === 'true') {
        timer(500)
          .pipe(takeUntil(this.destroy$))
          .subscribe(() => this.generateQuotation());
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get collectionUnitsArray(): FormArray {
    return this.configForm.get('collectionUnits') as FormArray;
  }

  addCollectionUnit(): void {
    this.collectionUnitsArray.push(this.createCollectionUnitGroup());
  }

  removeCollectionUnit(index: number): void {
    if (this.collectionUnitsArray.length === 1) {
      this.collectionUnitsArray.at(0).patchValue({ consumption: '', overprice: '' });
      return;
    }
    this.collectionUnitsArray.removeAt(index);
  }

  async generateQuotation() {
    if (!this.configForm.valid) return;

    const values = this.configForm.value;
    this.isCalculating = true;
    this.loadingService.show(this.calculationLoadingId);

    try {
      const unitPrice = Number(values.unitPrice) || this.defaultUnitPrice;
      const memberCount = Number(values.memberCount);
      const downPaymentRate = this.packageData?.minDownPaymentPercentage ?? this.packageDownPaymentPct;
      const term = this.packageData?.terms?.[0] ?? this.packageTerm;
      const annualRate = this.packageData?.rate ?? 0.299;
      const monthlyRate = annualRate > 0 ? annualRate / 12 : 0;

      const downPaymentPerMember = round2(unitPrice * downPaymentRate);
      const financingPerMember = round2(Math.max(0, unitPrice - downPaymentPerMember));
      const monthlyPaymentPerMember = monthlyRate > 0
        ? round2(this.financialCalc.annuity(financingPerMember, monthlyRate, term))
        : round2(financingPerMember / Math.max(term, 1));

      const voluntaryPerMember = Number(values.voluntaryMonthly) || 0;

      let avgConsumption = Number(values.avgConsumption) || 0;
      let overpricePerLiter = Number(values.overpricePerLiter) || 0;

      const unitControls = this.collectionUnitsArray.controls;
      let aggregatedConsumption = 0;
      let aggregatedRevenue = 0;
      let activeUnits = 0;

      unitControls.forEach(unit => {
        const consumption = Number(unit.value?.consumption) || 0;
        const overprice = Number(unit.value?.overprice) || 0;
        if (consumption > 0) {
          aggregatedConsumption += consumption;
          aggregatedRevenue += consumption * Math.max(overprice, 0);
          activeUnits++;
        }
      });

      if (aggregatedConsumption > 0 && activeUnits > 0) {
        avgConsumption = round2(aggregatedConsumption / activeUnits);
        overpricePerLiter = round2(aggregatedRevenue / aggregatedConsumption);
        this.configForm.patchValue({
          avgConsumption,
          overpricePerLiter
        }, { emitEvent: false });
      }

      const monthlyCollectionPerMember = round2(avgConsumption * overpricePerLiter);
      const totalContributionPerMember = round2(monthlyCollectionPerMember + voluntaryPerMember);

      // Create scenario configuration
      const config: CollectiveScenarioConfig = {
        memberCount,
        unitPrice,
        avgConsumption,
        overpricePerLiter,
        voluntaryMonthly: voluntaryPerMember
      };

      // Generate collective scenario
      const collectiveResult = await this.simuladorEngine.generateEdoMexCollectiveScenario(config);

      // Build quotation from scenario
      this.quotation = {
        memberCount,
        unitPrice,
        totalInvestment: round2(unitPrice * memberCount),
        downPaymentPerMember,
        financingPerMember,
        monthlyPaymentPerMember,
        avgConsumption,
        overpricePerLiter,
        monthlyCollectionPerMember,
        voluntaryContributionPerMember: voluntaryPerMember,
        totalContributionPerMember,
        term,
        annualRate: annualRate * 100,
        package: this.packageData,
        scenario: collectiveResult.scenario,
        tandaResult: collectiveResult.tandaResult,
        snowballEffect: collectiveResult.snowballEffect,
        timeline: [
          {
            title: 'Constitución del Grupo',
            description: 'Reunión inicial y firma de acuerdos',
            timeframe: 'Semana 1'
          },
          {
            title: 'Evaluación Crediticia',
            description: 'Análisis de cada miembro del grupo',
            timeframe: 'Semana 2-3'
          },
          {
            title: 'Aprobación de Crédito',
            description: 'Resolución del financiamiento grupal',
            timeframe: 'Semana 4'
          },
          {
            title: 'Selección de Unidades',
            description: 'Elección y reserva de vehículos',
            timeframe: 'Semana 5-6'
          },
          {
            title: 'Entrega Escalonada',
            description: 'Entrega por fases según disponibilidad',
            timeframe: 'Semana 7-10'
          }
        ]
      };

    } catch (error) {
      console.error('Error generating collective quotation', error);
    }
    finally {
      this.isCalculating = false;
      this.loadingService.hide(this.calculationLoadingId);
    }
  }

  resetForm() {
    this.configForm.reset({
      memberCount: 10,
      unitPrice: this.defaultUnitPrice,
      avgConsumption: 400,
      overpricePerLiter: 3.0,
      voluntaryMonthly: 0
    });
    while (this.collectionUnitsArray.length > 0) {
      this.collectionUnitsArray.removeAt(0);
    }
    this.collectionUnitsArray.push(this.createCollectionUnitGroup());
    this.quotation = null;
  }

  recalculate() {
    this.quotation = null;
  }

  proceedToClientCreation() {
    if (!this.quotation) return;

    // Store quotation data for client creation
    const clientData: any = {
      quotationData: {
        type: 'EDOMEX_COLECTIVO',
        quotation: this.quotation,
        configParams: this.configForm.value
      }
    };

    sessionStorage.setItem('pendingClientData', JSON.stringify(clientData));
    this.router.navigate(['/clientes/nuevo'], {
      queryParams: { 
        fromCotizador: 'edomex-colectivo',
        hasQuotation: 'true',
        groupSize: this.quotation.memberCount
      }
    });
  }

  generatePDF() {
    if (!this.quotation) return;

    const downPayment = this.quotation.downPaymentPerMember;
    const monthlyPayment = this.quotation.monthlyPaymentPerMember;
    const term = this.quotation.term ?? 60;
    const interestRate = typeof this.quotation.annualRate === 'number' ? this.quotation.annualRate : 29.9;

    const quoteData = {
      clientInfo: {
        name: `Grupo de ${this.quotation.memberCount} miembros`,
        contact: 'contacto@conductores.com'
      },
      ecosystemInfo: {
        name: 'EdoMex Colectivo',
        route: 'Rutas Autorizadas',
        market: 'EDOMEX' as const
      },
      quoteDetails: {
        vehicleValue: this.quotation.unitPrice,
        downPaymentOptions: [downPayment],
        monthlyPaymentOptions: [monthlyPayment],
        termOptions: [term],
        interestRate
      },
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      quoteNumber: `EDO-COLECT-${Date.now()}`
    };

    this.pdfExportService.generateProposalPDF(quoteData as any, 0)
      .then((blob: Blob) => {
        const filename = `cotizacion-edomex-colectivo-${this.quotation.memberCount}-miembros.pdf`;
        this.pdfExportService.downloadPDF(blob, filename);
      })
      .catch((err: any) => {
      });
  }

  formatCurrency(value: number): string {
    return this.financialCalc.formatCurrency(value);
  }

  private loadCollectivePackage(): void {
    this.loadingService.show(this.packageLoadingId);
    this.cotizadorEngine
      .getProductPackage('edomex-colectivo')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: pkg => {
          this.packageData = pkg;
          this.packageTerm = pkg.terms?.[0] ?? 60;
          this.packageDownPaymentPct = pkg.minDownPaymentPercentage ?? this.packageDownPaymentPct;
          this.defaultUnitPrice = round2(this.cotizadorEngine.calculatePackagePrice(pkg, this.packageTerm));
          this.configForm.patchValue({ unitPrice: this.defaultUnitPrice }, { emitEvent: false });
          this.loadingService.hide(this.packageLoadingId);
        },
        error: () => {
          this.loadingService.hide(this.packageLoadingId);
        }
      });
  }

  private createCollectionUnitGroup(consumption = 400, overprice = 3): FormGroup {
    return this.fb.group({
      consumption: [consumption, [Validators.required, Validators.min(0)]],
      overprice: [overprice, [Validators.required, Validators.min(0)]]
    });
  }
}
