import { button, h, html } from './dom';
import { icons } from './icons';
import { openModal, type ModalHandle } from './Modal';

/**
 * URL classmates should open on their phones.
 * Set VITE_PUBLIC_URL at build time (the deploy workflow does this); otherwise
 * fall back to the current page without its #route.
 */
export function publicUrl(): string {
  const env = import.meta.env.VITE_PUBLIC_URL?.trim();
  if (env) return env;
  return window.location.href.split('#')[0] ?? window.location.href;
}

function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

/** "Scan to play" dialog with a QR code of the game URL. */
export function openQrCard(): ModalHandle {
  const url = publicUrl();
  const codeBox = h('div', { class: 'qr__code', role: 'img', 'aria-label': `QR code for ${url}` });
  const copyBtn = button('Copy link', {
    icon: icons.copy,
    className: 'btn--small btn--ghost',
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.querySelector('span')!.textContent = 'Copied!';
      } catch {
        copyBtn.querySelector('span')!.textContent = 'Copy failed';
      }
    },
  });

  const content = h(
    'div',
    { class: 'qr' },
    h('p', { class: 'dim', style: 'margin:0' }, 'Point your phone camera here to join the game.'),
    codeBox,
    h('div', { class: 'qr__url' }, url),
    copyBtn,
    isLocalHost(url)
      ? h(
          'div',
          { class: 'note' },
          'This is a localhost address, so phones can’t open it. Use the “Network” URL that ',
          h('code', {}, 'npm run dev'),
          ' prints (same Wi-Fi), or deploy to GitHub Pages.',
        )
      : null,
  );

  // qrcode is loaded on demand so it doesn't weigh down the first paint.
  void import('qrcode')
    .then((QR) =>
      QR.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#05060f', light: '#ffffff' } }),
    )
    .then((svg) => codeBox.append(html(svg)))
    .catch(() => {
      codeBox.textContent = 'Could not generate QR code.';
    });

  return openModal({ title: 'Scan to play', content });
}
