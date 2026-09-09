import { afterEach, describe, expect, it } from 'vitest';
import type { Editor, JSONContent } from '@tiptap/core';
import { TEMPLATES } from '@officewrite/core';
import { exportToDocx, importFromDocx } from '@officewrite/openxml';
import { createTestEditor } from '../editor/testEditor';

const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); });

function nodesOf(node: JSONContent, type: string): JSONContent[] {
  return [...(node.type === type ? [node] : []), ...(node.content ?? []).flatMap(child => nodesOf(child, type))];
}

function textOf(node: JSONContent): string {
  return node.text ?? (node.content ?? []).map(textOf).join('');
}

function comparable(attrs: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key,
    typeof value === 'string' && value.startsWith('#') ? value.toLowerCase() : value,
  ]));
}

describe('styled templates through the production schema and DOCX', () => {
  it('renders zero spacing and preserves the selected border side through editor HTML', () => {
    const editor = createTestEditor({ type: 'doc', content: [{
      type: 'paragraph', attrs: { spaceBefore: 0, spaceAfter: 0, borderSides: 'bottom', borderColor: '#24536c' },
      content: [{ type: 'text', text: 'Section rule' }],
    }] });
    editors.push(editor);
    const paragraph = new DOMParser().parseFromString(editor.getHTML(), 'text/html').querySelector('p')!;
    expect(paragraph.style.marginTop).toBe('0px');
    expect(paragraph.style.marginBottom).toBe('0px');
    expect(paragraph.style.borderBottomColor).toBe('rgb(36, 83, 108)');
    editor.commands.setContent(editor.getHTML());
    expect(editor.getJSON().content?.[0].attrs).toMatchObject({ spaceBefore: 0, spaceAfter: 0, borderSides: 'bottom' });
  });

  it.each(['report', 'invoice', 'projectbrief', 'creativebrief'])(
    'retains the typography, paragraph rules and table fills in %s', async (id) => {
      const template = TEMPLATES.find(entry => entry.id === id)!;
      expect(template, id).toBeDefined();
      const editor = createTestEditor(template.content);
      editors.push(editor);
      const loaded = editor.getJSON();
      expect(textOf(loaded)).toBe(textOf(template.content));
      for (const heading of nodesOf(template.content, 'heading')) {
        const actual = nodesOf(loaded, 'heading').find(node => textOf(node) === textOf(heading));
        expect(actual?.attrs, textOf(heading)).toMatchObject(heading.attrs ?? {});
        const expectedStyle = nodesOf(heading, 'text')[0]?.marks?.find(mark => mark.type === 'textStyle')?.attrs;
        const actualStyle = nodesOf(actual!, 'text')[0]?.marks?.find(mark => mark.type === 'textStyle')?.attrs;
        expect(actualStyle, textOf(heading)).toMatchObject(expectedStyle ?? {});
      }

      const exported = await exportToDocx(loaded, { title: template.name });
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(exported);
      });
      const imported = await importFromDocx(bytes);
      const reopened = createTestEditor(imported.content);
      editors.push(reopened);
      const restored = reopened.getJSON();
      expect(textOf(restored)).toBe(textOf(loaded));

      for (const heading of nodesOf(loaded, 'heading')) {
        const restoredHeading = nodesOf(restored, 'heading').find(node => textOf(node) === textOf(heading));
        expect(restoredHeading, textOf(heading)).toBeDefined();
        const attrs = heading.attrs ?? {};
        const expected = Object.fromEntries(['level', 'spaceBefore', 'spaceAfter', 'lineHeight', 'borderSides', 'borderColor']
          .filter(key => attrs[key] != null).map(key => [key, attrs[key]]));
        expect(comparable(restoredHeading!.attrs ?? {}), textOf(heading)).toMatchObject(comparable(expected));
        const originalStyle = nodesOf(heading, 'text')[0]?.marks?.find(mark => mark.type === 'textStyle')?.attrs;
        const restoredStyle = nodesOf(restoredHeading!, 'text')[0]?.marks?.find(mark => mark.type === 'textStyle')?.attrs;
        expect(comparable(restoredStyle ?? {}), textOf(heading)).toMatchObject(comparable(originalStyle ?? {}));
      }

      const originals = [...nodesOf(loaded, 'tableHeader'), ...nodesOf(loaded, 'tableCell')];
      const restoredCells = [...nodesOf(restored, 'tableHeader'), ...nodesOf(restored, 'tableCell')];
      expect(restoredCells).toHaveLength(originals.length);
      originals.forEach((cell, index) => {
        const actual = restoredCells[index];
        expect(textOf(actual)).toBe(textOf(cell));
        expect(actual.attrs?.colwidth).toEqual(cell.attrs?.colwidth);
        expect(String(actual.attrs?.shading).toLowerCase()).toBe(String(cell.attrs?.shading).toLowerCase());
      });

      const firstParagraph = nodesOf(loaded, 'paragraph').find(node => node.attrs?.spaceBefore === 0);
      expect(firstParagraph).toBeDefined();
      const matchingParagraph = nodesOf(restored, 'paragraph').find(node => textOf(node) === textOf(firstParagraph!));
      expect(matchingParagraph?.attrs?.spaceBefore).toBe(0);
    },
  );
});
