import { Extension } from '@tiptap/core';
import { safeCssColor } from '@officewrite/core';
import { TableView } from '@tiptap/extension-table';
import type { Node } from '@tiptap/pm/model';

/** Resizable tables use their own DOM, so document styling must be applied here too. */
export class StyledTableView extends TableView {
  constructor(node: Node, cellMinWidth: number) {
    super(node, cellMinWidth);
    this.applyAppearance();
  }

  update(node: Node) {
    const updated = super.update(node);
    if (updated) this.applyAppearance();
    return updated;
  }

  private applyAppearance() {
    const style = TABLE_STYLES.find((entry) => entry.id === this.node.attrs.tableStyle)?.id ?? 'grid';
    this.table.className = `doc-table style-${style}`;
    this.table.dataset.tableStyle = style;
    this.table.style.tableLayout = this.node.attrs.tableLayout === 'auto' ? 'auto' : 'fixed';
    if (this.node.attrs.tableLayout === 'auto') this.table.style.width = 'auto';
  }
}

/**
 * Table Design: the table style gallery, banded rows and cell shading.
 *
 * The style is one attribute on the table node and the rest is CSS, which is
 * how the table styles behave too - changing the style must not rewrite
 * every cell.
 */

export const TABLE_STYLES = [
  { id: 'grid', label: 'Table Grid' },
  { id: 'plain', label: 'Plain Table' },
  { id: 'listAccent', label: 'List Table Accent' },
  { id: 'gridAccent', label: 'Grid Table Accent' },
  { id: 'bandedRows', label: 'Banded Rows' },
  { id: 'bandedColumns', label: 'Banded Columns' },
  { id: 'borderless', label: 'No Borders' },
] as const;

export const TableFormatting = Extension.create({
  name: 'tableFormatting',

  addGlobalAttributes() {
    return [
      {
        types: ['table'],
        attributes: {
          tableLayout: {
            default: 'fixed',
            parseHTML: (element) => element.style.tableLayout === 'auto' ? 'auto' : 'fixed',
            renderHTML: (attributes) => ({ style: `table-layout: ${attributes.tableLayout === 'auto' ? 'auto' : 'fixed'}` }),
          },
          tableStyle: {
            default: 'grid',
            parseHTML: (element) => element.getAttribute('data-table-style') ?? 'grid',
            renderHTML: (attributes) => ({
              'data-table-style': attributes.tableStyle ?? 'grid',
              class: `doc-table style-${attributes.tableStyle ?? 'grid'}`,
            }),
          },
        },
      },
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          shading: {
            default: null,
            parseHTML: (element) => element.style.backgroundColor || null,
            renderHTML: (attributes) => {
              const shading = safeCssColor(attributes.shading);
              return shading ? { style: `background-color: ${shading}` } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTableStyle:
        (style: string) =>
        ({ commands }) =>
          commands.updateAttributes('table', { tableStyle: style }),
      setCellShading:
        (color: string | null) =>
        ({ commands }) => commands.setCellAttribute('shading', color),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableFormatting: {
      setTableStyle: (style: string) => ReturnType;
      setCellShading: (color: string | null) => ReturnType;
    };
  }
}
