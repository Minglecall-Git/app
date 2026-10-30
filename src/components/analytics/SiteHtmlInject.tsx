'use client';

import { useEffect } from 'react';

type InjectTarget = 'head' | 'body';

/**
 * Injects admin-pasted HTML (scripts, comments, meta, noscript) into document head or body.
 * Script tags are recreated so browsers actually execute them.
 */
export function SiteHtmlInject({
  html,
  target,
  markerId,
}: {
  html: string;
  target: InjectTarget;
  markerId: string;
}) {
  useEffect(() => {
    const raw = String(html || '').trim();
    if (!raw || typeof document === 'undefined') return;

    const parent = target === 'head' ? document.head : document.body;
    const injected: Node[] = [];

    const template = document.createElement('template');
    template.innerHTML = raw;

    const appendNode = (node: Node) => {
      if (node.nodeName === 'SCRIPT') {
        const old = node as HTMLScriptElement;
        const script = document.createElement('script');
        for (const attr of Array.from(old.attributes)) {
          script.setAttribute(attr.name, attr.value);
        }
        if (old.textContent) script.text = old.textContent;
        script.setAttribute('data-cms-inject', markerId);
        parent.appendChild(script);
        injected.push(script);
        return;
      }
      const clone = document.importNode(node, true);
      if (clone.nodeType === Node.ELEMENT_NODE) {
        (clone as Element).setAttribute('data-cms-inject', markerId);
      }
      parent.appendChild(clone);
      injected.push(clone);
    };

    Array.from(template.content.childNodes).forEach(appendNode);

    return () => {
      for (const node of injected) {
        node.parentNode?.removeChild(node);
      }
      // Also clear any leftover markers from prior mounts
      parent.querySelectorAll(`[data-cms-inject="${markerId}"]`).forEach((el) => el.remove());
    };
  }, [html, target, markerId]);

  return null;
}
