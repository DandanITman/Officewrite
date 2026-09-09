import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportToDocx, importDocxEnvelope, type TipTapNode } from './index';
import { TABLE_STYLE_IDS, BANDED_ROWS_WITHOUT_HEADER } from './tableStyles';
import { child, children, attr, parseXml } from './ooxml/xml';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const cell = (text: string, attrs: Record<string, unknown> = {}, type = 'tableCell') => ({ type, attrs, content: [paragraph(text)] });

describe('table DOCX fidelity', () => {
  it('retains merged columns, vertical spans, row heights and canonical cell shading', async () => {
    const document = { type: 'doc', content: [{ type: 'table', content: [
      { type: 'tableRow', attrs: { height: 64 }, content: [cell('Heading', { colspan: 2, colwidth: [80, 120], shading: '#edf5f7' }, 'tableHeader')] },
      { type: 'tableRow', content: [cell('Merged rows', { rowspan: 2, colwidth: [80] }), cell('First', { colwidth: [120] })] },
      { type: 'tableRow', content: [cell('Second', { colwidth: [120] })] },
    ] }] };
    const blob = await exportToDocx(document);
    const restored = await importDocxEnvelope(await blob.arrayBuffer());
    const table = (restored.content as TipTapNode).content![0];
    expect(table.content).toHaveLength(3);
    expect(table.content![0].attrs?.height).toBe(64);
    expect(table.content![0].content![0].attrs).toMatchObject({ colspan: 2, colwidth: [80, 120], shading: '#EDF5F7' });
    expect(table.content![1].content![0].attrs?.rowspan).toBe(2);
    expect(table.content![2].content).toHaveLength(1);
    expect(JSON.stringify(table)).toContain('Second');
  });

  for (const [style, id] of Object.entries(TABLE_STYLE_IDS)) {
    it(`keeps ${style} appearance and style identity`, async () => {
      const document = { type: 'doc', content: [{ type: 'table', attrs: { tableStyle: style }, content: [
        { type: 'tableRow', content: [cell('Header', {}, 'tableHeader'), cell('Count', {}, 'tableHeader')] },
        { type: 'tableRow', content: [cell('Item'), cell('10')] },
      ] }] };
      const blob = await exportToDocx(document);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('word/document.xml')!.async('string');
      expect(xml).toContain(`w:val="${id}"`);
      const styles = parseXml(await zip.file('word/styles.xml')!.async('string')).find(node => node.name === 'w:styles');
      const definition = children(styles, 'w:style').find(node => attr(node, 'w:styleId') === id)!;
      expect(definition).toBeDefined();
      const fills = children(definition, 'w:tblStylePr').map(region => attr(child(child(region, 'w:tcPr'), 'w:shd'), 'w:fill'));
      if (style.startsWith('banded')) expect(fills).toContain('E8EFF8');
      if (['listAccent', 'gridAccent'].includes(style)) expect(fills).toContain('D8E7F8');
      expect(xml).not.toContain('<w:shd');
      if (style === 'borderless') expect(xml).toContain('w:val="nil"');
      const restored = await importDocxEnvelope(await blob.arrayBuffer());
      expect((restored.content as TipTapNode).content![0].attrs?.tableStyle).toBe(style);
    });
  }

  it('starts headerless row banding on the second row and retains its gallery identity', async () => {
    const document = { type: 'doc', content: [{ type: 'table', attrs: { tableStyle: 'bandedRows' }, content: [
      { type: 'tableRow', content: [cell('First')] }, { type: 'tableRow', content: [cell('Second')] },
    ] }] };
    const blob = await exportToDocx(document);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain(`w:val="${BANDED_ROWS_WITHOUT_HEADER}"`);
    expect(xml).toContain('w:firstRow="false"');
    const styles = parseXml(await zip.file('word/styles.xml')!.async('string')).find(node => node.name === 'w:styles');
    const definition = children(styles, 'w:style').find(node => attr(node, 'w:styleId') === BANDED_ROWS_WITHOUT_HEADER)!;
    expect(children(definition, 'w:tblStylePr').some(region => attr(region, 'w:type') === 'band2Horz')).toBe(true);
    const restored = await importDocxEnvelope(await blob.arrayBuffer());
    expect((restored.content as TipTapNode).content![0].attrs?.tableStyle).toBe('bandedRows');
  });
});
