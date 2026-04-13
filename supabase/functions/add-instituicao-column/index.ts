import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (_req) => {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )

  // Executar DDL via rpc ou query direta
  const { data, error } = await supabaseAdmin.rpc('exec_ddl', {
    sql: "ALTER TABLE public.acordos ADD COLUMN IF NOT EXISTS instituicao TEXT"
  })

  return new Response(JSON.stringify({ data, error }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
