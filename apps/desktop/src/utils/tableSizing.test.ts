import { afterEach, describe, expect, it } from 'vitest';
import { CellSelection } from '@tiptap/pm/tables';
import { createTestEditor } from '../editor/testEditor';
import { canSortTable, clearWidths, selectTablePart, setColumnWidth, setRowHeight, sortTableRows } from './tableSizing';

describe('table editing', () => {
  const editors: ReturnType<typeof createTestEditor>[] = [];
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));
  const make = (html: string) => {
    const editor = createTestEditor();
    editor.commands.setContent(html);
    editors.push(editor);
    return editor;
  };
  const cells = (editor: ReturnType<typeof createTestEditor>) => {
    const result: number[] = [];
    editor.state.doc.descendants((node, pos) => { if (['tableCell', 'tableHeader'].includes(node.type.name)) result.push(pos); });
    return result;
  };

  it('resizes a logical column through merged cells without corrupting their widths', () => {
    const editor = make('<table><tr><td colspan="2" colwidth="100,120">Merged</td><td>Third</td></tr><tr><td>A</td><td>B</td><td>C</td></tr></table>');
    const positions = cells(editor);
    editor.commands.setTextSelection(positions[3] + 2);
    setColumnWidth(editor, 160);
    expect(editor.state.doc.nodeAt(positions[0])?.attrs.colwidth).toEqual([100, 160]);
    expect(editor.state.doc.nodeAt(positions[3])?.attrs.colwidth).toEqual([160]);
    expect(editor.state.doc.nodeAt(positions[2])?.attrs.colwidth).toEqual([100]);
  });

  it('sets the actual selected row when the first column spans multiple rows', () => {
    const editor = make('<table><tr><td rowspan="2">Span</td><td>A</td></tr><tr><td>B</td></tr></table>');
    editor.commands.setTextSelection(cells(editor)[2] + 2);
    setRowHeight(editor, 80);
    expect(editor.state.doc.firstChild?.child(0).attrs.height).toBeNull();
    expect(editor.state.doc.firstChild?.child(1).attrs.height).toBe(80);
  });

  it('selects a real cell and shades mixed header/body selections', () => {
    const editor = make('<table><tr><th>Header</th></tr><tr><td>Body</td></tr></table>');
    const positions = cells(editor);
    editor.commands.setTextSelection(positions[1] + 2);
    selectTablePart(editor, 'cell');
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    selectTablePart(editor, 'table');
    editor.commands.setCellShading('#ffcc00');
    for (const pos of positions) expect(editor.state.doc.nodeAt(pos)?.attrs.shading).toBe('#ffcc00');
  });

  it('sorts intact rows numerically by the active column without moving the header or surrounding paragraphs', () => {
    const editor = make('<p>Before</p><table><tr><th>Name</th><th>Count</th></tr><tr><td>Ten</td><td>10</td></tr><tr><td>Two</td><td>2</td></tr></table><p>After</p>');
    editor.commands.setTextSelection(cells(editor)[3] + 2);
    expect(sortTableRows(editor, 'asc')).toBe(true);
    const table = editor.state.doc.child(1);
    expect(table.child(0).textContent).toBe('NameCount');
    expect(table.child(1).textContent).toBe('Two2');
    expect(table.child(2).textContent).toBe('Ten10');
    expect(editor.state.doc.firstChild?.textContent).toBe('Before');
    expect(editor.state.doc.lastChild?.textContent).toBe('After');
  });

  it('refuses to sort merged rows and resets explicit widths to content layout', () => {
    const editor = make('<table><tr><td colspan="2" colwidth="80,100">Merged</td></tr><tr><td>A</td><td>B</td></tr></table>');
    editor.commands.setTextSelection(cells(editor)[0] + 2);
    expect(canSortTable(editor)).toBe(false);
    clearWidths(editor);
    expect(editor.state.doc.firstChild?.attrs.tableLayout).toBe('auto');
    expect(editor.state.doc.nodeAt(cells(editor)[0])?.attrs.colwidth).toBeNull();
  });
});
