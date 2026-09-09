import type { CSSProperties, ReactNode } from 'react';
import type { Template } from '@officewrite/core';

type PreviewNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: readonly PreviewNode[];
};

const em = (pixels: unknown) => `${Number(pixels) / (11 * 4 / 3)}em`;

/** Use the formatting in the document itself, including empty shaded paragraphs. */
function paragraphStyle(node: PreviewNode): CSSProperties {
  const attrs = node.attrs ?? {};
  const style: CSSProperties = {};
  if (['left', 'center', 'right', 'justify'].includes(String(attrs.textAlign))) style.textAlign = attrs.textAlign as CSSProperties['textAlign'];
  if (attrs.spaceBefore != null) style.marginTop = em(attrs.spaceBefore);
  if (attrs.spaceAfter != null) style.marginBottom = em(attrs.spaceAfter);
  if (attrs.lineHeight) style.lineHeight = String(attrs.lineHeight);
  if (attrs.shading) { style.backgroundColor = String(attrs.shading); style.paddingBlock = '0.3em'; }
  if (attrs.borderColor) {
    const border = `0.16em solid ${String(attrs.borderColor)}`;
    const side = attrs.borderSides ?? 'left';
    if (side === 'bottom') style.borderBottom = border;
    else if (side === 'top') style.borderTop = border;
    else if (side === 'all' || side === 'outside') style.border = border;
    else style.borderLeft = border;
    style.paddingLeft = '0.6em';
  }
  if (attrs.indentLevel) style.marginLeft = em(Number(attrs.indentLevel) * 36);
  return style;
}

function renderInline(nodes: readonly PreviewNode[] | undefined): ReactNode[] {
  return (nodes ?? []).map((node, index) => {
    if (node.type === 'hardBreak') return <br key={index} />;
    if (!node.text) return null;
    const style: CSSProperties = {};
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') style.fontWeight = 700;
      if (mark.type === 'italic') style.fontStyle = 'italic';
      if (mark.type === 'underline') style.textDecoration = 'underline';
      if (mark.type === 'textStyle') {
        if (mark.attrs?.fontFamily) style.fontFamily = String(mark.attrs.fontFamily);
        if (mark.attrs?.fontSize) style.fontSize = `${parseFloat(String(mark.attrs.fontSize)) / 11}em`;
        if (mark.attrs?.color) style.color = String(mark.attrs.color);
      }
    }
    return <span key={index} style={style}>{node.text}</span>;
  });
}

function renderBlock(node: PreviewNode, key: number): ReactNode {
  if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList') {
    return <div key={key} className="tp-list">
      {(node.content ?? []).map((item, index) => <div className="tp-li" key={index}>
        <span className="tp-marker" aria-hidden>{node.type === 'orderedList' ? `${index + Number(node.attrs?.start ?? 1)}.` : node.type === 'taskList' ? item.attrs?.checked ? '☑' : '☐' : '•'}</span>
        <div className="tp-li-text">{item.content?.map(renderBlock)}</div>
      </div>)}
    </div>;
  }
  if (node.type === 'table') {
    const widths = node.content?.[0]?.content?.map(cell => Number((cell.attrs?.colwidth as number[] | undefined)?.[0] ?? 1)) ?? [];
    const total = widths.reduce((sum, width) => sum + width, 0);
    return <table key={key} className="tp-table">
      {total > 0 && <colgroup>{widths.map((width, index) => <col key={index} style={{ width: `${100 * width / total}%` }} />)}</colgroup>}
      <tbody>{node.content?.map((row, rowIndex) => <tr key={rowIndex}>
        {row.content?.map((cell, cellIndex) => {
          const Cell = cell.type === 'tableHeader' ? 'th' : 'td';
          return <Cell key={cellIndex} colSpan={Number(cell.attrs?.colspan ?? 1)} rowSpan={Number(cell.attrs?.rowspan ?? 1)} style={{ backgroundColor: cell.attrs?.shading ? String(cell.attrs.shading) : undefined }}>
            {cell.content?.map(renderBlock)}
          </Cell>;
        })}
      </tr>)}</tbody>
    </table>;
  }
  if (node.type === 'horizontalRule') return <div key={key} className="tp-rule" />;
  const heading = node.type === 'heading';
  return <div key={key} className={heading ? `tp-h tp-h${node.attrs?.level ?? 1}` : `tp-p${node.attrs?.styleId === 'subtitle' ? ' tp-subtitle' : ''}`} style={paragraphStyle(node)}>
    {node.content?.length ? renderInline(node.content) : <br />}
  </div>;
}

export function TemplatePreview({ template, variant = 'thumb' }: { template: Template; variant?: 'thumb' | 'page' }) {
  const pages: PreviewNode[][] = [[]];
  for (const node of template.content.content as PreviewNode[]) {
    if (node.type === 'pageBreak') pages.push([]);
    else pages[pages.length - 1].push(node);
  }
  const firstPage = pages[0];
  if (template.id === 'blank') return <div className={`tp-page tp-${variant} tp-blank`} data-testid={`template-preview-${template.id}`}><span className="tp-blank-label">Blank page</span></div>;
  if (variant === 'thumb') return <div className="tp-page tp-thumb" data-testid={`template-preview-${template.id}`} aria-hidden="true">
    {firstPage.slice(0, 14).map(renderBlock)}
    <div className="tp-more" />
  </div>;
  return <div className="tp-document" data-testid={`template-preview-${template.id}`}>
    {pages.map((page, index) => <section className="tp-preview-sheet" key={index} aria-label={`Template page ${index + 1}`}>
      {pages.length > 1 && <div className="tp-page-label">Page {index + 1} of {pages.length}</div>}
      <div className="tp-page tp-full">{page.map(renderBlock)}</div>
    </section>)}
  </div>;
}
