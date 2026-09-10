-- ─────────────────────────────────────────────────────────────────────────────
-- O `anon` para de avaliar policy que ele não tem como avaliar
--
-- ── O sintoma ────────────────────────────────────────────────────────────────
-- Em 24 h o log de produção acusou 371 erros de `insufficient_privilege`:
--
--     permission denied for function fn_user_acesso_multiempresa
--
-- 359 deles vieram do Realtime, como `PoolingReplicationError` — e cada um
-- derruba a replicação do canal, não só a linha. Os outros 12 vieram do
-- PostgREST, no papel `authenticator` sem sessão (JWT vencido, aba aberta a
-- noite toda, subscribe que sobe antes do login resolver).
--
-- ── A causa ──────────────────────────────────────────────────────────────────
-- As policies deste lote foram criadas sem cláusula `TO`, e o padrão do
-- Postgres nesse caso é `TO public` — que inclui o `anon`. Só que as funções
-- que elas chamam (`fn_user_acesso_multiempresa` e as sete abaixo) têm EXECUTE
-- para `authenticated` e `service_role`, nunca para `anon`. Resultado: a
-- requisição sem sessão não recebe "zero linhas", recebe ERRO — o Postgres
-- estoura ao avaliar a própria policy.
--
-- ── Por que TO authenticated, e não GRANT para o anon ────────────────────────
-- Dar EXECUTE ao `anon` calaria o log, mas pelo motivo errado: hoje o erro é o
-- que impede a RLS de rodar até o fim, e o `anon` tem SELECT e INSERT nestas 23
-- tabelas (grant padrão do Supabase). Destravar a função destrava a avaliação.
-- Fechar a policy é o caminho contrário: o `anon` deixa de ter policy
-- permissiva, colhe zero linha em silêncio, e a função nem é chamada.
--
-- Para quem está logado não muda nada — `public` já continha `authenticated`.
-- Nenhum fluxo anônimo do app lê tabela: o login usa as RPCs
-- `buscar_email_por_usuario*` e o cadastro usa `auth.signUp`, e ambos seguem
-- intocados.
--
-- De quebra some a maior parte dos 422 avisos de `multiple_permissive_policies`
-- do advisor, que eram contados para o papel `anon`.
--
-- ── Como voltar atrás ────────────────────────────────────────────────────────
--     ALTER POLICY <nome> ON public.<tabela> TO public;
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r      record;
  n      integer := 0;
  tabelas text[] := ARRAY[
    'acordos',
    'analitico_colchao_fora_meta',
    'analitico_exclusoes_setor',
    'analitico_recebimentos',
    'atendimento_responsaveis',
    'cargos_permissoes',
    'comemoracao_homenageados',
    'comemoracao_midias',
    'comemoracoes',
    'composicao_mes_lider',
    'composicao_mes_setor',
    'contribuicao_receptivo',
    'diario_recebimentos',
    'lixeira_acordos',
    'metas',
    'ouvidoria_atendimentos',
    'perfis',
    'perfis_transferencias',
    'profissionais',
    'solicitacoes_whatsapp',
    'solicitacoes_whatsapp_eventos',
    'solicitacoes_whatsapp_leitura',
    'solicitacoes_whatsapp_mensagens'
  ];
BEGIN
  FOR r IN
    SELECT pol.schemaname, pol.tablename, pol.policyname
      FROM pg_policies pol
     WHERE pol.schemaname = 'public'
       AND pol.tablename = ANY (tabelas)
       -- Só as que estão exatamente em `{public}`. As que alguém já apertou
       -- para `{authenticated}` ficam como estão.
       AND pol.roles = '{public}'::name[]
     ORDER BY pol.tablename, pol.policyname
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO authenticated',
      r.policyname, r.schemaname, r.tablename
    );
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'policies fechadas para authenticated: %', n;
END
$$;
