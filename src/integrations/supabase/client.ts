/**
 * src/integrations/supabase/client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-exporta o cliente Supabase singleton já configurado em src/lib/supabase.ts.
 *
 * Este arquivo existe para compatibilidade com imports que usam o caminho
 * '@/integrations/supabase/client' (convenção gerada automaticamente).
 * O cliente real — com persistSession, autoRefreshToken e detectSessionInUrl —
 * é instanciado uma única vez em src/lib/supabase.ts.
 *
 * As credenciais são lidas do arquivo .env na raiz do projeto:
 *   VITE_SUPABASE_URL=...
 *   VITE_SUPABASE_ANON_KEY=...
 */
export { supabase } from '@/lib/supabase';
