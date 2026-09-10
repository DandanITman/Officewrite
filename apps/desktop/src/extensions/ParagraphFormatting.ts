import { Extension } from '@tiptap/core';
import { safeCssColor, safeCssLength, safeLayoutNumber, safeTextAlignment } from '@officewrite/core';

type ParagraphFormattingAttrs = {
  textAlign?: string | null;
  /** Home > Paragraph: left-to-right or right-to-left text direction. */
  textDirection?: 'ltr' | 'rtl' | null;
  indentLevel?: number | null;
  indentRight?: number | null;
  firstLineIndent?: number | null;
  lineHeight?: string | null;
  spaceBefore?: number | null;
  spaceAfter?: number | null;
  borderColor?: string | null;
  borderSides?: string | null;
  shading?: string | null;
  dropCap?: boolean | null;
  styleId?: string | null;
  /** References tab: marks the paragraph as a caption, so it styles like one. */
  caption?: string | null;
};

function readPx(value: string | null) {
  if (!value) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const BORDER_SIDE_PROPERTIES: Record<string, string[]> = {
  left: ['border-left'],
  all: ['border'],
  top: ['border-top'],
  bottom: ['border-bottom'],
  right: ['border-right'],
  outside: ['border'],
};

function paragraphStyle(attrs: ParagraphFormattingAttrs) {
  const styles: string[] = [];
  const align = safeTextAlignment(attrs.textAlign);
  if (align && align !== 'left') styles.push(`text-align: ${align}`);
  const indentLevel = safeLayoutNumber(attrs.indentLevel, 0, 0, 100);
  if (indentLevel > 0) styles.push(`margin-left: ${indentLevel * 36}px`);
  const indentRight = safeLayoutNumber(attrs.indentRight);
  if (indentRight > 0) styles.push(`margin-right: ${indentRight}px`);
  const firstLine = safeLayoutNumber(attrs.firstLineIndent, 0, -10000);
  if (firstLine) styles.push(`text-indent: ${firstLine}px`);
  const lineHeight = safeCssLength(attrs.lineHeight, true);
  if (lineHeight) styles.push(`line-height: ${lineHeight}`);
  if (attrs.spaceBefore != null) styles.push(`margin-top: ${safeLayoutNumber(attrs.spaceBefore)}px`);
  if (attrs.spaceAfter != null) styles.push(`margin-bottom: ${safeLayoutNumber(attrs.spaceAfter)}px`);
  const borderColor = safeCssColor(attrs.borderColor);
  if (borderColor) {
    const key = attrs.borderSides ?? 'left';
    const sides = Object.hasOwn(BORDER_SIDE_PROPERTIES, key) ? BORDER_SIDE_PROPERTIES[key] : ['border-left'];
    for (const side of sides) styles.push(`${side}: 3px solid ${borderColor}`);
    styles.push('padding-left: 10px');
  }
  const shading = safeCssColor(attrs.shading);
  if (shading) styles.push(`background-color: ${shading}`, 'padding-top: 2px', 'padding-bottom: 2px');
  return styles.join('; ');
}

export const ParagraphFormatting = Extension.create({
  name: 'paragraphFormatting',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indentLevel: {
            default: 0,
            parseHTML: (element) => {
              const raw = element.getAttribute('data-indent-level');
              return raw ? Number(raw) : Math.round((readPx(element.style.marginLeft) ?? 0) / 36);
            },
            renderHTML: (attrs) => {
              const style = paragraphStyle(attrs);
              return {
                ...(attrs.indentLevel ? { 'data-indent-level': attrs.indentLevel } : {}),
                ...(attrs.styleId ? { 'data-style-id': attrs.styleId } : {}),
                ...(attrs.borderSides ? { 'data-border-sides': attrs.borderSides } : {}),
                ...(attrs.dropCap ? { 'data-drop-cap': 'true', class: 'has-drop-cap' } : {}),
                ...(attrs.caption ? { 'data-caption': attrs.caption, class: 'doc-caption' } : {}),
                ...(style ? { style } : {}),
              };
            },
          },
          // No renderHTML on the rest: indentLevel.renderHTML above already
          // serialises the complete attribute set through paragraphStyle().
          // Emitting them here too duplicated every border and shading rule.
          indentRight: {
            default: null,
            parseHTML: (element) => readPx(element.style.marginRight),
            renderHTML: () => ({}),
          },
          firstLineIndent: {
            default: null,
            parseHTML: (element) => readPx(element.style.textIndent),
            renderHTML: () => ({}),
          },
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: () => ({}),
          },
          spaceBefore: {
            default: null,
            parseHTML: (element) => readPx(element.style.marginTop),
            renderHTML: () => ({}),
          },
          spaceAfter: {
            default: null,
            parseHTML: (element) => readPx(element.style.marginBottom),
            renderHTML: () => ({}),
          },
          borderColor: {
            default: null,
            parseHTML: (element) => element.style.borderLeftColor || element.style.borderBottomColor || element.style.borderTopColor || element.style.borderRightColor || null,
            renderHTML: () => ({}),
          },
          borderSides: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-border-sides'),
            renderHTML: () => ({}),
          },
          shading: {
            default: null,
            parseHTML: (element) => element.style.backgroundColor || null,
            renderHTML: () => ({}),
          },
          dropCap: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-drop-cap') === 'true' || null,
            renderHTML: () => ({}),
          },
          styleId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-style-id'),
            renderHTML: () => ({}),
          },
          caption: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-caption'),
            renderHTML: () => ({}),
          },
          textDirection: {
            default: null,
            parseHTML: (element) => (element.getAttribute('dir') === 'rtl' ? 'rtl' : null),
            // Emitted as the real dir attribute, so the browser does the
            // bidirectional layout rather than us faking it with text-align.
            renderHTML: (attrs) => (attrs.textDirection === 'rtl' ? { dir: 'rtl' } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    /** Whichever block type the caret is in, so commands work in headings too. */
    const blockType = (editor: import('@tiptap/core').Editor) =>
      editor.isActive('heading') ? 'heading' : 'paragraph';

    return {
      increaseParagraphIndent:
        () =>
        ({ editor, commands }) => {
          const current = Number(
            editor.getAttributes('paragraph').indentLevel ??
              editor.getAttributes('heading').indentLevel ??
              0,
          );
          // Inside a list, Tab-style indenting means demoting the item, exactly
          // as Increase Indent does for a numbered or bulleted list.
          if (editor.isActive('listItem') && commands.sinkListItem('listItem')) return true;
          return commands.updateAttributes(blockType(editor), {
            indentLevel: Math.min(8, current + 1),
          });
        },
      decreaseParagraphIndent:
        () =>
        ({ editor, commands }) => {
          const current = Number(
            editor.getAttributes('paragraph').indentLevel ??
              editor.getAttributes('heading').indentLevel ??
              0,
          );
          if (editor.isActive('listItem') && current === 0 && commands.liftListItem('listItem')) {
            return true;
          }
          return commands.updateAttributes(blockType(editor), {
            indentLevel: Math.max(0, current - 1),
          });
        },
      /** Home > Paragraph: Left-to-Right / Right-to-Left. */
      setTextDirection:
        (direction: 'ltr' | 'rtl') =>
        ({ editor, commands }) =>
          commands.updateAttributes(blockType(editor), {
            textDirection: direction === 'rtl' ? 'rtl' : null,
          }),
      setRightIndent:
        (px: number) =>
        ({ editor, commands }) =>
          commands.updateAttributes(blockType(editor), { indentRight: px || null }),
      setFirstLineIndent:
        (px: number) =>
        ({ editor, commands }) =>
          commands.updateAttributes(blockType(editor), { firstLineIndent: px || null }),
      setLineSpacing:
        (lineHeight: string) =>
        ({ editor, commands }) =>
          commands.updateAttributes(blockType(editor), { lineHeight: lineHeight || null }),
      setParagraphSpacing:
        (spaceBefore: number, spaceAfter: number) =>
        ({ editor, commands }) =>
          commands.updateAttributes(blockType(editor), { spaceBefore, spaceAfter }),
      /** The "Add/Remove Space Before Paragraph" menu entries. */
      toggleSpaceBefore:
        () =>
        ({ editor, commands }) => {
          const current = Number(editor.getAttributes(blockType(editor)).spaceBefore ?? 0);
          return commands.updateAttributes(blockType(editor), { spaceBefore: current > 0 ? 0 : 12 });
        },
      toggleSpaceAfter:
        () =>
        ({ editor, commands }) => {
          const current = Number(editor.getAttributes(blockType(editor)).spaceAfter ?? 0);
          return commands.updateAttributes(blockType(editor), { spaceAfter: current > 0 ? 0 : 12 });
        },
      setParagraphBorder:
        (borderColor: string | null, sides: string = 'left') =>
        ({ editor, commands }) =>
          commands.updateAttributes(blockType(editor), {
            borderColor,
            borderSides: borderColor ? sides : null,
          }),
      setParagraphShading:
        (shading: string | null) =>
        ({ editor, commands }) =>
          commands.updateAttributes(blockType(editor), { shading }),
      toggleDropCap:
        () =>
        ({ editor, commands }) => {
          const current = Boolean(editor.getAttributes(blockType(editor)).dropCap);
          return commands.updateAttributes(blockType(editor), { dropCap: current ? null : true });
        },
      setParagraphStyleId:
        (styleId: string | null) =>
        ({ editor, commands }) =>
          commands.updateAttributes(blockType(editor), { styleId }),
      markAsCaption:
        (label: string | null) =>
        ({ editor, commands }) =>
          commands.updateAttributes(blockType(editor), { caption: label }),
      clearParagraphFormatting:
        () =>
        ({ editor, commands }) =>
          commands.updateAttributes(blockType(editor), {
            indentLevel: 0,
            indentRight: null,
            firstLineIndent: null,
            lineHeight: null,
            spaceBefore: null,
            spaceAfter: null,
            borderColor: null,
            borderSides: null,
            shading: null,
            dropCap: null,
            styleId: null,
          }),
    };
  },

  addKeyboardShortcuts() {
    return {
      // The line-spacing shortcuts.
      'Mod-1': () => this.editor.commands.setLineSpacing('1'),
      'Mod-2': () => this.editor.commands.setLineSpacing('2'),
      'Mod-5': () => this.editor.commands.setLineSpacing('1.5'),
      'Mod-0': () => this.editor.commands.toggleSpaceBefore(),
      'Mod-m': () => this.editor.commands.increaseParagraphIndent(),
      'Mod-Shift-m': () => this.editor.commands.decreaseParagraphIndent(),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormatting: {
      increaseParagraphIndent: () => ReturnType;
      decreaseParagraphIndent: () => ReturnType;
      setTextDirection: (direction: 'ltr' | 'rtl') => ReturnType;
      setRightIndent: (px: number) => ReturnType;
      setFirstLineIndent: (px: number) => ReturnType;
      setLineSpacing: (lineHeight: string) => ReturnType;
      setParagraphSpacing: (spaceBefore: number, spaceAfter: number) => ReturnType;
      toggleSpaceBefore: () => ReturnType;
      toggleSpaceAfter: () => ReturnType;
      setParagraphBorder: (borderColor: string | null, sides?: string) => ReturnType;
      setParagraphShading: (shading: string | null) => ReturnType;
      toggleDropCap: () => ReturnType;
      setParagraphStyleId: (styleId: string | null) => ReturnType;
      markAsCaption: (label: string | null) => ReturnType;
      clearParagraphFormatting: () => ReturnType;
    };
  }
}
