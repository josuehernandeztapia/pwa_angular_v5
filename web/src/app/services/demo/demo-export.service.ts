import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DemoExportService {
  async exportReport(name: string): Promise<Blob> {
    const content = `Reporte demo generado para: ${name}\nFecha: ${new Date().toISOString()}`;
    const blob = new Blob([content], { type: 'text/plain' });
    await new Promise(resolve => setTimeout(resolve, 350));
    return blob;
  }
}
