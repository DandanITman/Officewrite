import { describe, expect, it, afterEach } from 'vitest';
import {
  createDocumentEnvelope,
  serializeOfficewriteFile,
  parseOfficewriteFile,
} from './document';
import { TEMPLATES } from './defaults';
import {
  buildRegressionDocumentContent,
  REGRESSION_DOC_TITLE,
  REGRESSION_FIXED_ISO,
} from '../../../tests/fixtures/regressionDocument';

describe('document envelope', () => {
  it('creates a blank document envelope from template', () => {
    const blank = TEMPLATES.find((t) => t.id === 'blank')!;
    const envelope = createDocumentEnvelope(blank.content);

    expect(envelope.metadata.title).toBe('Untitled');
    expect(envelope.content).toEqual(blank.content);
    expect(envelope.pageSetup.size).toBe('letter');
    expect(envelope.trackChangesEnabled).toBe(false);
  });

  it('TC-UNIT-001: serializes and parses a officewrite file with formatting content', () => {
    const content = buildRegressionDocumentContent();
    const envelope = createDocumentEnvelope(content, {
      metadata: {
        title: REGRESSION_DOC_TITLE,
        author: 'Regression Bot',
        created: REGRESSION_FIXED_ISO,
        modified: REGRESSION_FIXED_ISO,
      },
    });

    const serialized = serializeOfficewriteFile(envelope);
    const restored = parseOfficewriteFile(serialized);

    expect(restored.metadata.title).toBe(REGRESSION_DOC_TITLE);
    expect(restored.metadata.author).toBe('Regression Bot');
    expect(restored.content).toEqual(content);
    expect(restored.pageSetup).toEqual(envelope.pageSetup);
    expect(restored.customStyles.length).toBeGreaterThan(0);
  });

  it.each([null, {}, [], { content: 'broken' }, { content: { type: 'paragraph' } }, { content: { type: 'doc', content: 'broken' } }])
  ('rejects invalid native files instead of replacing them with a blank document: %j', (invalid) => {
    expect(() => parseOfficewriteFile(invalid)).toThrow('Invalid Officewrite file');
  });

  it('continues to open older native files with valid content and no optional settings', () => {
    const content = { type: 'doc', content: [{ type: 'paragraph' }] };
    expect(parseOfficewriteFile({ version: 1, content }).content).toEqual(content);
  });
});
