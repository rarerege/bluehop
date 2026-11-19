/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public URL of the deployed game, used for the "Scan to play" QR code. */
  readonly VITE_PUBLIC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
