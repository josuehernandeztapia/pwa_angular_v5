import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay, map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class DashboardMockAdapter {
  private readonly NETWORK_DELAY = 500;

  getDashboardStats(): Observable<{
    clients: any;
    ecosystems: any;
    groups: any;
    recentActivity: any[];
  }> {
    return of(null).pipe(
      delay(this.NETWORK_DELAY),
      map(() => ({
        clients: {
          total: 25,
          active: 18,
          new_this_month: 5
        },
        ecosystems: {
          total: 2,
          active: 1,
          pending: 1
        },
        groups: {
          total: 4,
          active: 3,
          units_delivered: 6
        },
        recentActivity: [
          {
            type: 'client',
            message: 'Nuevo cliente registrado: Juan Pérez',
            timestamp: new Date(Date.now() - 15 * 60 * 1000)
          },
          {
            type: 'group',
            message: 'Unidad entregada en CC-2405 MAYO',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000)
          },
          {
            type: 'ecosystem',
            message: 'Documentos aprobados para Ruta 27',
            timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000)
          }
        ]
      }))
    );
  }
}
