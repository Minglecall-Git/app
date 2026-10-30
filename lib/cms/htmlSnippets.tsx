import React from 'react';

type SnippetPart =
  | { kind: 'script-src'; src: string; async: boolean; defer: boolean }
  | { kind: 'script-inline'; code: string }
  | { kind: 'meta'; name?: string; content?: string; property?: string }
  | { kind: 'link'; rel: string; href: string };

/**
 * Extract script / meta / link tags from admin-pasted HTML so we can SSR them
 * into the document (Google's tag checker reads initial HTML, not client JS).
 */
export function parseHtmlSnippetParts(html: string): SnippetPart[] {
  const raw = String(html || '').trim();
  if (!raw) return [];
  const parts: SnippetPart[] = [];

  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(raw))) {
    const attrs = m[1] || '';
    const code = (m[2] || '').trim();
    const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (srcMatch?.[1]) {
      parts.push({
        kind: 'script-src',
        src: srcMatch[1].trim(),
        async: /\basync\b/i.test(attrs),
        defer: /\bdefer\b/i.test(attrs),
      });
    } else if (code) {
      parts.push({ kind: 'script-inline', code });
    }
  }

  const metaRe = /<meta\b([^>]*)\/?>/gi;
  while ((m = metaRe.exec(raw))) {
    const attrs = m[1] || '';
    const name = attrs.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
    const property = attrs.match(/\bproperty\s*=\s*["']([^"']+)["']/i)?.[1];
    const content = attrs.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
    if ((name || property) && content) {
      parts.push({ kind: 'meta', name, property, content });
    }
  }

  const linkRe = /<link\b([^>]*)\/?>/gi;
  while ((m = linkRe.exec(raw))) {
    const attrs = m[1] || '';
    const rel = attrs.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1];
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (rel && href) parts.push({ kind: 'link', rel, href });
  }

  return parts;
}

/** Server-render snippet parts as real DOM nodes in initial HTML. */
export function HtmlSnippetNodes({
  html,
  idPrefix,
}: {
  html: string;
  idPrefix: string;
}) {
  const parts = parseHtmlSnippetParts(html);
  if (!parts.length) return null;

  return (
    <>
      {parts.map((part, i) => {
        const key = `${idPrefix}-${i}`;
        if (part.kind === 'script-src') {
          return (
            <script
              key={key}
              src={part.src}
              async={part.async || undefined}
              defer={part.defer || undefined}
            />
          );
        }
        if (part.kind === 'script-inline') {
          return (
            <script
              key={key}
              dangerouslySetInnerHTML={{ __html: part.code }}
            />
          );
        }
        if (part.kind === 'meta') {
          return (
            <meta
              key={key}
              {...(part.name ? { name: part.name } : {})}
              {...(part.property ? { property: part.property } : {})}
              content={part.content}
            />
          );
        }
        if (part.kind === 'link') {
          return <link key={key} rel={part.rel} href={part.href} />;
        }
        return null;
      })}
    </>
  );
}
