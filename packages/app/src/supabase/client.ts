import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase のクライアント（1 つだけ作る）。認証は PKCE フロー（06 章 §0.1）。
 * URL と anon キーは環境変数から読む。service_role キーはフロントエンドに絶対に含めない（CLAUDE.md §10）。
 * 環境変数が無いとき（設定前の開発環境など）は null（アプリはメンテナンス中として表示する）。
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
