import type { Editor } from '@tiptap/react';
import { CellSelection, selectedRect } from '@tiptap/pm/tables';
import { Fragment } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

/**
 * `selectedRect` throws - not returns null - when the selection is not inside
 * a table, because prosemirror-tables' `selectionCell` raises "no cell found".
 *
 * The Table Layout panel renders for a frame after the caret leaves the table,
 * and the Cell Size group measures on every render, so an unguarded call took
 * the whole app down to a blank screen. Every entry point here goes through
 * this.
 */
export function rectOf(editor: Editor | null) {
  if (!editor) return null;
  try {
    return selectedRect(editor.view.state);
  } catch {
    return null;
  }
}

/**
 * The Cell Size commands, shared by the Table Layout tab and the Alt+Q
 * command registry.
 *
 * These live outside the tab component so the command palette can run them.
 * When they were inline, the ribbon buttons worked and searching for "column
 * width" or "distribute" found nothing at all.
 *
 * Every one of them writes the same attributes the drag resizers maintain -
 * `colwidth` on cells, `height` on rows - so dragging a border and typing a
 * number cannot disagree.
 */

/** CSS px are 1/96in, and the boxes read in inches. */
export const PPI = 96;
export const pxToIn = (px: number) => Math.round((px / PPI) * 100) / 100;
export const inToPx = (inches: number) => Math.round(inches * PPI);

/**
 * The caret's own table element.
 *
 * Scoped to the caret rather than `querySelector('table')`: in a document with
 * two tables, sizing the second one from the first one's width wrote widths
 * the table could not hold, and the damage persisted through save.
 */
export function currentTableEl(editor: Editor | null): HTMLTableElement | null {
  const rect = rectOf(editor);
  if (!editor || !rect) return null;
  const node = editor.view.domAtPos(rect.tableStart).node as HTMLElement | null;
  const el = node?.nodeType === 1 ? node : (node?.parentElement ?? null);
  return el?.closest('table') ?? null;
}

/**
 * The caret's cell size, measured off the rendered table rather than the
 * attributes: a column that has never been resized carries no `colwidth`, and
 * the real width is still reported.
 */
export function cellSize(editor: Editor | null): { width: number; height: number } {
  if (!editor) return { width: 0, height: 0 };
  const table = currentTableEl(editor);
  const selected = table?.querySelector('td.selectedCell, th.selectedCell');
  const cell =
    selected ??
    (() => {
      const { from } = editor.state.selection;
      const dom = editor.view.domAtPos(from).node as HTMLElement | null;
      return dom?.nodeType === 1
        ? dom.closest('td, th')
        : (dom?.parentElement?.closest('td, th') ?? null);
    })();
  const box = (cell as HTMLElement | null)?.getBoundingClientRect();
  const row = (cell as HTMLElement | null)?.closest('tr')?.getBoundingClientRect();
  const scale = editor.view.dom.offsetWidth ? editor.view.dom.getBoundingClientRect().width / editor.view.dom.offsetWidth : 1;
  const span = Number(cell?.getAttribute('colspan') ?? 1);
  return { width: (box?.width ?? 0) / (scale || 1) / span, height: (row?.height ?? 0) / (scale || 1) };
}

/** Applies a width to every cell in the caret's column. */
export function setColumnWidth(editor: Editor | null, px: number) {
  const rect = rectOf(editor);
  if (!editor || !rect || !Number.isFinite(px) || px < 0) return;
  const width = px === 0 ? 0 : Math.max(24, Math.round(px));
  const { tr } = editor.view.state;
  tr.setNodeMarkup(rect.tableStart - 1, undefined, { ...rect.table.attrs, tableLayout: 'fixed' });
  for (const offset of new Set(rect.map.map)) {
    const pos = rect.tableStart + offset;
    const node = tr.doc.nodeAt(pos);
    if (!node) continue;
    const cell = rect.map.findCell(offset);
    if (cell.right <= rect.left || cell.left >= rect.right) continue;
    const widths = Array.from({ length: node.attrs.colspan }, (_, index) =>
      cell.left + index >= rect.left && cell.left + index < rect.right
        ? width : (node.attrs.colwidth?.[index] ?? 0),
    );
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, colwidth: widths.some(Boolean) ? widths : null });
  }
  editor.view.dispatch(tr);
}

/** Applies a height to the caret's row. */
export function setRowHeight(editor: Editor | null, px: number) {
  const rect = rectOf(editor);
  if (!editor || !rect || !Number.isFinite(px) || px < 0) return;
  const { tr } = editor.view.state;
  rect.table.forEach((row, offset, index) => {
    if (index >= rect.top && index < rect.bottom) {
      tr.setNodeMarkup(rect.tableStart + offset, undefined, { ...row.attrs, height: Math.round(px) || null });
    }
  });
  editor.view.dispatch(tr);
}

/** Strips explicit widths so the browser lays the table out on its content. */
export function clearWidths(editor: Editor | null) {
  const rect = rectOf(editor);
  if (!editor || !rect) return;
  const { tr } = editor.view.state;
  tr.setNodeMarkup(rect.tableStart - 1, undefined, { ...rect.table.attrs, tableLayout: 'auto' });
  for (const cellPos of new Set(rect.map.map)) {
    const pos = rect.tableStart + cellPos;
    const node = tr.doc.nodeAt(pos);
    if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, colwidth: null });
  }
  editor.view.dispatch(tr);
}

export function distributeColumns(editor: Editor | null) {
  const rect = rectOf(editor);
  if (!editor || !rect) return;
  const total = currentTableEl(editor)?.offsetWidth ?? 0;
  if (!total) return;
  const each = Math.floor(total / rect.map.width);
  const { tr } = editor.view.state;
  tr.setNodeMarkup(rect.tableStart - 1, undefined, { ...rect.table.attrs, tableLayout: 'fixed' });
  for (const cellPos of new Set(rect.map.map)) {
    const pos = rect.tableStart + cellPos;
    const node = tr.doc.nodeAt(pos);
    if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, colwidth: Array(node.attrs.colspan).fill(each) });
  }
  editor.view.dispatch(tr);
}

export function distributeRows(editor: Editor | null) {
  const rect = rectOf(editor);
  if (!editor || !rect) return;
  const rows = currentTableEl(editor)?.rows ?? [];
  const tallest = Math.max(
    0,
    ...[...rows].map((row) => row.offsetHeight),
  );
  if (!tallest) return;
  const { tr } = editor.view.state;
  rect.table.forEach((row, offset) => {
    tr.setNodeMarkup(rect.tableStart + offset, undefined, { ...row.attrs, height: Math.round(tallest) });
  });
  editor.view.dispatch(tr);
}

/** Fit to the available page width, independent of the table's current width or zoom. */
export function fitTableToWindow(editor: Editor | null) {
  const rect = rectOf(editor);
  const table = currentTableEl(editor);
  if (!editor || !rect || !table) return;
  const available = table.parentElement?.clientWidth ?? editor.view.dom.clientWidth;
  if (!available) return;
  const width = Math.max(24, Math.floor(available / rect.map.width));
  const tr = editor.state.tr;
  tr.setNodeMarkup(rect.tableStart - 1, undefined, { ...rect.table.attrs, tableLayout: 'fixed' });
  for (const offset of new Set(rect.map.map)) {
    const pos = rect.tableStart + offset;
    const node = tr.doc.nodeAt(pos);
    if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, colwidth: Array(node.attrs.colspan).fill(width) });
  }
  editor.view.dispatch(tr);
}

export function selectTablePart(editor: Editor | null, part: 'cell' | 'row' | 'column' | 'table') {
  const rect = rectOf(editor);
  if (!editor || !rect) return;
  const left = part === 'row' || part === 'table' ? 0 : rect.left;
  const right = part === 'row' || part === 'table' ? rect.map.width - 1 : rect.right - 1;
  const top = part === 'column' || part === 'table' ? 0 : rect.top;
  const bottom = part === 'column' || part === 'table' ? rect.map.height - 1 : rect.bottom - 1;
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(
    editor.state.doc,
    rect.tableStart + rect.map.map[top * rect.map.width + left],
    rect.tableStart + rect.map.map[bottom * rect.map.width + right],
  )));
  editor.view.focus();
}

export function canSortTable(editor: Editor | null) {
  const rect = rectOf(editor);
  return !!rect && rect.map.height > 1 && [...new Set(rect.map.map)].every((pos) => {
    const cell = rect.table.nodeAt(pos);
    return cell?.attrs.rowspan === 1 && cell.attrs.colspan === 1;
  });
}

/** Sort entire rows by the active column while keeping a leading header row. */
export function sortTableRows(editor: Editor | null, direction: 'asc' | 'desc') {
  const rect = rectOf(editor);
  if (!editor || !rect || !canSortTable(editor)) return false;
  const rows = Array.from({ length: rect.table.childCount }, (_, index) => rect.table.child(index));
  const header = rows[0].childCount > 0 && Array.from({ length: rows[0].childCount }, (_, index) => rows[0].child(index)).every((cell) => cell.type.name === 'tableHeader');
  const sorted = rows.slice(header ? 1 : 0).sort((a, b) => {
    const order = a.child(rect.left).textContent.localeCompare(b.child(rect.left).textContent, undefined, { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? order : -order;
  });
  const table = rect.table.copy(Fragment.fromArray(header ? [rows[0], ...sorted] : sorted));
  const tr = editor.state.tr.replaceWith(rect.tableStart - 1, rect.tableStart - 1 + rect.table.nodeSize, table);
  tr.setSelection(TextSelection.near(tr.doc.resolve(rect.tableStart + 2)));
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}
