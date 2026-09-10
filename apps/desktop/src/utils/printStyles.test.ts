import { afterEach, describe, expect, it } from 'vitest';
import { completePageSetup, type HeaderFooter, type PageSetup } from '@officewrite/core';
import { applyPrintPageSetup } from './printStyles';

const styleText = () => document.getElementById('officewrite-print-styles')!.textContent!;

function captureMarginBoxSource() {
  // jsdom cannot parse nested @page margin boxes. Inspect generated source here;
  // browser coverage is responsible for Chromium's stylesheet interpretation.
  const style = document.createElement('style');
  style.id = 'officewrite-print-styles';
  style.type = 'text/plain';
  document.head.appendChild(style);
}

afterEach(() => {
  document.getElementById('officewrite-print-styles')?.remove();
});

describe('print stylesheet document boundary', () => {
  it.each([
    { pageColor: '#fff; } body { background: url(https://example.invalid/pixel) } /*' },
    { columns: { gap: '0; } body { display:none } /*' } },
    { border: { style: 'solid; } body { display:none } /*' } },
    { border: { color: 'rgb(0,0,0);background:url(https://example.invalid/pixel)' } },
    { border: { width: '1; } body { display:none } /*' } },
    { margins: { top: Number.POSITIVE_INFINITY } },
    { size: '__proto__' },
  ])('rejects direct unsafe API calls before replacing the existing stylesheet: %j', (invalid) => {
    applyPrintPageSetup(completePageSetup());
    const original = styleText();
    expect(() => applyPrintPageSetup(invalid as unknown as PageSetup)).toThrow('Invalid document settings');
    expect(styleText()).toBe(original);
  });

  it('completes partial older page settings at the print API', () => {
    applyPrintPageSetup({ margins: { top: 0 }, columns: { count: 2, gap: 24, line: true } } as PageSetup);
    expect(styleText()).toContain('margin: 0in 1in 1in 1in');
    expect(styleText()).toContain('column-count: 2 !important');
    expect(styleText()).toContain('column-gap: 24px');
  });

  it('encodes string-breaking controls and preserves page-number fields in all zones', () => {
    captureMarginBoxSource();
    const payload = 'Before\\"\n\r\f\u0000\u001f\u007f; } } body { color:red } /* %p of %P After';
    const zones = { left: payload, center: payload, right: payload };
    applyPrintPageSetup(completePageSetup(), {
      header: '', footer: '', showPageNumbers: true, headerZones: zones, footerZones: zones, differentFirstPage: true,
    });
    const text = styleText();
    expect(text).not.toContain(payload);
    expect(text.match(/Before\\5c \\22 \\a \\d \\c \\0 \\1f \\7f /g)).toHaveLength(6);
    expect(text.match(/counter\(page\)/g)).toHaveLength(7);
    expect(text.match(/counter\(pages\)/g)).toHaveLength(7);
    expect(text).toContain('@page :first');
  });

  it('escapes legacy centred strings and rejects malformed zones before mutation', () => {
    captureMarginBoxSource();
    applyPrintPageSetup(completePageSetup(), { header: 'Title\ncontinued', footer: 'Footer', showPageNumbers: false });
    const original = styleText();
    expect(original).toContain('"Title\\a continued"');
    expect(() => applyPrintPageSetup(completePageSetup(), { headerZones: { left: 3 } } as unknown as HeaderFooter))
      .toThrow('Invalid document settings');
    expect(styleText()).toBe(original);
  });
});
