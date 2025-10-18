import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  ContactChannel,
  ContactOutcomeEnum,
  ContactPurpose,
  MaintenanceReminder,
  PostSalesContact,
  PostSalesRecord,
  PostSalesRevenue,
  PostSalesService,
  PostSalesSurveyResponse,
  ServicePackage,
  ServicePackageEnum,
  ServiceType,
  ServiceTypeEnum,
  VehicleDeliveredEvent
} from '@interfaces/postventa';
import { mockPostSalesRecord } from '@interfaces/postventa.mocks';
import { MockUtilityAdapter } from './utility-mock.adapter';

@Injectable({ providedIn: 'root' })
export class PostSalesMockAdapter {
  private readonly records = new Map<string, PostSalesRecord>();
  private readonly services = new Map<string, PostSalesService[]>();
  private readonly contacts = new Map<string, PostSalesContact[]>();
  private readonly reminders = new Map<string, MaintenanceReminder[]>();
  private readonly revenues = new Map<string, PostSalesRevenue>();
  private readonly surveyResponses = new Map<string, PostSalesSurveyResponse[]>();

  constructor(private readonly mockUtils: MockUtilityAdapter) {}

  sendVehicleDeliveredEvent(event: VehicleDeliveredEvent): Observable<{
    success: boolean;
    postSalesRecordId?: string;
    remindersCreated?: number;
    error?: string;
  }> {
    const record = this.ensureRecord(event.payload.vehicle.vin, event.payload.clientId);
    record.warrantyStart = new Date(event.payload.contract.warranty_start);
    record.warrantyEnd = new Date(event.payload.contract.warranty_end);
    record.servicePackage = event.payload.contract.servicePackage;
    record.odometroEntrega = event.payload.vehicle.odometer_km_delivery;
    this.records.set(record.vin, { ...record });

    const generatedReminders = this.generateReminders(record);
    this.reminders.set(record.vin, generatedReminders);

    return this.mockUtils.mockApi({
      success: true,
      postSalesRecordId: record.id,
      remindersCreated: generatedReminders.length
    }, this.mockUtils.networkSimulation.fast);
  }

  getPostSalesRecord(vin: string): Observable<{
    record: PostSalesRecord;
    services: PostSalesService[];
    contacts: PostSalesContact[];
    reminders: MaintenanceReminder[];
    revenue: PostSalesRevenue | null;
  } | null> {
    const record = this.ensureRecord(vin);
    return this.mockUtils.mockApi({
      record,
      services: this.getServices(vin),
      contacts: this.getContacts(vin),
      reminders: this.getReminders(vin),
      revenue: this.revenues.get(vin) ?? null
    }, this.mockUtils.networkSimulation.fast);
  }

  getClientPostSalesRecords(clientId: string): Observable<PostSalesRecord[]> {
    const records = Array.from(this.records.values()).filter(record => record.clientId === clientId);
    return this.mockUtils.mockApi(records, this.mockUtils.networkSimulation.fast);
  }

  updatePostSalesRecord(vin: string, updates: Partial<PostSalesRecord>): Observable<{
    success: boolean;
    record?: PostSalesRecord;
    error?: string;
  }> {
    const record = this.ensureRecord(vin);
    const updatedRecord: PostSalesRecord = {
      ...record,
      ...updates,
      nextMaintenanceDate: updates.nextMaintenanceDate ? new Date(updates.nextMaintenanceDate) : record.nextMaintenanceDate,
      warrantyStart: updates.warrantyStart ? new Date(updates.warrantyStart) : record.warrantyStart,
      warrantyEnd: updates.warrantyEnd ? new Date(updates.warrantyEnd) : record.warrantyEnd,
      createdAt: record.createdAt
    };

    this.records.set(vin, updatedRecord);
    return this.mockUtils.mockApi({ success: true, record: updatedRecord }, this.mockUtils.networkSimulation.normal);
  }

  registerService(vin: string, serviceData: {
    serviceType: ServiceType;
    serviceDate: Date;
    odometroKm: number;
    descripcion: string;
    costo: number;
    tecnico: string;
    customerSatisfaction?: number;
    partesUsadas?: any[];
    tiempoServicio?: number;
    notas?: string;
    fotos?: string[];
  }): Observable<{
    success: boolean;
    service?: PostSalesService;
    nextMaintenance?: { date: Date; km: number };
    error?: string;
  }> {
    const record = this.ensureRecord(vin);
    const service: PostSalesService = {
      id: `svc-${Date.now()}`,
      vin,
      serviceType: serviceData.serviceType,
      serviceDate: new Date(serviceData.serviceDate),
      odometroKm: serviceData.odometroKm,
      descripcion: serviceData.descripcion,
      costo: serviceData.costo,
      tecnico: serviceData.tecnico,
      customerSatisfaction: serviceData.customerSatisfaction ?? 4,
      partesUsadas: serviceData.partesUsadas as any,
      tiempoServicio: serviceData.tiempoServicio ?? 120,
      notas: serviceData.notas,
      fotos: serviceData.fotos
    };

    const services = this.getServices(vin);
    services.unshift(service);
    this.services.set(vin, services);

    const nextMaintenance = {
      date: new Date(service.serviceDate.getTime() + 90 * 24 * 60 * 60 * 1000),
      km: service.odometroKm + 5000
    };
    record.nextMaintenanceDate = nextMaintenance.date;
    record.nextMaintenanceKm = nextMaintenance.km;
    this.records.set(vin, record);

    return this.mockUtils.mockApi({ success: true, service, nextMaintenance }, this.mockUtils.networkSimulation.normal);
  }

  getServiceHistory(vin: string, filters?: {
    serviceType?: ServiceType;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Observable<PostSalesService[]> {
    let history = this.getServices(vin);

    if (filters?.serviceType) {
      history = history.filter(item => item.serviceType === filters.serviceType);
    }
    if (filters?.startDate) {
      const start = new Date(filters.startDate);
      history = history.filter(item => item.serviceDate >= start);
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate);
      history = history.filter(item => item.serviceDate <= end);
    }
    if (filters?.limit) {
      history = history.slice(0, filters.limit);
    }

    return this.mockUtils.mockApi(history, this.mockUtils.networkSimulation.fast);
  }

  getMaintenanceReminders(vin: string): Observable<MaintenanceReminder[]> {
    const record = this.ensureRecord(vin);
    if (!this.reminders.has(vin)) {
      this.reminders.set(vin, this.generateReminders(record));
    }

    return this.mockUtils.mockApi(this.getReminders(vin), this.mockUtils.networkSimulation.fast);
  }

  scheduleMaintenanceReminder(vin: string, reminderData: {
    dueDate: Date;
    dueKm: number;
    serviceType: string;
  }): Observable<{
    success: boolean;
    reminder?: MaintenanceReminder;
    error?: string;
  }> {
    this.ensureRecord(vin);
    const reminder: MaintenanceReminder = {
      id: `rem-${Date.now()}`,
      vin,
      dueDate: new Date(reminderData.dueDate),
      dueKm: reminderData.dueKm,
      serviceType: reminderData.serviceType,
      reminder30dSent: false,
      reminder15dSent: false,
      reminder7dSent: false,
      completed: false
    };

    const list = this.getReminders(vin);
    list.push(reminder);
    this.reminders.set(vin, list);

    return this.mockUtils.mockApi({ success: true, reminder }, this.mockUtils.networkSimulation.fast);
  }

  getUpcomingReminders(filters?: {
    urgencyLevel?: 'urgent' | 'soon' | 'scheduled';
    postSalesAgent?: string;
    limit?: number;
  }): Observable<{
    urgent: MaintenanceReminder[];
    soon: MaintenanceReminder[];
    scheduled: MaintenanceReminder[];
    total: number;
  }> {
    const now = Date.now();
    const allReminders = Array.from(this.reminders.values()).flat().filter(reminder => !reminder.completed);

    const categorize = (reminder: MaintenanceReminder) => {
      const diffDays = (new Date(reminder.dueDate).getTime() - now) / (1000 * 60 * 60 * 24);
      if (diffDays <= 7) return 'urgent';
      if (diffDays <= 30) return 'soon';
      return 'scheduled';
    };

    const buckets = {
      urgent: [] as MaintenanceReminder[],
      soon: [] as MaintenanceReminder[],
      scheduled: [] as MaintenanceReminder[]
    };

    allReminders.forEach(reminder => {
      buckets[categorize(reminder)].push(reminder);
    });

    const applyLimit = (items: MaintenanceReminder[]) => filters?.limit ? items.slice(0, filters.limit) : items;

    const result = {
      urgent: filters?.urgencyLevel && filters.urgencyLevel !== 'urgent' ? [] : applyLimit(buckets.urgent),
      soon: filters?.urgencyLevel && filters.urgencyLevel !== 'soon' ? [] : applyLimit(buckets.soon),
      scheduled: filters?.urgencyLevel && filters.urgencyLevel !== 'scheduled' ? [] : applyLimit(buckets.scheduled),
      total: allReminders.length
    };

    return this.mockUtils.mockApi(result, this.mockUtils.networkSimulation.normal);
  }

  sendSurvey(data: {
    vin: string;
    clientId: string;
    surveyType: ContactPurpose;
    channel: ContactChannel;
    message?: string;
  }): Observable<{
    success: boolean;
    contactId?: string;
    estimatedDelivery?: Date;
    error?: string;
  }> {
    const contact = this.addContact(data.vin, {
      channel: data.channel,
      purpose: data.surveyType,
      mensaje: data.message,
      programarSeguimiento: undefined
    });

    return this.mockUtils.mockApi({
      success: true,
      contactId: contact.id,
      estimatedDelivery: new Date(Date.now() + 12 * 60 * 60 * 1000)
    }, this.mockUtils.networkSimulation.fast);
  }

  registerContact(vin: string, contactData: {
    channel: ContactChannel;
    purpose: ContactPurpose;
    mensaje?: string;
    respuestaCliente?: string;
    notas?: string;
    programarSeguimiento?: Date;
  }): Observable<{
    success: boolean;
    contact?: PostSalesContact;
    error?: string;
  }> {
    const contact = this.addContact(vin, contactData);
    return this.mockUtils.mockApi({ success: true, contact }, this.mockUtils.networkSimulation.fast);
  }

  getContactHistory(vin: string, filters?: {
    purpose?: ContactPurpose;
    channel?: ContactChannel;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Observable<PostSalesContact[]> {
    let history = this.getContacts(vin);

    if (filters?.purpose) {
      history = history.filter(contact => contact.purpose === filters.purpose);
    }
    if (filters?.channel) {
      history = history.filter(contact => contact.channel === filters.channel);
    }
    if (filters?.startDate) {
      const start = new Date(filters.startDate);
      history = history.filter(contact => contact.contactDate >= start);
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate);
      history = history.filter(contact => contact.contactDate <= end);
    }
    if (filters?.limit) {
      history = history.slice(0, filters.limit);
    }

    return this.mockUtils.mockApi(history, this.mockUtils.networkSimulation.fast);
  }

  processSurveyResponse(vin: string, response: {
    surveyType: ContactPurpose;
    respuestas: { [pregunta: string]: string | number };
    nps?: number;
    csat?: number;
    comentarios?: string;
  }): Observable<{
    success: boolean;
    surveyResponse?: PostSalesSurveyResponse;
    followUpRequired?: boolean;
    error?: string;
  }> {
    const record = this.ensureRecord(vin);
    const survey: PostSalesSurveyResponse = {
      id: `survey-${Date.now()}`,
      vin,
      clientId: record.clientId,
      surveyType: response.surveyType,
      respuestas: response.respuestas,
      nps: response.nps,
      csat: response.csat,
      comentarios: response.comentarios,
      completedAt: new Date()
    };

    const list = this.surveyResponses.get(vin) ?? [];
    list.unshift(survey);
    this.surveyResponses.set(vin, list);

    const followUpRequired = (survey.nps ?? 10) < 7 || (survey.csat ?? 5) < 3;

    return this.mockUtils.mockApi({ success: true, surveyResponse: survey, followUpRequired }, this.mockUtils.networkSimulation.normal);
  }

  getSurveyAnalytics(filters?: {
    surveyType?: ContactPurpose;
    startDate?: Date;
    endDate?: Date;
    servicePackage?: ServicePackage;
  }): Observable<{
    averageNPS: number;
    averageCSAT: number;
    responseRate: number;
    totalResponses: number;
    satisfactionTrend: { month: string; nps: number; csat: number }[];
    topIssues: { issue: string; count: number }[];
  }> {
    let responses = Array.from(this.surveyResponses.values()).flat();

    if (filters?.surveyType) {
      responses = responses.filter(item => item.surveyType === filters.surveyType);
    }
    if (filters?.startDate) {
      const start = new Date(filters.startDate);
      responses = responses.filter(item => item.completedAt >= start);
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate);
      responses = responses.filter(item => item.completedAt <= end);
    }

    const total = responses.length || 1;
    const averageNPS = responses.reduce((sum, item) => sum + (item.nps ?? 0), 0) / total;
    const averageCSAT = responses.reduce((sum, item) => sum + (item.csat ?? 0), 0) / total;

    const satisfactionTrendMap = new Map<string, { count: number; nps: number; csat: number }>();
    responses.forEach(item => {
      const month = item.completedAt.toISOString().slice(0, 7);
      const entry = satisfactionTrendMap.get(month) ?? { count: 0, nps: 0, csat: 0 };
      entry.count += 1;
      entry.nps += item.nps ?? 0;
      entry.csat += item.csat ?? 0;
      satisfactionTrendMap.set(month, entry);
    });

    const satisfactionTrend = Array.from(satisfactionTrendMap.entries()).map(([month, entry]) => ({
      month,
      nps: entry.count ? Number((entry.nps / entry.count).toFixed(1)) : 0,
      csat: entry.count ? Number((entry.csat / entry.count).toFixed(1)) : 0
    }));

    return this.mockUtils.mockApi({
      averageNPS: Number(averageNPS.toFixed(1)),
      averageCSAT: Number(averageCSAT.toFixed(1)),
      responseRate: 0.65,
      totalResponses: responses.length,
      satisfactionTrend,
      topIssues: []
    }, this.mockUtils.networkSimulation.normal);
  }

  createWarrantyTicket(_data: {
    vin: string;
    clientId: string;
    descripcionFalla: string;
    fechaIncidente: Date;
    kilometraje: number;
    fotos?: string[];
    prioridad: 'low' | 'medium' | 'high' | 'critical';
  }): Observable<{
    success: boolean;
    ticketId?: string;
    estimatedResolution?: Date;
    odooOrderId?: string;
    error?: string;
  }> {
    return this.mockUtils.mockApi({
      success: true,
      ticketId: `warranty-${Date.now()}`,
      estimatedResolution: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      odooOrderId: `OD-${Math.floor(Math.random() * 100000)}`
    }, this.mockUtils.networkSimulation.normal);
  }

  getWarrantyStatus(vin: string): Observable<{
    isActive: boolean;
    warrantyStart: Date;
    warrantyEnd: Date;
    remainingDays: number;
    coverageDetails: {
      engine: boolean;
      transmission: boolean;
      electrical: boolean;
      bodywork: boolean;
    };
    activeTickets: number;
    completedTickets: number;
  } | null> {
    const record = this.ensureRecord(vin);
    const now = Date.now();
    const remainingDays = Math.max(0, Math.round((record.warrantyEnd.getTime() - now) / (1000 * 60 * 60 * 24)));

    return this.mockUtils.mockApi({
      isActive: remainingDays > 0,
      warrantyStart: record.warrantyStart,
      warrantyEnd: record.warrantyEnd,
      remainingDays,
      coverageDetails: {
        engine: true,
        transmission: true,
        electrical: true,
        bodywork: record.servicePackage !== 'basic'
      },
      activeTickets: 0,
      completedTickets: 2
    }, this.mockUtils.networkSimulation.fast);
  }

  getVehicleRevenue(vin: string): Observable<PostSalesRevenue | null> {
    const record = this.ensureRecord(vin);
    if (!this.revenues.has(vin)) {
      this.revenues.set(vin, this.generateRevenue(record));
    }
    return this.mockUtils.mockApi(this.revenues.get(vin) ?? null, this.mockUtils.networkSimulation.fast);
  }

  getPostSalesKPIs(_filters?: {
    startDate?: Date;
    endDate?: Date;
    postSalesAgent?: string;
    servicePackage?: ServicePackage;
  }): Observable<{
    totalVehiclesDelivered: number;
    vehiclesUnderWarranty: number;
    premiumPackages: number;
    extendedPackages: number;
    overallSatisfaction: number;
    overdueMaintenances: number;
    monthlyServiceRevenue: { month: string; revenue: number }[];
    satisfactionTrend: { month: string; satisfaction: number }[];
    topServiceTypes: { type: ServiceType; count: number; revenue: number }[];
  }> {
    const records = Array.from(this.records.values());
    const now = new Date();
    const vehiclesUnderWarranty = records.filter(record => record.warrantyEnd > now).length;
    const premiumPackages = records.filter(record => record.servicePackage === ServicePackageEnum.Premium).length;
    const extendedPackages = records.filter(record => record.servicePackage === ServicePackageEnum.Extended).length;

    const allServices = Array.from(this.services.values()).flat();
    const serviceRevenueByMonth = new Map<string, number>();
    const serviceTypeStats = new Map<ServiceType, { count: number; revenue: number }>();

    allServices.forEach(service => {
      const month = service.serviceDate.toISOString().slice(0, 7);
      serviceRevenueByMonth.set(month, (serviceRevenueByMonth.get(month) ?? 0) + service.costo);
      const stats = serviceTypeStats.get(service.serviceType) ?? { count: 0, revenue: 0 };
      stats.count += 1;
      stats.revenue += service.costo;
      serviceTypeStats.set(service.serviceType, stats);
    });

    const monthlyServiceRevenue = Array.from(serviceRevenueByMonth.entries()).map(([month, revenue]) => ({ month, revenue }));
    const topServiceTypes = Array.from(serviceTypeStats.entries()).map(([type, stats]) => ({ type, count: stats.count, revenue: stats.revenue }));

    const overdueMaintenances = Array.from(this.reminders.values()).flat().filter(reminder => !reminder.completed && reminder.dueDate < now).length;
    const averageCsat = allServices.length ? allServices.reduce((sum, service) => sum + (service.customerSatisfaction ?? 4), 0) / allServices.length : 4.5;

    return this.mockUtils.mockApi({
      totalVehiclesDelivered: records.length,
      vehiclesUnderWarranty,
      premiumPackages,
      extendedPackages,
      overallSatisfaction: Number(averageCsat.toFixed(1)),
      overdueMaintenances,
      monthlyServiceRevenue,
      satisfactionTrend: monthlyServiceRevenue.map(({ month, revenue }) => ({ month, satisfaction: Math.max(3, Math.min(5, revenue / 5000)) })),
      topServiceTypes
    }, this.mockUtils.networkSimulation.normal);
  }

  getLTVAnalytics(_filters?: {
    servicePackage?: ServicePackage;
    clientSegment?: string;
    startDate?: Date;
    endDate?: Date;
  }): Observable<{
    averageLTV: number;
    topCustomers: { clientId: string; vin: string; ltv: number }[];
    ltvByPackage: { package: ServicePackage; averageLTV: number; count: number }[];
    projectedRevenue: { month: string; projected: number; actual: number }[];
  }> {
    const revenues = Array.from(this.revenues.values());
    const averageLTV = revenues.length ? revenues.reduce((sum, revenue) => sum + revenue.ltv, 0) / revenues.length : 0;

    const topCustomers = revenues
      .slice(0, 5)
      .map(revenue => ({ clientId: revenue.clientId, vin: revenue.vin, ltv: revenue.ltv }));

    const ltvByPackageMap = new Map<ServicePackage, { sum: number; count: number }>();
    this.records.forEach(record => {
      const revenue = this.revenues.get(record.vin) ?? this.generateRevenue(record);
      const entry = ltvByPackageMap.get(record.servicePackage) ?? { sum: 0, count: 0 };
      entry.sum += revenue.ltv;
      entry.count += 1;
      ltvByPackageMap.set(record.servicePackage, entry);
    });

    const ltvByPackage = Array.from(ltvByPackageMap.entries()).map(([pkg, data]) => ({
      package: pkg,
      averageLTV: data.count ? Number((data.sum / data.count).toFixed(2)) : 0,
      count: data.count
    }));

    const projectedRevenue = revenues.map(revenue => ({
      month: new Date(revenue.updatedAt).toISOString().slice(0, 7),
      projected: revenue.ltv / 12,
      actual: (revenue.serviceRevenue + revenue.partsRevenue) / 12
    }));

    return this.mockUtils.mockApi({
      averageLTV: Number(averageLTV.toFixed(2)),
      topCustomers,
      ltvByPackage,
      projectedRevenue
    }, this.mockUtils.networkSimulation.normal);
  }

  scheduleMaintenanceService(request: {
    vin: string;
    serviceType: ServiceType;
    scheduledDate: Date;
    servicePackage: ServicePackage;
    notes?: string;
  }): Observable<{
    success: boolean;
    serviceId?: string;
    error?: string;
  }> {
    const record = this.ensureRecord(request.vin);
    record.servicePackage = request.servicePackage;
    const serviceId = `svc-${Math.floor(Math.random() * 100000)}`;

    const reminders = this.getReminders(request.vin);
    reminders.push({
      id: `rem-${serviceId}`,
      vin: request.vin,
      dueDate: new Date(request.scheduledDate),
      dueKm: record.nextMaintenanceKm,
      serviceType: request.serviceType,
      reminder30dSent: false,
      reminder15dSent: false,
      reminder7dSent: false,
      completed: false
    });
    this.reminders.set(request.vin, reminders);

    return this.mockUtils.mockApi({ success: true, serviceId }, this.mockUtils.networkSimulation.fast);
  }

  recordClientContact(contact: {
    vin: string;
    contactDate: Date;
    channel: ContactChannel;
    purpose: ContactPurpose;
    notes?: string;
    contactedBy: string;
    clientResponse?: string;
    nextContactDate?: Date;
  }): Observable<{
    success: boolean;
    contactId?: string;
    error?: string;
  }> {
    const newContact = this.addContact(contact.vin, {
      channel: contact.channel,
      purpose: contact.purpose,
      mensaje: contact.notes,
      respuestaCliente: contact.clientResponse,
      programarSeguimiento: contact.nextContactDate
    }, new Date(contact.contactDate));

    return this.mockUtils.mockApi({ success: true, contactId: newContact.id }, this.mockUtils.networkSimulation.fast);
  }

  healthCheck(): Observable<{
    status: 'healthy' | 'degraded' | 'down';
    database: 'connected' | 'disconnected';
    externalIntegrations: {
      makeN8n: 'connected' | 'disconnected';
      odoo: 'connected' | 'disconnected';
      whatsapp: 'connected' | 'disconnected';
    };
    version: string;
    uptime: number;
  }> {
    return this.mockUtils.mockApi({
      status: 'healthy',
      database: 'connected',
      externalIntegrations: {
        makeN8n: 'connected',
        odoo: 'connected',
        whatsapp: 'connected'
      },
      version: 'mock-1.0.0',
      uptime: 72 * 60 * 60
    }, this.mockUtils.networkSimulation.fast);
  }

  private ensureRecord(vin: string, clientId?: string): PostSalesRecord {
    const existing = this.records.get(vin);
    if (existing) {
      if (clientId && existing.clientId !== clientId) {
        existing.clientId = clientId;
        this.records.set(vin, existing);
      }
      return existing;
    }

    const seed = mockPostSalesRecord();
    const record: PostSalesRecord = {
      ...seed,
      id: `ps-${vin}`,
      vin,
      clientId: clientId ?? seed.clientId,
      nextMaintenanceDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      nextMaintenanceKm: seed.nextMaintenanceKm,
      createdAt: new Date(),
      warrantyStart: new Date(seed.warrantyStart),
      warrantyEnd: new Date(seed.warrantyEnd),
      postSalesAgent: seed.postSalesAgent
    };

    this.records.set(vin, record);
    this.services.set(vin, this.services.get(vin) ?? []);
    this.contacts.set(vin, this.contacts.get(vin) ?? []);
    this.reminders.set(vin, this.reminders.get(vin) ?? this.generateReminders(record));
    this.revenues.set(vin, this.revenues.get(vin) ?? this.generateRevenue(record));

    return record;
  }

  private getServices(vin: string): PostSalesService[] {
    return this.services.get(vin) ?? [];
  }

  private getContacts(vin: string): PostSalesContact[] {
    return this.contacts.get(vin) ?? [];
  }

  private getReminders(vin: string): MaintenanceReminder[] {
    return this.reminders.get(vin) ?? [];
  }

  private addContact(
    vin: string,
    contactData: {
      channel: ContactChannel;
      purpose: ContactPurpose;
      mensaje?: string;
      respuestaCliente?: string;
      notas?: string;
      programarSeguimiento?: Date;
    },
    contactDate: Date = new Date()
  ): PostSalesContact {
    this.ensureRecord(vin);
    const contact: PostSalesContact = {
      id: `contact-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      vin,
      contactDate,
      channel: contactData.channel,
      purpose: contactData.purpose,
      outcome: contactData.respuestaCliente ? ContactOutcomeEnum.Answered : ContactOutcomeEnum.Sent,
      mensaje: contactData.mensaje,
      respuestaCliente: contactData.respuestaCliente,
      notas: contactData.notas,
      programarSeguimiento: contactData.programarSeguimiento
    };

    const list = this.getContacts(vin);
    list.unshift(contact);
    this.contacts.set(vin, list);

    return contact;
  }

  private generateReminders(record: PostSalesRecord): MaintenanceReminder[] {
    return [
      {
        id: `rem-${record.vin}-1`,
        vin: record.vin,
        dueDate: new Date(record.nextMaintenanceDate),
        dueKm: record.nextMaintenanceKm,
      serviceType: ServiceTypeEnum.Mantenimiento,
        reminder30dSent: true,
        reminder15dSent: false,
        reminder7dSent: false,
        completed: false
      }
    ];
  }

  private generateRevenue(record: PostSalesRecord): PostSalesRevenue {
    const serviceRevenue = 18000 + Math.random() * 4000;
    const partsRevenue = 6000 + Math.random() * 2000;
    const warrantyWork = 1500 + Math.random() * 800;

    return {
      id: `rev-${record.vin}`,
      clientId: record.clientId,
      vin: record.vin,
      serviceRevenue,
      partsRevenue,
      warrantyWork,
      profitMargin: Number(((serviceRevenue + partsRevenue - warrantyWork) / (serviceRevenue + partsRevenue)).toFixed(2)),
      ltv: Number((serviceRevenue + partsRevenue) * 1.8),
      updatedAt: new Date()
    };
  }
}
