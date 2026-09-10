/** CSS colors may contain values, never declarations, escapes or resource URLs. */
export function safeCssColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)
    || /^[a-z]+$/i.test(color)
    || /^(?:rgb|rgba|hsl|hsla)\([\d.,%+\- /]+\)$/i.test(color)) return color;
  return null;
}

export function safeCssLength(value: unknown, allowUnitless = false): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (allowUnitless && text === 'normal') return text;
  const match = /^(\d+(?:\.\d+)?|\.\d+)(px|pt|em|rem|%)?$/i.exec(text);
  return match && Number(match[1]) > 0 && Number(match[1]) <= 1000 && (match[2] || allowUnitless)
    ? text : null;
}

export function safeFontFamily(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 1024 && /^[\p{L}\p{N}\p{M} _,'".\-]+$/u.test(value)
    ? value : null;
}

export function safeTextAlignment(value: unknown): string | null {
  return typeof value === 'string' && ['left', 'right', 'center', 'justify', 'start', 'end'].includes(value) ? value : null;
}

/** Parse pixel-valued model attributes without accepting CSS declarations. */
export function safeLayoutNumber(value: unknown, fallback = 0, min = 0, max = 10000): number {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

/** Only embedded image formats can be displayed without contacting a server. */
export function isEmbeddedImageSource(value: unknown): value is string {
  return typeof value === 'string'
    && /^data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml|tiff|emf|wmf|x-icon|vnd\.microsoft\.icon)(?:;charset=[a-z\d_-]+)?(?:;base64)?,[\s\S]+$/i.test(value);
}

/** Keep ordinary document links, including relative links, but never executable schemes. */
export function safeExportHref(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  const href = value.trim();
  if (!href) return null;
  try {
    const url = new URL(href, 'https://officewrite.invalid/');
    return ['http:', 'https:', 'ftp:', 'ftps:', 'mailto:', 'tel:', 'callto:', 'sms:', 'cid:', 'xmpp:'].includes(url.protocol)
      ? href : null;
  } catch {
    return null;
  }
}
