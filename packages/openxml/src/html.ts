import { isEmbeddedImageSource, mergeFieldLabel, safeCssColor, safeCssLength as cssLength, safeFontFamily, safeTextAlignment as alignment, safeExportHref, type MergeFieldAttrs } from '@officewrite/core';

type TipTapNode = {
  type?: string;
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
};

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function styleAttribute(styles: string[]): string {
  return styles.length ? ` style="${escapeHtml(styles.join(';'))}"` : '';
}

function finiteNumber(value: unknown, fallback: number, max = 10000): number {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= max ? number : fallback;
}

function wrapMarks(text: string, marks: TipTapNode['marks']): string {
  let result = escapeHtml(text);
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        result = `<strong>${result}</strong>`;
        break;
      case 'italic':
        result = `<em>${result}</em>`;
        break;
      case 'underline':
        result = `<u>${result}</u>`;
        break;
      case 'strike':
        result = `<s>${result}</s>`;
        break;
      case 'link': {
        const href = safeExportHref(mark.attrs?.href);
        if (href) result = `<a href="${escapeHtml(href)}">${result}</a>`;
        break;
      }
      case 'highlight': {
        const color = safeCssColor(mark.attrs?.color) ?? '#fef08a';
        result = `<mark style="background:${escapeHtml(color)}">${result}</mark>`;
        break;
      }
      case 'superscript':
        result = `<sup>${result}</sup>`;
        break;
      case 'subscript':
        result = `<sub>${result}</sub>`;
        break;
      case 'textStyle': {
        const styles: string[] = [];
        const family = safeFontFamily(mark.attrs?.fontFamily);
        if (family) styles.push(`font-family:${family}`);
        const size = cssLength(mark.attrs?.fontSize);
        const color = safeCssColor(mark.attrs?.color);
        if (size) styles.push(`font-size:${size}`);
        if (color) styles.push(`color:${color}`);
        if (styles.length) result = `<span${styleAttribute(styles)}>${result}</span>`;
        break;
      }
      case 'commentAnchor':
        result = `<span data-comment-id="${escapeHtml(String(mark.attrs?.commentId ?? ''))}" class="comment-anchor">${result}</span>`;
        break;
      case 'footnoteRef':
        result = `<sup class="footnote-ref" data-footnote-id="${escapeHtml(String(mark.attrs?.id ?? ''))}">${escapeHtml(String(mark.attrs?.number ?? ''))}</sup>`;
        break;
    }
  }
  return result;
}

function inlineFromNode(node: TipTapNode): string {
  if (node.type === 'text' && node.text) {
    for (const mark of node.marks ?? []) {
      if (mark.type === 'footnoteRef') {
        return `<sup class="footnote-ref" data-footnote-id="${escapeHtml(String(mark.attrs?.id ?? ''))}">${escapeHtml(String(mark.attrs?.number ?? node.text))}</sup>`;
      }
    }
    return wrapMarks(node.text, node.marks);
  }
  if (node.type === 'hardBreak') return '<br />';
  /**
   * A merge field carries its whole configuration in a data attribute, so an
   * Officewrite-native reopen restores a real field while every other reader sees
   * the «FieldName» text. Without this the fall-through below returned an empty
   * string, since a merge field is an atom with no children.
   */
  if (node.type === 'mergeField') {
    const attrs = node.attrs as unknown as MergeFieldAttrs;
    return (
      `<span data-merge-field="${escapeHtml(String(attrs.field ?? ''))}" ` +
      `data-merge-config="${escapeHtml(JSON.stringify(attrs))}" class="doc-merge-field">` +
      `${escapeHtml(mergeFieldLabel(attrs))}</span>`
    );
  }
  return (node.content ?? []).map(inlineFromNode).join('');
}

function blockFromNode(node: TipTapNode): string {
  if (node.type === 'paragraph') {
    const align = alignment(node.attrs?.textAlign);
    const styles = paragraphStyles(node.attrs);
    if (align && align !== 'left') styles.unshift(`text-align:${align}`);
    const style = styleAttribute(styles);
    return `<p${style}>${inlineFromNode(node) || '&nbsp;'}</p>`;
  }

  if (node.type === 'heading') {
    const level = Math.min(6, Math.max(1, Math.floor(finiteNumber(node.attrs?.level, 1))));
    const styles = paragraphStyles(node.attrs);
    const style = styleAttribute(styles);
    return `<h${level}${style}>${inlineFromNode(node)}</h${level}>`;
  }

  if (node.type === 'bulletList') {
    const items = (node.content ?? [])
      .map((item) => `<li>${(item.content ?? []).map(blockFromNode).join('')}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  }

  if (node.type === 'orderedList') {
    const items = (node.content ?? [])
      .map((item) => `<li>${(item.content ?? []).map(blockFromNode).join('')}</li>`)
      .join('');
    return `<ol>${items}</ol>`;
  }

  if (node.type === 'horizontalRule') return '<hr />';

  if (node.type === 'pageBreak') return '<div class="page-break" style="page-break-after:always"></div>';

  if (node.type === 'columnBreak')
    return '<div data-column-break="true" style="break-before:column"></div>';

  if (node.type === 'tableOfContents') {
    return '<div data-table-of-contents="true" class="doc-toc"><p><em>Table of Contents</em></p></div>';
  }

  if (node.type === 'table') {
    const rows = (node.content ?? [])
      .map((row) => {
        const cells = (row.content ?? [])
          .map((cell) => {
            const tag = cell.type === 'tableHeader' ? 'th' : 'td';
            const inner = (cell.content ?? []).map(blockFromNode).join('');
            return `<${tag}>${inner}</${tag}>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    return `<table border="1" cellpadding="6" cellspacing="0">${rows}</table>`;
  }

  if (node.type === 'image') {
    const source = node.attrs?.src;
    const alt = escapeHtml(String(node.attrs?.alt ?? ''));
    if (!isEmbeddedImageSource(source)) {
      return `<span data-blocked-image="${escapeHtml(String(source ?? ''))}">[Picture blocked${alt ? `: ${alt}` : ''}]</span>`;
    }
    const widthValue = finiteNumber(node.attrs?.width, 0);
    const width = widthValue ? ` width="${widthValue}"` : '';
    const align = alignment(node.attrs?.align);
    const styles = align && ['left', 'center', 'right'].includes(align)
      ? [`float:${align === 'center' ? 'none' : align}`, 'display:block', `margin:${align === 'center' ? '0 auto' : '0'}`] : [];
    return `<img src="${escapeHtml(source)}" alt="${alt}"${width}${styleAttribute(styles)} />`;
  }

  if (node.type === 'docShape') {
    const w = finiteNumber(node.attrs?.width, 160);
    const h = finiteNumber(node.attrs?.height, 100);
    const fill = safeCssColor(node.attrs?.fill) ?? '#3b82f6';
    return `<div class="doc-shape" style="width:${w}px;height:${h}px;background:${fill};display:inline-block;border:1px solid #1e40af;"></div>`;
  }

  if (node.content) {
    return node.content.map(blockFromNode).join('');
  }

  return '';
}

function paragraphStyles(attrs: TipTapNode['attrs']) {
  const styles: string[] = [];
  if (!attrs) return styles;
  const indentLevel = finiteNumber(attrs.indentLevel, 0, 100);
  if (indentLevel > 0) styles.push(`margin-left:${indentLevel * 36}px`);
  const lineHeight = attrs.lineHeight === 'normal' ? 'normal' : cssLength(attrs.lineHeight, true);
  if (lineHeight) styles.push(`line-height:${lineHeight}`);
  if (attrs.spaceBefore) styles.push(`margin-top:${finiteNumber(attrs.spaceBefore, 0)}px`);
  if (attrs.spaceAfter) styles.push(`margin-bottom:${finiteNumber(attrs.spaceAfter, 0)}px`);
  const borderColor = safeCssColor(attrs.borderColor);
  const shading = safeCssColor(attrs.shading);
  if (borderColor) styles.push(`border-left:3px solid ${borderColor}`, 'padding-left:10px');
  if (shading) styles.push(`background:${shading}`, 'padding-top:2px', 'padding-bottom:2px');
  return styles;
}

export function exportToHtml(
  content: unknown,
  title = 'Document',
  metadata?: { author?: string; subject?: string },
): string {
  const doc = content as TipTapNode;
  const body = (doc.content ?? []).map(blockFromNode).join('\n');
  const metaTags = [
    metadata?.author ? `<meta name="author" content="${escapeHtml(metadata.author)}" />` : '',
    metadata?.subject ? `<meta name="description" content="${escapeHtml(metadata.subject)}" />` : '',
  ]
    .filter(Boolean)
    .join('\n  ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  ${metaTags}
  <style>
    body { font-family: Calibri, 'Segoe UI', sans-serif; font-size: 11pt; line-height: 1.5; max-width: 816px; margin: 2rem auto; padding: 0 1rem; color: #111827; }
    h1 { font-size: 24pt; } h2 { font-size: 18pt; } h3 { font-size: 14pt; }
    table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
    td, th { border: 1px solid #cbd5e1; padding: 6px 8px; }
    .comment-anchor { background: #fef9c3; border-bottom: 2px dotted #eab308; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export { importFromHtml } from "./htmlImport";
