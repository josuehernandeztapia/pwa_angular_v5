import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { UsuariosService, Usuario, UsuarioDto } from '@feature-services/clients/usuarios.service';
import { environment } from '@environments/environment';

describe('UsuariosService (BFF)', () => {
  let service: UsuariosService;
  let httpMock: HttpTestingController;
  let originalFlag: boolean;

  const apiBase = environment.api?.users ?? '/bff/users';

  const mockUsuario = (overrides: Partial<Usuario> = {}): Usuario => ({
    id: overrides.id ?? 'usr-1',
    nombre: overrides.nombre ?? 'Usuario Demo',
    email: overrides.email ?? 'usuario@demo.mx',
    rol: overrides.rol ?? 'asesor',
    activo: overrides.activo ?? true,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString()
  });

  beforeEach(() => {
    originalFlag = environment.features.enableAdminBff;
    environment.features.enableAdminBff = true;

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UsuariosService]
    });

    service = TestBed.inject(UsuariosService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    environment.features.enableAdminBff = originalFlag;
    httpMock.verify();
    localStorage.clear();
  });

  it('should list usuarios desde el BFF', () => {
    const payload = [mockUsuario(), mockUsuario({ id: 'usr-2', email: 'otra@demo.mx' })];
    let received: Usuario[] | undefined;

    service.list().subscribe(users => (received = users));

    const req = httpMock.expectOne(apiBase);
    expect(req.request.method).toBe('GET');
    req.flush(payload);

    expect(received).toEqual(payload);
  });

  it('should create usuario vía POST y refrescar cache', () => {
    const dto: UsuarioDto = { nombre: 'Nuevo Usuario', email: 'nuevo@demo.mx', rol: 'operaciones' };
    const created = mockUsuario({ id: 'usr-new', nombre: dto.nombre, email: dto.email, rol: dto.rol });

    let received: Usuario | undefined;
    service.create(dto).subscribe(usuario => (received = usuario));

    const postReq = httpMock.expectOne(apiBase);
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toEqual(dto);
    postReq.flush(created);

    const refreshReq = httpMock.expectOne(apiBase);
    expect(refreshReq.request.method).toBe('GET');
    refreshReq.flush([created]);

    expect(received).toEqual(created);
  });

  it('should update usuario y refrescar cache', () => {
    const dto: UsuarioDto = { nombre: 'Usuario Editado', email: 'editado@demo.mx', rol: 'admin' };
    const updated = mockUsuario({ id: 'usr-1', nombre: dto.nombre, email: dto.email, rol: dto.rol });

    let received: Usuario | undefined;
    service.update('usr-1', dto).subscribe(usuario => (received = usuario));

    const putReq = httpMock.expectOne(`${apiBase}/usr-1`);
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body).toEqual(dto);
    putReq.flush(updated);

    const refreshReq = httpMock.expectOne(apiBase);
    expect(refreshReq.request.method).toBe('GET');
    refreshReq.flush([updated]);

    expect(received).toEqual(updated);
  });

  it('should toggle status vía PATCH y refrescar cache', () => {
    const toggled = mockUsuario({ id: 'usr-1', activo: false });

    let received: Usuario | undefined;
    service.toggleStatus('usr-1', false).subscribe(usuario => (received = usuario));

    const patchReq = httpMock.expectOne(`${apiBase}/usr-1/status`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ activo: false });
    patchReq.flush(toggled);

    const refreshReq = httpMock.expectOne(apiBase);
    expect(refreshReq.request.method).toBe('GET');
    refreshReq.flush([toggled]);

    expect(received).toEqual(toggled);
  });
});
