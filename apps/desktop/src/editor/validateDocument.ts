import { getSchema } from '@tiptap/core';
import { createExtensions } from './extensions';

let documentSchema: ReturnType<typeof getSchema> | undefined;

/** Validate native JSON before TipTap can silently recover it as an empty document. */
export function validateDocumentContent(content: unknown): void {
  documentSchema ??= getSchema(createExtensions({ spellCheckEnabled: false }));
  const document = documentSchema.nodeFromJSON(content);
  if (document.type !== documentSchema.topNodeType) throw new Error('Expected a document root');
  document.check();
}
