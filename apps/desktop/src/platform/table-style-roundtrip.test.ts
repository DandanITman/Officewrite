import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import { exportToDocx, importFromDocx } from '@officewrite/openxml';
import { createTestEditor } from '../editor/testEditor';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
const bytesOf = (blob: Blob) => new Promise<ArrayBuffer>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as ArrayBuffer);
  reader.onerror = () => reject(reader.error);
  reader.readAsArrayBuffer(blob);
});

describe('table styles after DOCX reopening', () => {
  it('preserves manual shading pasted from HTML', async () => {
    const original = createTestEditor();
    original.commands.setContent('<table><tr><td style="background-color: #e8eff8">Pasted colour</td></tr></table>');
    editors.push(original);
    expect(original.state.doc.firstChild!.child(0).child(0).attrs.shading).toBe('rgb(232, 239, 248)');
    const imported = await importFromDocx(await bytesOf(await exportToDocx(original.getJSON())));
    const reopened = createTestEditor(imported.content);
    editors.push(reopened);
    expect(reopened.state.doc.firstChild!.child(0).child(0).attrs.shading).toBe('#E8EFF8');
  });

  it.each(['bandedRows', 'bandedColumns', 'gridAccent', 'listAccent'])(
    'can replace %s without retaining its generated fills or losing manual shading', async (style) => {
      const original = createTestEditor();
      original.commands.setContent('<table><tr><th>Header</th><th>Count</th></tr><tr><td>Automatic</td><td>Manual blue</td></tr></table>');
      editors.push(original);
      let manualCell = 0;
      original.state.doc.descendants((node, pos) => { if (node.type.name === 'tableCell' && node.textContent === 'Manual blue') manualCell = pos; });
      original.commands.setTextSelection(manualCell + 2);
      original.commands.setCellShading('#e8eff8');
      original.commands.setTextSelection(3);
      original.commands.setTableStyle(style);
      const imported = await importFromDocx(await bytesOf(await exportToDocx(original.getJSON())));
      const reopened = createTestEditor(imported.content);
      editors.push(reopened);
      const table = reopened.state.doc.firstChild!;
      expect(table.attrs.tableStyle).toBe(style);
      expect(table.child(0).child(0).attrs.shading).toBeNull();
      expect(table.child(1).child(0).attrs.shading).toBeNull();
      expect(table.child(1).child(1).attrs.shading.toLowerCase()).toBe('#e8eff8');

      reopened.commands.setTextSelection(3);
      expect(reopened.commands.setTableStyle('grid')).toBe(true);
      const html = new DOMParser().parseFromString(reopened.getHTML(), 'text/html');
      expect(html.querySelector('table')?.dataset.tableStyle).toBe('grid');
      expect(html.querySelectorAll('td')[0].style.backgroundColor).toBe('');
      expect(html.querySelectorAll('td')[1].style.backgroundColor).toBe('rgb(232, 239, 248)');
      const savedAgain = await importFromDocx(await bytesOf(await exportToDocx(reopened.getJSON())));
      const again = createTestEditor(savedAgain.content);
      editors.push(again);
      expect(again.state.doc.firstChild!.child(1).child(0).attrs.shading).toBeNull();
      expect(again.state.doc.firstChild!.child(1).child(1).attrs.shading.toLowerCase()).toBe('#e8eff8');
    },
  );
});
