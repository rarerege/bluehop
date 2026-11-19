import { h, html } from './dom';
import { icons } from './icons';

export interface ModalHandle {
  close(): void;
  readonly body: HTMLElement;
}

interface ModalOpts {
  title: string;
  content: Node;
  onClose?: () => void;
}

/** Stack of open modals; Esc closes the top one. */
const stack: ModalHandle[] = [];

export function openModal({ title, content, onClose }: ModalOpts): ModalHandle {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;

  const closeBtn = h('button', { type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': 'Close' });
  closeBtn.append(html(icons.close));

  const body = h('div', { class: 'modal__body' }, content);
  const dialog = h(
    'div',
    { class: 'modal panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'modal__head' }, h('h2', { id: titleId }, title), closeBtn),
    body,
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, dialog);

  let closed = false;
  const handle: ModalHandle = {
    body,
    close() {
      if (closed) return;
      closed = true;
      backdrop.remove();
      const i = stack.indexOf(handle);
      if (i >= 0) stack.splice(i, 1);
      onClose?.();
      previouslyFocused?.focus?.({ preventScroll: true });
    },
  };

  closeBtn.addEventListener('click', () => handle.close());
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) handle.close();
  });
  // Keep Tab focus inside the dialog.
  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusables = dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.body.appendChild(backdrop);
  stack.push(handle);
  closeBtn.focus({ preventScroll: true });
  return handle;
}

/** Close the top-most modal. Returns true if one was open. */
export function closeTopModal(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function isModalOpen(): boolean {
  return stack.length > 0;
}
