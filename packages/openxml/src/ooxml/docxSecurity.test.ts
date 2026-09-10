import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { importDocx, type TipTapNode } from './docxImport';

async function importBody(body: string) {
  const zip = new JSZip();
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return importDocx(await zip.generateAsync({ type: 'uint8array' }));
}

function cell(span?: string, properties = '', body = '<w:p><w:r><w:t>Cell text</w:t></w:r></w:p>') {
  return `<w:tc><w:tcPr>${span === undefined ? '' : `<w:gridSpan w:val="${span}"/>`}${properties}</w:tcPr>${body}</w:tc>`;
}
const row = (cells: string) => `<w:tr>${cells}</w:tr>`;
const table = (rows: string, grid = '') => `<w:tbl>${grid}${rows}</w:tbl>`;
const width = '<w:tcW w:w="3000" w:type="dxa"/>';
const firstCell = (document: TipTapNode) => document.content![0].content![0].content![0];

describe('DOCX table resource limits', () => {
  it.each(['1000000000000', '1001', '0', '-1', '1e3', '0x20', '1.5', 'Infinity', 'NaN', ''])
    ('rejects invalid or excessive span %s with and without a width', async (span) => {
      for (const properties of ['', width]) {
        await expect(importBody(table(row(cell(span, properties))))).rejects.toThrow('Invalid DOCX: table gridSpan');
      }
    });

  it('rejects an explicitly declared gridSpan without a value', async () => {
    await expect(importBody(table(row(cell(undefined, '<w:gridSpan/>'))))).rejects.toThrow('table gridSpan');
  });

  it('checks vertical merge continuations before skipping their cell body', async () => {
    const body = table(row(cell('1', '<w:vMerge w:val="restart"/>')) + row(cell('1001', '<w:vMerge/>')));
    await expect(importBody(body)).rejects.toThrow('table gridSpan');
  });

  it('rejects mismatched vertical merge spans that would expand beyond the reserved grid', async () => {
    const body = table(row(cell('1000', '<w:vMerge w:val="restart"/>'))
      + row(cell('1', '<w:vMerge/>') + cell('999', '<w:vMerge w:val="restart"/>')));
    await expect(importBody(body)).rejects.toThrow('vertically merged cells must span the same columns');
  });

  it('checks nested tables and the sum of individually valid row spans', async () => {
    await expect(importBody(table(row(cell(undefined, '', table(row(cell('1001')))))))).rejects.toThrow('table gridSpan');
    await expect(importBody(table(row(cell('600') + cell('401'))))).rejects.toThrow('table rows');
  });

  it('bounds declared grid columns even when cells are narrow', async () => {
    const grid = `<w:tblGrid>${'<w:gridCol w:w="100"/>'.repeat(1001)}</w:tblGrid>`;
    await expect(importBody(table(row(cell()), grid))).rejects.toThrow('at most 1000 columns');
  });

  it('budgets the full rectangular grid, including shorter subsequent rows', async () => {
    const body = table(row(cell('1000')) + row(cell()).repeat(100));
    await expect(importBody(body)).rejects.toThrow('100000 logical cells');
  });

  it('shares the allocation budget across separate and nested tables', async () => {
    const half = table(row(cell('1000')).repeat(51));
    await expect(importBody(half + half)).rejects.toThrow('100000 logical cells');
    const nested = table(row(cell('1000', '', table(row(cell('1000')).repeat(100)))));
    await expect(importBody(nested)).rejects.toThrow('100000 logical cells');
  });

  it.each([undefined, '1', '  +002  '])('preserves ordinary decimal spans and missing grid fallback: %s', async (span) => {
    const result = await importBody(table(row(cell(span, width))));
    const parsed = firstCell(result.content);
    const count = span === '  +002  ' ? 2 : 1;
    expect(parsed.attrs?.colspan ?? 1).toBe(count);
    expect(parsed.attrs?.colwidth).toEqual(Array(count).fill(200 / count));
    expect(JSON.stringify(parsed)).toContain('Cell text');
  });

  it('preserves unequal declared widths and partial-grid fallback', async () => {
    const complete = '<w:tblGrid><w:gridCol w:w="1200"/><w:gridCol w:w="1800"/></w:tblGrid>';
    expect(firstCell((await importBody(table(row(cell('2', width)), complete))).content).attrs?.colwidth).toEqual([80, 120]);
    const short = '<w:tblGrid><w:gridCol w:w="1200"/></w:tblGrid>';
    expect(firstCell((await importBody(table(row(cell('2', width)), short))).content).attrs?.colwidth).toEqual([100, 100]);
  });

  it('accepts the documented row bound and resets the budget for the next import', async () => {
    const body = table(row(cell('1000', width)));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await importBody(body);
      expect(firstCell(result.content).attrs?.colwidth).toHaveLength(1000);
    }
  });
});
