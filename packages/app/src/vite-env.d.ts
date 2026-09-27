/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Neon Auth の URL（詳細仕様 12 章 §7.1。公開の住所で秘密ではない） */
  readonly VITE_NEON_AUTH_URL?: string;
  /** Neon Data API の URL（同上） */
  readonly VITE_NEON_DATA_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
