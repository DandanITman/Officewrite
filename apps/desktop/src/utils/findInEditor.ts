import type { Editor } from '@tiptap/react';

/** The Find options. Both default off. */
export interface FindOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

export interface FindMatch {
  from: number;
  to: number;
}

/** Letters, digits and underscore count as word characters. */
const WORD = /[\p{L}\p{N}_]/u;

function isWholeWord(text: string, index: number, length: number): boolean {
  const before = Array.from(text.slice(Math.max(0, index - 2), index)).at(-1) ?? '';
  const after = Array.from(text.slice(index + length, index + length + 2))[0] ?? '';
  return !(before && WORD.test(before)) && !(after && WORD.test(after));
}

/** Every match in a contiguous text run, honouring the options. */
function matchesIn(text: string, query: string, options: FindOptions): number[] {
  // Match against the original text: lowercasing can change its length and
  // shift every later document position (for example, a capital dotted I).
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, options.matchCase ? 'gu' : 'giu');
  const hits: number[] = [];
  for (const match of text.matchAll(pattern)) {
    if (!options.wholeWord || isWholeWord(text, match.index, match[0].length)) {
      hits.push(match.index);
    }
  }
  return hits;
}

export function findInEditor(
  editor: Editor,
  query: string,
  startFrom = 0,
  options: FindOptions = {},
): FindMatch | null {
  return findAllInEditor(editor, query, options).find((match) => match.from >= startFrom) ?? null;
}

export function findAllInEditor(
  editor: Editor,
  query: string,
  options: FindOptions = {},
): FindMatch[] {
  if (!query) return [];
  const matches: FindMatch[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    let text = '';
    let start = pos + 1;
    const flush = () => {
      for (const index of matchesIn(text, query, options)) {
        matches.push({ from: start + index, to: start + index + query.length });
      }
      text = '';
    };
    node.forEach((child, offset) => {
      if (child.isText) {
        if (!text) start = pos + 1 + offset;
        text += child.text;
      } else {
        // An inline object or break separates text; formatting marks do not.
        flush();
      }
    });
    flush();
    return false;
  });

  return matches;
}

export function replaceInEditor(
  editor: Editor,
  query: string,
  replacement: string,
  all = false,
  options: FindOptions = {},
) {
  const matches = findAllInEditor(editor, query, options);
  if (!matches.length) return 0;

  if (all) {
    let tr = editor.state.tr;
    // Back to front, so each edit leaves the earlier positions valid.
    for (let i = matches.length - 1; i >= 0; i--) {
      tr = tr.insertText(replacement, matches[i].from, matches[i].to);
    }
    editor.view.dispatch(tr);
    return matches.length;
  }

  const selection = editor.state.selection;
  const next =
    matches.find((match) => match.from === selection.from && match.to === selection.to) ??
    matches.find((match) => match.from >= selection.to) ?? matches[0];
  if (!next) return 0;
  editor.view.dispatch(editor.state.tr.insertText(replacement, next.from, next.to));
  editor.commands.focus();
  return 1;
}
