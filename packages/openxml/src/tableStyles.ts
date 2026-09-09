import { ImportedXmlComponent } from 'docx';

/** Word style identifiers paired with the table gallery. */
export const TABLE_STYLE_IDS: Record<string, string> = {
  grid: 'TableGrid',
  plain: 'LightShading',
  listAccent: 'LightList-Accent1',
  gridAccent: 'LightGrid-Accent1',
  bandedRows: 'LightShading-Accent1',
  bandedColumns: 'LightShading-Accent2',
  borderless: 'TableNormal',
};

// Word starts banding after its header row; a table without a header needs the
// opposite band to match the editor's even-row shading.
export const BANDED_ROWS_WITHOUT_HEADER = 'OfficewriteBandedRowsWithoutHeader';

/** Standard conditional formatting keeps style fills separate from manual cell shading. */
export function tableStyleDefinitions(): ImportedXmlComponent[] {
  const element = (name: string, attrs: Record<string, string> = {}, children: ImportedXmlComponent[] = []) => {
    const node = new ImportedXmlComponent(name, attrs);
    children.forEach(child => node.push(child));
    return node;
  };
  const conditional = (region: string, fill: string) => element('w:tblStylePr', { 'w:type': region }, [
    element('w:tcPr', {}, [element('w:shd', { 'w:val': 'clear', 'w:fill': fill })]),
  ]);
  return [...Object.entries(TABLE_STYLE_IDS), ['bandedRowsNoHeader', BANDED_ROWS_WITHOUT_HEADER]].map(([style, id]) => {
    const header = ['listAccent', 'gridAccent'].includes(style) ? 'D8E7F8' : 'auto';
    const band = style === 'bandedRows' ? [conditional('band1Horz', 'E8EFF8')]
      : style === 'bandedRowsNoHeader' ? [conditional('band2Horz', 'E8EFF8')]
        : style === 'bandedColumns' ? [conditional('band2Vert', 'E8EFF8')] : [];
    return element('w:style', { 'w:type': 'table', 'w:styleId': id }, [
      element('w:name', { 'w:val': id }),
      element('w:tblPr', {}, [element('w:tblStyleRowBandSize', { 'w:val': '1' }), element('w:tblStyleColBandSize', { 'w:val': '1' })]),
      ...band,
      ...(style === 'borderless' ? [] : [conditional('firstRow', header)]),
    ]);
  });
}
