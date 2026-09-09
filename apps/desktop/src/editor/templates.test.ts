import { describe, expect, it, afterEach } from 'vitest';
import type { Editor } from '@tiptap/core';
import { TEMPLATES, TEMPLATE_CATEGORIES } from '@officewrite/core';
import { createTestEditor } from './testEditor';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

/**
 * Templates are hand-written TipTap JSON. ProseMirror does not throw on a node
 * it cannot place - it silently drops it - so a typo in a table row or a task
 * item would ship as a template that quietly opens half empty. Loading each one
 * through the production schema and comparing the JSON back out is the only
 * check that catches that.
 */
describe('template catalogue', () => {
  it('has unique ids', () => {
    const ids = TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('files every template under a known category', () => {
    for (const template of TEMPLATES) {
      expect(TEMPLATE_CATEGORIES, template.id).toContain(template.category);
    }
  });

  it('gives every template a name, a description and search keywords', () => {
    for (const template of TEMPLATES) {
      expect(template.name.length, template.id).toBeGreaterThan(0);
      expect(template.description.length, template.id).toBeGreaterThan(0);
      // Blank needs no keywords to be findable, but everything else does.
      if (template.id !== 'blank') expect(template.keywords.length, template.id).toBeGreaterThan(0);
    }
  });

  it.each(TEMPLATES.map((template) => [template.id, template] as const))(
    'loads %s into the editor without dropping content',
    (id, template) => {
      editor = createTestEditor(template.content);
      const loaded = editor.getJSON();

      expect(loaded.content, id).toBeDefined();
      // A dropped node shows up as a shorter block list than the template has.
      expect(loaded.content!.length, id).toBe(template.content.content.length);

      const expectedTypes = template.content.content.map((block) => block.type);
      expect(loaded.content!.map((block) => block.type), id).toEqual(expectedTypes);

      // Inspect the complete tree: a missing text mark or nested cell is easy
      // to miss when only the top-level block count is checked.
      const checkContent = (expected: { type: string; text?: string; attrs?: Record<string, unknown>; marks?: unknown[]; content?: unknown[] }, actual: typeof loaded) => {
        expect(actual.type, id).toBe(expected.type);
        if (expected.text != null) expect(actual.text, id).toBe(expected.text);
        for (const mark of expected.marks ?? []) {
          const typedMark = mark as { type: string; attrs?: Record<string, unknown> };
          expect(actual.marks?.find(candidate => candidate.type === typedMark.type), id).toMatchObject(typedMark);
        }
        if (expected.attrs) expect(actual.attrs, id).toMatchObject(expected.attrs);
        if (expected.content) {
          expect(actual.content?.length, id).toBe(expected.content.length);
          expected.content.forEach((child, index) => checkContent(child as typeof expected, actual.content![index]));
        }
      };
      checkContent(template.content, loaded);
    },
  );

  it.each(TEMPLATES.filter((t) => t.id !== 'blank').map((t) => [t.id, t] as const))(
    'renders visible text for %s',
    (id, template) => {
      editor = createTestEditor(template.content);
      expect(editor.getText().trim().length, id).toBeGreaterThan(0);
    },
  );
});
