import { useState } from 'react';
import {
  ArrowRight,
  Bookmark as BookmarkIcon,
  Calendar,
  Circle,
  FileText,
  Hash,
  Image as ImageIcon,
  Link as LinkIcon,
  MessageSquarePlus,
  Minus,
  Omega,
  PanelBottom,
  PanelTop,
  PenTool,
  SeparatorHorizontal,
  Smile,
  Shapes,
  Sigma,
  Square,
  Table as TableIcon,
  TextCursorInput,
  Triangle,
} from 'lucide-react';
import { promptForLink } from '../../utils/hyperlink';
import { QUICK_SYMBOLS } from '../../constants/symbols';
import {
  RibbonButton,
  RibbonGroup,
  RibbonLine,
  RibbonMenuButton,
  RibbonMenuHeader,
  RibbonMenuItem,
  RibbonMenuSeparator,
  RibbonStack,
  useRibbonMenu,
} from '../RibbonKit';
import type { RibbonTabProps } from '../types';

const COVER_PAGES = [
  { id: 'banded', label: 'Banded' },
  { id: 'facet', label: 'Facet' },
  { id: 'motion', label: 'Motion' },
  { id: 'plain', label: 'Plain' },
];

/** The table grid: hover to size, click to insert. */
function TableGridPicker({ onPick }: { onPick: (rows: number, cols: number, header: boolean) => void }) {
  const { close } = useRibbonMenu();
  const [hover, setHover] = useState({ rows: 0, cols: 0 });
  const [focusedCell, setFocusedCell] = useState(0);
  const [rows, setRows] = useState('3');
  const [cols, setCols] = useState('3');
  const [header, setHeader] = useState(true);
  const maxRows = 8;
  const maxCols = 10;

  return (
    <div className="rb-table-picker">
      <div className="rb-table-picker-label" aria-live="polite">
        {hover.rows > 0 ? `${hover.cols} column${hover.cols === 1 ? '' : 's'} × ${hover.rows} row${hover.rows === 1 ? '' : 's'}` : 'Choose a table size'}
      </div>
      <div
        className="rb-table-grid"
        style={{ gridTemplateColumns: `repeat(${maxCols}, 14px)` }}
        onMouseLeave={() => setHover({ rows: 0, cols: 0 })}
      >
        {Array.from({ length: maxRows * maxCols }, (_, index) => {
          const row = Math.floor(index / maxCols) + 1;
          const col = (index % maxCols) + 1;
          const lit = row <= hover.rows && col <= hover.cols;
          return (
            <button
              key={index}
              type="button"
              className={`rb-table-cell${lit ? ' is-lit' : ''}`}
              aria-label={`${col} by ${row} table`}
              tabIndex={index === focusedCell ? 0 : -1}
              onMouseEnter={() => setHover({ rows: row, cols: col })}
              onFocus={() => {
                setFocusedCell(index);
                setHover({ rows: row, cols: col });
              }}
              onKeyDown={(event) => {
                const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: maxCols, ArrowUp: -maxCols }[event.key];
                if (delta === undefined) return;
                event.preventDefault();
                event.stopPropagation();
                const next = event.key === 'ArrowRight' ? index + (col < maxCols ? 1 : 0)
                  : event.key === 'ArrowLeft' ? index - (col > 1 ? 1 : 0)
                  : Math.max(col - 1, Math.min((maxRows - 1) * maxCols + col - 1, index + delta));
                (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
              }}
              onClick={() => {
                onPick(row, col, header);
                close();
              }}
            />
          );
        })}
      </div>
      <p className="table-picker-help">Choose a square, or enter an exact size below.</p>
      <form className="table-custom-form" onSubmit={(event) => {
        event.preventDefault();
        const rowCount = Number(rows);
        const colCount = Number(cols);
        if (!Number.isInteger(rowCount) || !Number.isInteger(colCount) || rowCount < 1 || rowCount > 50 || colCount < 1 || colCount > 20) return;
        onPick(rowCount, colCount, header);
        close();
      }}>
        <label>Columns<input data-testid="table-custom-columns" type="number" min="1" max="20" required value={cols} onChange={(event) => setCols(event.target.value)} onKeyDown={(event) => event.stopPropagation()} /></label>
        <label>Rows<input data-testid="table-custom-rows" type="number" min="1" max="50" required value={rows} onChange={(event) => setRows(event.target.value)} onKeyDown={(event) => event.stopPropagation()} /></label>
        <label className="table-header-choice"><input data-testid="table-custom-header" type="checkbox" checked={header} onChange={(event) => setHeader(event.target.checked)} />First row is a header</label>
        <button className="rb-btn rb-btn--small" type="submit" data-testid="table-custom-insert">Insert table</button>
      </form>
    </div>
  );
}

export function InsertTab({ editor, state, actions, flags }: RibbonTabProps) {
  const setLink = () => {
    if (editor) void promptForLink(editor);
  };

  const insertSymbol = (symbol: string) => {
    editor?.chain().focus().insertContent(symbol).run();
  };

  return (
    <>
      <RibbonGroup label="Pages">
        <RibbonStack>
          <RibbonMenuButton
            icon={<FileText size={14} />}
            label="Cover Page"
            title="Cover Page"
            testId="ribbon-cover-page"
          >
            <RibbonMenuHeader label="Built-in" />
            {COVER_PAGES.map((page) => (
              <RibbonMenuItem
                key={page.id}
                label={page.label}
                onClick={() => actions.onInsertCoverPage(page.id)}
              />
            ))}
          </RibbonMenuButton>
          <RibbonButton
            icon={<FileText size={14} />}
            label="Blank Page"
            title="Blank Page"
            onClick={actions.onInsertBlankPage}
            testId="ribbon-blank-page"
          />
          <RibbonButton
            icon={<SeparatorHorizontal size={14} />}
            label="Page Break"
            title="Page Break (Ctrl+Enter)"
            onClick={() => editor?.chain().focus().insertPageBreak().run()}
            testId="ribbon-page-break"
          />
        </RibbonStack>
      </RibbonGroup>

      <RibbonGroup label="Tables">
        <RibbonMenuButton
          icon={<TableIcon size={22} className="icon-table" />}
          label="Table"
          title="Table"
          size="large"
          active={state.inTable}
          testId="ribbon-table"
          menuWidth={250}
        >
          <TableGridPicker
            onPick={(rows, cols, withHeaderRow) =>
              editor?.chain().focus().insertTable({ rows, cols, withHeaderRow }).run()
            }
          />
          <RibbonMenuSeparator />
          <RibbonMenuItem
            label="Insert 3 × 3 Table"
            onClick={() =>
              editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            testId="ribbon-insert-table-3x3"
          />
          <RibbonMenuItem
            label="Quick Table: Calendar"
            onClick={() =>
              editor?.chain().focus().insertTable({ rows: 6, cols: 7, withHeaderRow: true }).run()
            }
          />
          <RibbonMenuItem
            label="Delete Table"
            disabled={!state.inTable}
            onClick={() => editor?.chain().focus().deleteTable().run()}
          />
        </RibbonMenuButton>
      </RibbonGroup>

      <RibbonGroup label="Illustrations">
        <RibbonStack>
          <RibbonLine>
            <RibbonButton
              icon={<ImageIcon size={22} className="icon-picture" />}
              label="Pictures"
              title="Insert a picture from this device"
              size="large"
              onClick={actions.onInsertImage}
              testId="ribbon-pictures"
            />
            <RibbonMenuButton
              icon={<Shapes size={22} />}
              label="Shapes"
              title="Shapes"
              size="large"
              testId="ribbon-shapes"
            >
              <RibbonMenuHeader label="Basic shapes" />
              <RibbonMenuItem
                icon={<Square size={13} />}
                label="Rectangle"
                onClick={() => actions.onInsertShape('rect')}
                testId="shape-rect"
              />
              <RibbonMenuItem
                icon={<Circle size={13} />}
                label="Oval"
                onClick={() => actions.onInsertShape('circle')}
                testId="shape-circle"
              />
              <RibbonMenuItem
                icon={<Triangle size={13} />}
                label="Triangle"
                onClick={() => actions.onInsertShape('triangle')}
                testId="shape-triangle"
              />
              <RibbonMenuSeparator />
              <RibbonMenuHeader label="Lines" />
              <RibbonMenuItem
                icon={<Minus size={13} />}
                label="Line"
                onClick={() => actions.onInsertShape('line')}
                testId="shape-line"
              />
              <RibbonMenuItem
                icon={<ArrowRight size={13} />}
                label="Arrow"
                onClick={() => actions.onInsertShape('arrow')}
                testId="shape-arrow"
              />
            </RibbonMenuButton>
            <RibbonButton
              icon={<PenTool size={22} />}
              label="Drawing"
              title="Insert a drawing canvas to write or sketch on"
              size="large"
              onClick={actions.onInsertDrawingCanvas}
              testId="ribbon-drawing"
            />
          </RibbonLine>
        </RibbonStack>
      </RibbonGroup>

      <RibbonGroup label="Links">
        <RibbonStack>
          <RibbonButton
            icon={<LinkIcon size={14} className="icon-link" />}
            label="Link"
            title="Insert Hyperlink (Ctrl+K)"
            active={state.link}
            onClick={setLink}
            testId="ribbon-link"
          />
          {/* A word processor keeps Bookmark in Links, and Table of Contents only on
              References - so Insert drops from eleven groups to eight. */}
          <RibbonButton
            icon={<BookmarkIcon size={14} />}
            label="Bookmark"
            title="Add a bookmark to this place in the document"
            onClick={actions.onInsertBookmark}
            testId="ribbon-bookmark"
          />
          <RibbonButton
            icon={<ArrowRight size={14} />}
            label="Cross-reference"
            title="Refer to a heading, bookmark, figure or footnote"
            onClick={actions.onOpenCrossReference}
            testId="ribbon-cross-reference"
          />
        </RibbonStack>
      </RibbonGroup>

      <RibbonGroup label="Comments">
        <RibbonButton
          icon={<MessageSquarePlus size={22} />}
          label="Comment"
          title="New Comment (Ctrl+Alt+M)"
          size="large"
          onClick={actions.onNewComment}
          testId="ribbon-insert-comment"
        />
      </RibbonGroup>

      <RibbonGroup label="Header &amp; Footer">
        <RibbonStack>
          <RibbonButton
            icon={<PanelTop size={14} />}
            label="Header"
            title="Edit the page header"
            onClick={actions.onOpenHeaderFooter}
            testId="ribbon-header"
          />
          <RibbonButton
            icon={<PanelBottom size={14} />}
            label="Footer"
            title="Edit the page footer"
            onClick={actions.onOpenHeaderFooter}
            testId="ribbon-footer"
          />
          <RibbonMenuButton
            icon={<Hash size={14} />}
            label="Page Number"
            title="Page Number"
            testId="ribbon-page-number"
          >
            <RibbonMenuItem
              label="Bottom of Page"
              checked={flags.showPageNumbers}
              onClick={() => actions.onInsertPageNumbers(true)}
            />
            <RibbonMenuItem label="Remove Page Numbers" onClick={() => actions.onInsertPageNumbers(false)} />
            <RibbonMenuSeparator />
            <RibbonMenuItem label="Header and Footer…" onClick={actions.onOpenHeaderFooter} />
          </RibbonMenuButton>
        </RibbonStack>
      </RibbonGroup>

      <RibbonGroup label="Text">
        <RibbonStack>
          <RibbonMenuButton
            icon={<TextCursorInput size={14} />}
            label="Text Box"
            title="Text Box"
            active={state.textBoxActive}
            testId="ribbon-text-box"
          >
            <RibbonMenuHeader label="Built-in" />
            <RibbonMenuItem label="Simple Text Box" onClick={() => actions.onInsertTextBox('simple')} />
            <RibbonMenuItem label="Sidebar" onClick={() => actions.onInsertTextBox('sidebar')} />
            <RibbonMenuItem label="Pull Quote" onClick={() => actions.onInsertTextBox('quote')} />
          </RibbonMenuButton>
          <RibbonMenuButton
            icon={<span className="rb-glyph">A</span>}
            label="Drop Cap"
            title="Drop Cap"
            active={state.dropCap}
            testId="ribbon-drop-cap"
          >
            <RibbonMenuItem
              label="Dropped"
              checked={state.dropCap}
              onClick={() => editor?.chain().focus().toggleDropCap().run()}
            />
            <RibbonMenuItem
              label="None"
              checked={!state.dropCap}
              onClick={() => editor?.chain().focus().setParagraphStyleId(null).run()}
            />
          </RibbonMenuButton>
          <RibbonMenuButton
            icon={<Calendar size={14} className="icon-calendar" />}
            label="Date &amp; Time"
            title="Date & Time"
            testId="ribbon-date"
          >
            <RibbonMenuItem
              label={new Date().toLocaleDateString()}
              onClick={() => insertSymbol(new Date().toLocaleDateString())}
            />
            <RibbonMenuItem
              label={new Date().toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              onClick={() =>
                insertSymbol(
                  new Date().toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }),
                )
              }
            />
            <RibbonMenuItem
              label={new Date().toLocaleString()}
              onClick={() => insertSymbol(new Date().toLocaleString())}
            />
          </RibbonMenuButton>
        </RibbonStack>
      </RibbonGroup>

      <RibbonGroup label="Symbols">
        <RibbonStack>
          <RibbonButton
            icon={<Sigma size={14} />}
            label="Equation"
            title="Insert an equation run, typed in linear format"
            onClick={() => editor?.chain().focus().toggleEquationRun().run()}
            testId="ribbon-equation"
          />
          <RibbonMenuButton
            icon={<Omega size={14} />}
            label="Symbol"
            title="Symbol"
            testId="ribbon-symbol"
            menuWidth={236}
          >
            <RibbonMenuHeader label="Recently used symbols" />
            <div className="rb-symbol-grid">
              {QUICK_SYMBOLS.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  className="rb-symbol"
                  title={symbol}
                  onClick={() => insertSymbol(symbol)}
                >
                  {symbol}
                </button>
              ))}
            </div>
            <RibbonMenuSeparator />
            <RibbonMenuItem label="More Symbols…" onClick={actions.onOpenSymbolPicker} />
          </RibbonMenuButton>
          <RibbonButton
            icon={<Minus size={14} />}
            label="Horizontal Line"
            title="Insert a horizontal line"
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
            testId="ribbon-horizontal-rule"
          />
          <RibbonButton
            icon={<Smile size={14} />}
            label="Emoji"
            title="Insert an emoji"
            onClick={actions.onOpenEmojiPicker}
            testId="ribbon-emoji"
          />
        </RibbonStack>
      </RibbonGroup>
    </>
  );
}
