// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { exportToHtml } from './html';
import { importFromHtml } from './htmlImport';

const text = { type: 'text', text: 'Keep this text' };
const parse = (content: unknown) => new DOMParser().parseFromString(exportToHtml(content), 'text/html');

describe('HTML export security', () => {
  it.each(['fontFamily', 'fontSize', 'color'])('contains markup in %s without creating executable elements', (property) => {
    const doc = parse({ type: 'doc', content: [{ type: 'paragraph', content: [{ ...text, marks: [{ type: 'textStyle', attrs: { [property]: '\"><img src=x onerror=alert(1)><script>alert(1)</script>' } }] }] }] });
    expect(doc.querySelector('script, [onerror], img')).toBeNull();
    expect(doc.body.textContent).toContain(text.text);
  });

  it('rejects CSS declarations through every style field and alignment', () => {
    const payload = 'red;background-image:url(https://tracking.invalid/pixel)';
    const doc = parse({ type: 'doc', content: [
      { type: 'paragraph', attrs: { textAlign: payload, lineHeight: payload, borderColor: payload, shading: payload }, content: [{ ...text, marks: [
        { type: 'textStyle', attrs: { fontFamily: payload, fontSize: payload, color: payload } },
        { type: 'highlight', attrs: { color: payload } },
      ] }] },
      { type: 'image', attrs: { src: 'data:image/png;base64,AAA', align: payload } },
      { type: 'docShape', attrs: { fill: payload, width: payload } },
    ] });
    expect(doc.body.innerHTML).not.toContain('tracking.invalid');
    expect(doc.querySelector('[onerror]')).toBeNull();
    for (const el of doc.querySelectorAll<HTMLElement>('[style]')) expect(el.style.backgroundImage).toBe('');
  });

  it.each(['javascript:alert(1)', '  JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///secret'])('does not create executable or local link %s', (href) => {
    const doc = parse({ type: 'doc', content: [{ type: 'paragraph', content: [{ ...text, marks: [{ type: 'link', attrs: { href } }] }] }] });
    expect(doc.querySelector('a')).toBeNull();
    expect(doc.body.textContent).toContain(text.text);
  });

  it('keeps normal fonts, quoted font lists, colors, spacing and hyperlinks', () => {
    const doc = parse({ type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'center', lineHeight: '1.5', spaceAfter: 12, shading: '#eeeeee' }, content: [{ ...text, marks: [
      { type: 'textStyle', attrs: { fontFamily: '"Times New Roman", serif', fontSize: '12pt', color: 'rgb(1, 2, 3)' } },
      { type: 'link', attrs: { href: 'https://example.com/?a=1&b=2' } },
    ] }] }] });
    expect(doc.querySelector('span')?.style.fontFamily).toContain('Times New Roman');
    expect(doc.querySelector('span')?.style.fontSize).toBe('12pt');
    expect(doc.querySelector('p')?.style.textAlign).toBe('center');
    expect(doc.querySelector('p')?.style.marginBottom).toBe('12px');
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.com/?a=1&b=2');
  });

  it('retains a blocked picture as inert data through HTML export and reimport', () => {
    const source = { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://tracking.invalid/a', alt: 'Diagram' } }] };
    const html = exportToHtml(source);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelector('[data-blocked-image]')?.getAttribute('data-blocked-image')).toBe('https://tracking.invalid/a');
    expect(JSON.stringify(importFromHtml(html))).toContain('https://tracking.invalid/a');
  });

  it('imports body content without title, scripts or resource elements', () => {
    const imported = importFromHtml('<!doctype html><html><head><title>Hidden title</title><style>body { color:red }</style></head><body><p>Body</p><iframe src="https://tracking.invalid/frame"></iframe></body></html>');
    expect(JSON.stringify(imported)).toContain('Body');
    expect(JSON.stringify(imported)).not.toMatch(/Hidden title|tracking.invalid|body \{/);
  });
});
