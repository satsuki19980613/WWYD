/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase プロジェクトの URL（.env.example 参照） */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase の anon（public）キー。フロントエンドに含めてよいのはこのキーだけ */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
