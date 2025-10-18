import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID, Renderer2 } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DownloadService } from './download.service';

const PLATFORM_BROWSER_ID = 'browser';

describe('DownloadService', () => {
  let service: DownloadService;
  let renderer: Renderer2;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DownloadService,
        { provide: DOCUMENT, useValue: document },
        { provide: PLATFORM_ID, useValue: PLATFORM_BROWSER_ID }
      ]
    });
    service = TestBed.inject(DownloadService);
    renderer = (service as any).renderer as Renderer2;
  });

  it('should create a hidden anchor element and trigger a click when downloading from URL', () => {
    const anchor = document.createElement('a');
    const clickSpy = spyOn(anchor, 'click');
    const createElementSpy = spyOn(renderer, 'createElement').and.returnValue(anchor);
    const appendSpy = spyOn(renderer, 'appendChild').and.callThrough();
    const removeSpy = spyOn(renderer, 'removeChild').and.callThrough();

    service.downloadFromUrl('test://file', { filename: 'example.txt', target: '_blank' });

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(anchor.getAttribute('download')).toBe('example.txt');
    expect(anchor.getAttribute('href')).toBe('test://file');
    expect(anchor.getAttribute('target')).toBe('_blank');
    expect(appendSpy).toHaveBeenCalledWith(document.body, anchor);
    expect(clickSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith(document.body, anchor);
  });

  it('should create an object URL when downloading blobs and revoke it afterwards', () => {
    const blob = new Blob(['hello world'], { type: 'text/plain' });
    const objectUrl = 'blob://generated';
    const createObjectSpy = spyOn(URL, 'createObjectURL').and.returnValue(objectUrl);
    const revokeSpy = spyOn(URL, 'revokeObjectURL');
    const downloadSpy = spyOn(service, 'downloadFromUrl').and.callFake((url, options) => {
      if (options.revokeUrl) {
        URL.revokeObjectURL(url);
      }
    });

    service.downloadBlob(blob, { filename: 'test.txt' });

    expect(createObjectSpy).toHaveBeenCalledWith(blob);
    expect(downloadSpy).toHaveBeenCalledWith(objectUrl, jasmine.objectContaining({ filename: 'test.txt', revokeUrl: true }));
    expect(revokeSpy).toHaveBeenCalledWith(objectUrl);
  });
});

describe('DownloadService on non-browser platform', () => {
  let service: DownloadService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DownloadService,
        { provide: DOCUMENT, useValue: document },
        { provide: PLATFORM_ID, useValue: 'server' }
      ]
    });
    service = TestBed.inject(DownloadService);
  });

  it('should no-op when running outside the browser', () => {
    const appendSpy = spyOn(document.body, 'appendChild');
    service.downloadFromUrl('test://file', { filename: 'example.txt' });
    expect(appendSpy).not.toHaveBeenCalled();
  });
});
