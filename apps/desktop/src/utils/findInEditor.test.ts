import { afterEach, describe, expect, it } from 'vitest';
import { createTestEditor } from '../editor/testEditor';
import { findAllInEditor, replaceInEditor } from './findInEditor';

describe('Find and Replace', () => {
  let editor = createTestEditor();
  afterEach(() => {
    editor.destroy();
    editor = createTestEditor();
  });

  it('finds words across formatting boundaries and respects whole-word context', () => {
    editor.commands.setContent('<p>pre<strong>fix</strong> fix</p>');
    expect(findAllInEditor(editor, 'prefix')).toEqual([{ from: 1, to: 7 }]);
    expect(findAllInEditor(editor, 'fix', { wholeWord: true })).toEqual([{ from: 8, to: 11 }]);
  });

  it('does not match across paragraphs or inline breaks', () => {
    editor.commands.setContent('<p>one</p><p>two<br>three</p>');
    expect(findAllInEditor(editor, 'onetwo')).toEqual([]);
    expect(findAllInEditor(editor, 'twothree')).toEqual([]);
  });

  it('replaces the currently selected match instead of skipping it', () => {
    editor.commands.setContent('<p>cat cat cat</p>');
    editor.commands.setTextSelection({ from: 5, to: 8 });
    expect(replaceInEditor(editor, 'cat', 'dog')).toBe(1);
    expect(editor.getText()).toBe('cat dog cat');
  });

  it('inserts replacement text literally and can delete a selected match', () => {
    editor.commands.setContent('<p>cat cat</p>');
    editor.commands.setTextSelection({ from: 1, to: 4 });
    replaceInEditor(editor, 'cat', '<b>dog</b>');
    expect(editor.getText()).toBe('<b>dog</b> cat');
    replaceInEditor(editor, 'cat', '');
    expect(editor.getText()).toBe('<b>dog</b> ');
  });

  it('preserves original positions when case conversion would expand text', () => {
    editor.commands.setContent('<p>İ cat</p>');
    expect(findAllInEditor(editor, 'cat')).toEqual([{ from: 3, to: 6 }]);
    replaceInEditor(editor, 'cat', 'dog', true);
    expect(editor.getText()).toBe('İ dog');
  });
});
