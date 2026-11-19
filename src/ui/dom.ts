/** Minimal DOM helpers so UI code stays short and framework-free. */

type Attrs = Record<string, string | number | boolean | undefined>;

/**
 * Create an element: h('button', { class: 'btn', type: 'button' }, 'Play').
 * String children are inserted as text (safe); use `html()` for trusted markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

/** Parse a trusted, hard-coded markup string (icons) into a node. */
export function html(markup: string): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content;
}

/** A button with an optional leading icon. */
export function button(
  label: string,
  opts: { icon?: string; className?: string; onClick?: (e: MouseEvent) => void; title?: string; ariaLabel?: string } = {},
): HTMLButtonElement {
  const b = h('button', {
    type: 'button',
    class: `btn ${opts.className ?? ''}`.trim(),
    title: opts.title,
    'aria-label': opts.ariaLabel,
  });
  if (opts.icon) b.append(html(opts.icon));
  if (label) b.append(h('span', {}, label));
  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}
