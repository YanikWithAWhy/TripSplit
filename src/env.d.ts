interface ImportMetaEnv {
  /** Project URL, e.g. https://abcdefgh.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /** Publishable key (sb_publishable_…) or the legacy anon key. Safe to ship to browsers. */
  readonly VITE_SUPABASE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
