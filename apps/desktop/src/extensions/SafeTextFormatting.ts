import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import type { Attributes } from '@tiptap/core';
import { safeCssColor, safeFontFamily, safeTextAlignment } from '@officewrite/core';

// Keep the upstream commands and HTML parsers. Native JSON also reaches these
// renderers, so validate formatting again where it becomes a CSS declaration.
export const SafeTextAlign = TextAlign.extend({
  addGlobalAttributes() {
    return (this.parent?.() ?? []).map(group => ({
      ...group,
      attributes: {
        ...group.attributes,
        textAlign: {
          ...group.attributes.textAlign,
          renderHTML: attrs => {
            const value = safeTextAlignment(attrs.textAlign);
            return value ? { style: `text-align: ${value}` } : {};
          },
        },
      },
    }));
  },
});

export const SafeColor = Color.extend({
  addGlobalAttributes() {
    return (this.parent?.() ?? []).map(group => ({
      ...group,
      attributes: {
        ...group.attributes,
        color: {
          ...group.attributes.color,
          renderHTML: attrs => {
            const value = safeCssColor(attrs.color);
            return value ? { style: `color: ${value}` } : {};
          },
        },
      },
    }));
  },
});

export const SafeFontFamily = FontFamily.extend({
  addGlobalAttributes() {
    return (this.parent?.() ?? []).map(group => ({
      ...group,
      attributes: {
        ...group.attributes,
        fontFamily: {
          ...group.attributes.fontFamily,
          renderHTML: attrs => {
            const value = safeFontFamily(attrs.fontFamily);
            return value ? { style: `font-family: ${value}` } : {};
          },
        },
      },
    }));
  },
});

export const SafeHighlight = Highlight.extend({
  addAttributes() {
    const attributes: Attributes = this.parent?.() ?? {};
    if (!this.options.multicolor) return attributes;
    return {
      ...attributes,
      color: {
        ...attributes.color,
        renderHTML: attrs => {
          const value = safeCssColor(attrs.color);
          return value ? { 'data-color': value, style: `background-color: ${value}; color: inherit` } : {};
        },
      },
    };
  },
});
