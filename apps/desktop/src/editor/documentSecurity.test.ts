import { afterEach, describe, expect, it } from 'vitest';
import { mergeAttributes, type Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import { inertDocumentHtml } from '@officewrite/openxml';
import { createTestEditor } from './testEditor';

let editor: Editor | undefined;
afterEach(() => { editor?.destroy(); editor = undefined; });

describe('document resource boundaries', () => {
  it.each(['textAlign', 'lineHeight', 'spaceBefore', 'spaceAfter', 'borderColor', 'shading'])('keeps native paragraph %s from adding CSS declarations', attribute => {
    editor = createTestEditor({ type: 'doc', content: [{ type: 'paragraph', attrs: {
      [attribute]: '1;position:fixed;inset:0;z-index:2147483647;--injected:yes',
    }, content: [{ type: 'text', text: 'Safe text' }] }] });
    const fragment = DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.doc.content);
    const paragraph = fragment.querySelector('p')!;
    expect(paragraph.style.position).toBe('');
    expect(paragraph.style.getPropertyValue('--injected')).toBe('');
    expect(paragraph.textContent).toBe('Safe text');
  });

  it.each(['fontFamily', 'fontSize', 'color'])('keeps native text %s from adding CSS declarations', attribute => {
    editor = createTestEditor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Safe text', marks: [{ type: 'textStyle', attrs: {
      [attribute]: 'red;position:fixed;inset:0;--injected:yes',
    } }] }] }] });
    expect(editor.getHTML()).not.toMatch(/position:|--injected/);
    expect(editor.getText()).toBe('Safe text');
  });

  it('guards highlight, cell, row, image and text-box formatting in clipboard output', () => {
    const injected = '20;position:fixed;--injected:yes';
    const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Safe', marks: [{ type: 'highlight', attrs: { color: injected } }] }] };
    editor = createTestEditor({ type: 'doc', content: [
      { type: 'table', content: [{ type: 'tableRow', attrs: { height: injected }, content: [{ type: 'tableCell', attrs: { shading: injected }, content: [paragraph] }] }] },
      { type: 'image', attrs: { src: 'data:image/png;base64,AAA', width: injected } },
      { type: 'textBox', attrs: { fill: injected, borderColor: injected }, content: [paragraph] },
    ] });
    const fragment = DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.doc.content);
    for (const element of fragment.querySelectorAll<HTMLElement>('[style]')) {
      expect(element.style.position).toBe('');
      expect(element.style.getPropertyValue('--injected')).toBe('');
    }
  });

  it('preserves ordinary paragraph and character formatting', () => {
    editor = createTestEditor({ type: 'doc', content: [{ type: 'paragraph', attrs: {
      textAlign: 'center', lineHeight: '1.5', spaceBefore: 12, firstLineIndent: -24, borderColor: '#123456', borderSides: 'all', shading: '#eeeeee',
    }, content: [{ type: 'text', text: 'Formatted', marks: [{ type: 'textStyle', attrs: { fontFamily: 'Times New Roman', fontSize: '14pt', color: '#123456' } }, { type: 'highlight', attrs: { color: '#ffff00' } }] }] }] });
    const fragment = DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.doc.content);
    expect(fragment.querySelector('p')!.style.lineHeight).toBe('1.5');
    expect(fragment.querySelector('p')!.style.textAlign).toBe('center');
    expect(fragment.querySelector('p')!.style.textIndent).toBe('-24px');
    expect(fragment.querySelector('span')!.style.fontSize).toBe('14pt');
    expect(fragment.querySelector('mark')!.style.backgroundColor).toBe('rgb(255, 255, 0)');
    editor.commands.updateAttributes('paragraph', { lineHeight: 'normal' });
    expect(editor.getHTML()).toContain('line-height: normal');
  });

  it.each(['https://tracking.invalid/a', '//tracking.invalid/a', '/tracking', 'file:///secret.png', 'data:text/html,<script>alert(1)</script>'])('never serializes %s as a loading image', (src) => {
    editor = createTestEditor({ type: 'doc', content: [{ type: 'image', attrs: { src, alt: 'Diagram', width: 200 } }] });
    const html = editor.getHTML();
    const template = document.createElement('template');
    template.innerHTML = html;
    expect(template.content.querySelector('img')).toBeNull();
    expect(template.content.querySelector('[data-blocked-image]')?.getAttribute('data-blocked-image')).toBe(src);
    const fragment = DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.doc.content);
    expect(fragment.querySelector('img')).toBeNull();
  });

  it('keeps embedded pictures and formatting through clipboard HTML', () => {
    editor = createTestEditor();
    editor.commands.insertContent(inertDocumentHtml('<p><b>Bold</b></p><img src="data:image/png;base64,AAA" width="200" alt="Picture">').innerHTML);
    expect(editor.getHTML()).toContain('<strong>Bold</strong>');
    expect(editor.getHTML()).toContain('src="data:image/png;base64,AAA"');
    expect(editor.getHTML()).toContain('width="200"');
  });

  it('turns external clipboard images and srcsets into inert placeholders before parsing', () => {
    const html = inertDocumentHtml('<img src="https://tracking.invalid/a" srcset="https://tracking.invalid/b 2x" onerror="alert(1)"><iframe src="https://tracking.invalid/frame"></iframe>').innerHTML;
    editor = createTestEditor();
    editor.commands.insertContent(html);
    expect(editor.getHTML()).not.toMatch(/<img|<iframe|srcset=|onerror=/);
    expect(editor.getHTML()).toContain('data-blocked-image="https://tracking.invalid/a"');
  });

  it('keeps JSON-origin prototype attributes from becoming executable DOM attributes', () => {
    const untrusted = JSON.parse('{"__proto__":{"src":"https://tracking.invalid/a","onerror":"alert(1)"}}');
    const attrs = mergeAttributes({ class: 'picture' }, untrusted, { title: 'Safe' });
    expect(Object.getPrototypeOf(attrs)).toBe(Object.prototype);
    expect(attrs.onerror).toBeUndefined();
    const dom = DOMSerializer.renderSpec(document, ['img', attrs]).dom as Element;
    expect(dom.hasAttribute('src')).toBe(false);
    expect(dom.hasAttribute('onerror')).toBe(false);
    expect(dom.getAttribute('title')).toBe('Safe');
  });
});
