import { describe, expect, it } from 'vitest';
import { createDocumentEnvelope, parseOfficewriteFile } from './document';
import { completeHeaderFooter, completePageSetup, DEFAULT_PAGE_SETUP, footerZonesOf, headerZonesOf, PAGE_DIMENSIONS } from './pageSetup';

const content = { type: 'doc', content: [{ type: 'paragraph' }] };

describe('document page settings boundary', () => {
  it('preserves signed vertical margins imported from DOCX', () => {
    expect(createDocumentEnvelope(content, { pageSetup: { margins: { top: -48, bottom: -24 } } as never }).pageSetup.margins)
      .toMatchObject({ top: -48, bottom: -24 });
  });

  it('completes old partial settings and preserves explicit zero spacing', () => {
    const settings = completePageSetup({ margins: { top: 0 }, columns: { gap: 0 } });
    expect(settings).toEqual({
      ...DEFAULT_PAGE_SETUP,
      margins: { ...DEFAULT_PAGE_SETUP.margins, top: 0 },
      columns: { ...DEFAULT_PAGE_SETUP.columns, gap: 0 },
    });
    expect(createDocumentEnvelope(content).pageSetup).toEqual(DEFAULT_PAGE_SETUP);
    expect(parseOfficewriteFile({ version: 1, content }).pageSetup).toEqual(DEFAULT_PAGE_SETUP);
    expect(completePageSetup(null)).toEqual(DEFAULT_PAGE_SETUP);
    const nullable = createDocumentEnvelope(content, { pageSetup: null as never, headerFooter: null as never });
    expect(nullable.pageSetup).toEqual(DEFAULT_PAGE_SETUP);
    expect(nullable.headerFooter).toEqual({ header: '', footer: '', showPageNumbers: false });
  });

  it.each(Object.keys(PAGE_DIMENSIONS))('preserves the %s paper size and landscape orientation', (size) => {
    expect(completePageSetup({ size, orientation: 'landscape' })).toMatchObject({ size, orientation: 'landscape' });
  });

  it.each(['#fff', '#abcdef', 'rgb(12, 34, 56)', 'rgba(12, 34, 56, 0.5)', 'hsl(120, 50%, 50%)', 'navy'])
    ('preserves supported page and border colour %s', (color) => {
      const settings = completePageSetup({ pageColor: color, border: { style: 'dashed', color, width: 2.5 } });
      expect(settings.pageColor).toBe(color);
      expect(settings.border).toEqual({ style: 'dashed', color, width: 2.5 });
    });

  const invalid = [
    { pageColor: '#fff; } body { background: url(https://example.invalid/pixel) } /*' },
    { pageColor: 'url(https://example.invalid/pixel)' },
    { pageColor: 'rgb(0,0,0);background:red' },
    { border: { color: 'red; background: url(https://example.invalid/pixel)' } },
    { border: { style: 'solid; } body { display:none } /*' } },
    { border: { width: '1; } body { display:none } /*' } },
    { columns: { gap: '0; } body { display:none } /*' } },
    { columns: { count: '2' } },
    { columns: { count: 1.5 } },
    { columns: { count: 101 } },
    { columns: { gap: -1 } },
    { columns: { line: 'false' } },
    { margins: { top: Number.NaN } },
    { margins: { left: Number.POSITIVE_INFINITY } },
    { margins: { bottom: 1e20 } },
    { margins: { right: -1 } },
    { border: { width: 97 } },
    { size: '__proto__' },
    { size: 'unknown' },
    { orientation: 'portrait; } body { display:none }' },
    { lineNumbers: {} },
    { hyphenation: 'false' },
    { margins: [] },
    { columns: null },
    { border: 'solid' },
    false, [], 'letter',
  ];

  it.each(invalid)('rejects unsafe settings through completion, native open, and snapshot creation: %j', (pageSetup) => {
    expect(() => completePageSetup(pageSetup)).toThrow('Invalid document settings');
    expect(() => parseOfficewriteFile({ content, pageSetup })).toThrow('Invalid document settings');
    expect(() => createDocumentEnvelope(content, { pageSetup: pageSetup as never })).toThrow('Invalid document settings');
  });

  it('returns independent nested settings instead of retaining file or default objects', () => {
    const original = { margins: { top: 12 }, columns: { count: 2 }, border: { color: 'red' } };
    const settings = completePageSetup(original);
    original.margins.top = 900;
    settings.columns.count = 4;
    settings.border.color = 'blue';
    expect(settings.margins.top).toBe(12);
    expect(DEFAULT_PAGE_SETUP.columns.count).toBe(1);
    expect(original.border.color).toBe('red');
  });
});

describe('header and footer compatibility', () => {
  it('preserves old centred text and fills missing zones', () => {
    const legacy = completeHeaderFooter({ header: 'Old header', footer: 'Old footer' });
    expect(headerZonesOf(legacy)).toEqual({ left: '', center: 'Old header', right: '' });
    expect(footerZonesOf(legacy)).toEqual({ left: '', center: 'Old footer', right: '' });
    expect(completeHeaderFooter({ headerZones: { left: 'Title' }, footerZones: { right: '%p of %P' } }))
      .toMatchObject({ headerZones: { left: 'Title', center: '', right: '' }, footerZones: { left: '', center: '', right: '%p of %P' } });
  });

  it.each([{ header: 42 }, { footerZones: [] }, { headerZones: { center: {} } }, { showPageNumbers: 'yes' }, { differentFirstPage: 1 }])
    ('rejects malformed header/footer state in the envelope factory: %j', (headerFooter) => {
      expect(() => createDocumentEnvelope(content, { headerFooter: headerFooter as never })).toThrow('Invalid document settings');
    });
});
