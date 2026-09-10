import type { OfficewriteDocument, DocumentMetadata } from './types';
import {
  completeHeaderFooter,
  completePageSetup,
  type DocumentComment,
  type DocumentFootnote,
  type HeaderFooter,
  type PageSetup,
} from './pageSetup';
import { BUILTIN_STYLES, DEFAULT_WATERMARK, type DocumentStyle, type Watermark } from './styles';
import type { CitationSource, CitationStyle } from './references';

export interface DocumentEnvelope {
  metadata: DocumentMetadata;
  content: unknown;
  pageSetup: PageSetup;
  headerFooter: HeaderFooter;
  comments: DocumentComment[];
  trackChangesEnabled: boolean;
  watermark: Watermark;
  customStyles: DocumentStyle[];
  footnotes: DocumentFootnote[];
  /** Endnotes collect at the end of the document rather than the page. */
  endnotes: DocumentFootnote[];
  /** Bibliography sources, as Manage Sources lists them. */
  sources: CitationSource[];
  citationStyle: CitationStyle;
  /** Review > Restrict Editing: the document opens read-only. */
  restrictEditing: boolean;
  /** Which Design style set produced the current formatting. */
  styleSetId: string;
}

export function createDocumentEnvelope(
  content: unknown,
  partial?: Partial<Omit<DocumentEnvelope, 'content'>>,
): DocumentEnvelope {
  const now = new Date().toISOString();
  return {
    metadata: partial?.metadata ?? {
      title: 'Untitled',
      author: '',
      created: now,
      modified: now,
    },
    content,
    pageSetup: completePageSetup(partial?.pageSetup),
    headerFooter: completeHeaderFooter(partial?.headerFooter),
    comments: partial?.comments ?? [],
    trackChangesEnabled: partial?.trackChangesEnabled ?? false,
    watermark: partial?.watermark ?? { ...DEFAULT_WATERMARK },
    customStyles: partial?.customStyles ?? [...BUILTIN_STYLES],
    footnotes: partial?.footnotes ?? [],
    endnotes: partial?.endnotes ?? [],
    sources: partial?.sources ?? [],
    citationStyle: partial?.citationStyle ?? 'apa',
    restrictEditing: partial?.restrictEditing ?? false,
    styleSetId: partial?.styleSetId ?? 'default',
  };
}

export function parseOfficewriteFile(raw: unknown): DocumentEnvelope {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid Officewrite file: the document content is missing.');
  }
  const file = raw as OfficewriteDocument;
  const content = file.content as { type?: unknown; content?: unknown } | null;
  if (!content || typeof content !== 'object' || content.type !== 'doc'
    || (content.content !== undefined && !Array.isArray(content.content))) {
    throw new Error('Invalid Officewrite file: the document content is missing or malformed.');
  }
  return createDocumentEnvelope(file.content, {
    metadata: file.metadata,
    // Files written before page colour, borders, line numbers and hyphenation
    // existed carry only some of PageSetup; fill the rest from the defaults.
    pageSetup: file.pageSetup,
    headerFooter: file.headerFooter,
    comments: file.comments,
    trackChangesEnabled: file.trackChangesEnabled,
    watermark: file.watermark,
    customStyles: file.customStyles,
    footnotes: file.footnotes,
    endnotes: file.endnotes,
    sources: file.sources,
    citationStyle: file.citationStyle,
    restrictEditing: file.restrictEditing,
    styleSetId: file.styleSetId,
  });
}

export function serializeOfficewriteFile(envelope: DocumentEnvelope): OfficewriteDocument {
  return {
    version: 3,
    metadata: { ...envelope.metadata, modified: new Date().toISOString() },
    content: envelope.content,
    pageSetup: envelope.pageSetup,
    headerFooter: envelope.headerFooter,
    comments: envelope.comments,
    trackChangesEnabled: envelope.trackChangesEnabled,
    watermark: envelope.watermark,
    customStyles: envelope.customStyles,
    footnotes: envelope.footnotes,
    endnotes: envelope.endnotes,
    sources: envelope.sources,
    citationStyle: envelope.citationStyle,
    restrictEditing: envelope.restrictEditing,
    styleSetId: envelope.styleSetId,
  };
}
