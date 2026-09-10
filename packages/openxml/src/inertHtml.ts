import { isEmbeddedImageSource } from '@officewrite/core';

/** Parse document markup in template storage, without activating its resources. */
export function inertDocumentHtml(html: string): HTMLTemplateElement {
  if (typeof document === 'undefined') throw new Error('HTML import requires a DOM environment.');
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script, style, title, meta, link, base, iframe, object, embed, video, audio, source, track, svg, math').forEach(node => node.remove());
  for (const element of template.content.querySelectorAll('*')) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name) || ['srcset', 'poster', 'background'].includes(attribute.name)) element.removeAttribute(attribute.name);
    }
    if (element.tagName === 'IMG' && !isEmbeddedImageSource(element.getAttribute('src'))) {
      const placeholder = document.createElement('span');
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name !== 'src') placeholder.setAttribute(attribute.name, attribute.value);
      }
      placeholder.setAttribute('data-blocked-image', element.getAttribute('src') ?? '');
      placeholder.textContent = 'Picture blocked';
      element.replaceWith(placeholder);
    }
  }
  return template;
}
