-- ─────────────────────────────────────────────────────────────────────────────
-- O setor passa a carregar o código do ERP, e o vínculo do 59 deixa de ser a dedo
--
-- ── O problema ───────────────────────────────────────────────────────────────
-- Hoje cada carteira do relatório 59 é ligada a um setor MANUALMENTE, na aba
-- Relatório 59 do Painel Diretoria (`fn_mestre_vincular_grupo`). Funciona, mas
-- é trabalho repetido e frágil: nome de setor muda, carteira nova aparece, e
-- enquanto ninguém liga o dinheiro fica fora da conta. Em 10/09/2026 havia seis
-- carteiras sem setor, e uma delas — `MARILIA - COFEN` — carregava
-- R$ 741.778,11 do mês.
--
-- ── O que o relatório oferece ────────────────────────────────────────────────
-- Medido no `rel_59_202609.csv` (17.875 linhas, 28 colunas). Há três colunas de
-- código, e só uma serve:
--
--     NomeGrupoFiltro -> CodGrupoFiltro    16 valores, 0 ambíguos   ← esta
--     Setor           -> CodGrupo          28 valores, 1 ambíguo
--     NomeGrupoFiltro -> CodGrupo          16 valores, 9 ambíguos
--
-- `CodGrupoFiltro` é 1:1 com `NomeGrupoFiltro` nas DUAS direções — 16 códigos,
-- 16 nomes, nenhum código apontando para dois nomes. É coerente com o que a
-- conferência de 25/08 já havia estabelecido: quem reproduz o recorte do 58 é o
-- `NomeGrupoFiltro`, não o `Setor`. O código é a versão estável desse nome.
--
-- ── O desenho ────────────────────────────────────────────────────────────────
-- `setores.codigo_erp` guarda o `CodGrupoFiltro` daquele setor. Com isso o
-- vínculo deixa de ser um ato e vira uma consequência: carteira que aparece no
-- 59 encontra sozinha o setor que reivindicou o código dela.
--
-- Único por empresa, e só quando preenchido: dois setores com o mesmo código
-- dividiriam o mesmo dinheiro em silêncio, que é exatamente o erro que este
-- trabalho existe para impedir. O índice é parcial porque NULL é o estado
-- normal de quem ainda não configurou.
--
-- ── Por que uma trava própria para a coluna ──────────────────────────────────
-- `setores_update_permissao` deixa qualquer pessoa com `setores_criar_editar`
-- alterar a linha. Isso está certo para nome e situação, e está errado para
-- esta coluna: trocar o código de um setor REDIRECIONA o dinheiro de uma
-- carteira inteira. O pedido foi explícito — «somente superadmin tem acesso a
-- essa aba e poderá editar».
--
-- RLS não sabe recusar UMA coluna, então quem recusa é o gatilho
-- `trg_setor_codigo_erp_so_super_admin`. Ele deixa passar o UPDATE que não
-- encosta na coluna, e recusa o que encosta sem ser super_admin — inclusive
-- pelo PostgREST, que é por onde a aba Setores escreve.
--
-- ── O vínculo automático ─────────────────────────────────────────────────────
-- Duas portas, e de propósito só duas:
--
--   1. `trg_mestre_grupo_herda_setor` — BEFORE INSERT em `mestre_grupos`.
--      Carteira NOVA nasce já vinculada, se algum setor reivindicou o código.
--      Só no INSERT: no UPDATE (que é o `on conflict` da reimportação) a linha
--      já existe e já foi resolvida, e sobrescrever ali apagaria em silêncio um
--      vínculo manual que alguém fez de propósito.
--
--   2. `fn_setor_definir_codigo_erp` — ao gravar o código, resolve na hora a
--      carteira correspondente que já esteja na tabela. Sem isso, configurar o
--      código não faria nada visível até a próxima importação.
--
-- O que NÃO acontece: apagar o código não desfaz vínculo nenhum. Desfazer em
-- cascata a partir de um campo em branco é o tipo de efeito que ninguém espera
-- de um formulário. Para desfazer existe o vínculo manual, que continua no ar.
--
-- ── Como voltar atrás ────────────────────────────────────────────────────────
--     DROP TRIGGER trg_mestre_grupo_herda_setor ON public.mestre_grupos;
--     DROP TRIGGER trg_setor_codigo_erp_so_super_admin ON public.setores;
--     ALTER TABLE public.setores DROP COLUMN codigo_erp;
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 1. A coluna ════════════════════════════════════════════════════════════

ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS codigo_erp text;

COMMENT ON COLUMN public.setores.codigo_erp IS
  'CodGrupoFiltro do relatorio 59 que pertence a este setor. E por ele que a '
  'carteira do 59 encontra o setor sozinha. Only super_admin edita — ver '
  'trg_setor_codigo_erp_so_super_admin.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_setores_codigo_erp
  ON public.setores (empresa_id, codigo_erp)
  WHERE codigo_erp IS NOT NULL;

-- ═══ 2. A trava da coluna ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_setor_codigo_erp_so_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- UPDATE que não encosta na coluna segue o caminho normal: renomear setor e
  -- ativar/desativar continuam sendo de quem tem `setores_criar_editar`.
  IF NEW.codigo_erp IS NOT DISTINCT FROM OLD.codigo_erp THEN
    RETURN NEW;
  END IF;

  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION
      'CODIGO_ERP_SO_SUPER_ADMIN: o codigo do relatorio 59 so pode ser alterado pelo super_admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_setor_codigo_erp_so_super_admin ON public.setores;
CREATE TRIGGER trg_setor_codigo_erp_so_super_admin
  BEFORE UPDATE ON public.setores
  FOR EACH ROW EXECUTE FUNCTION public.fn_setor_codigo_erp_so_super_admin();

-- ═══ 3. Carteira nova nasce vinculada ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_mestre_grupo_herda_setor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_setor uuid;
BEGIN
  IF NEW.setor_id IS NOT NULL OR NEW.cod_grupo_filtro IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.id INTO v_setor
    FROM public.setores s
   WHERE s.empresa_id = NEW.empresa_id
     AND s.codigo_erp = NEW.cod_grupo_filtro
   LIMIT 1;

  IF v_setor IS NOT NULL THEN
    NEW.setor_id     := v_setor;
    NEW.estado       := 'vinculado';
    NEW.vinculado_em := now();
    NEW.observacao   := 'Vinculado pelo codigo do setor.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_mestre_grupo_herda_setor ON public.mestre_grupos;
CREATE TRIGGER trg_mestre_grupo_herda_setor
  BEFORE INSERT ON public.mestre_grupos
  FOR EACH ROW EXECUTE FUNCTION public.fn_mestre_grupo_herda_setor();

-- ═══ 4. Gravar o código, e resolver na hora ═════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_setor_definir_codigo_erp(
  p_setor_id uuid,
  p_codigo   text
)
RETURNS TABLE (setor_id uuid, codigo_erp text, carteira text, vinculou boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_empresa  uuid;
  v_codigo   text;
  v_dono     text;
  v_vinculou boolean := false;
  v_carteira text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION
      'CODIGO_ERP_SO_SUPER_ADMIN: o codigo do relatorio 59 so pode ser alterado pelo super_admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Campo em branco é «sem código», não string vazia: string vazia entraria no
  -- índice único e o segundo setor em branco seria recusado sem motivo visível.
  v_codigo := NULLIF(TRIM(COALESCE(p_codigo, '')), '');

  SELECT s.empresa_id INTO v_empresa FROM public.setores s WHERE s.id = p_setor_id;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'SETOR_NAO_ENCONTRADO: setor % nao existe.', p_setor_id;
  END IF;

  -- A mensagem do índice único é ilegível na tela. Aqui se diz de quem é.
  IF v_codigo IS NOT NULL THEN
    SELECT s.nome INTO v_dono
      FROM public.setores s
     WHERE s.empresa_id = v_empresa AND s.codigo_erp = v_codigo AND s.id <> p_setor_id
     LIMIT 1;
    IF v_dono IS NOT NULL THEN
      RAISE EXCEPTION
        'CODIGO_ERP_EM_USO: o codigo % ja e do setor "%". Um codigo pertence a um setor so.',
        v_codigo, v_dono;
    END IF;
  END IF;

  UPDATE public.setores s SET codigo_erp = v_codigo WHERE s.id = p_setor_id;

  -- Resolve agora a carteira que já está na tabela. Sem isto, configurar o
  -- código não mudaria nada visível até a próxima importação do 59.
  IF v_codigo IS NOT NULL THEN
    UPDATE public.mestre_grupos g
       SET setor_id      = p_setor_id,
           estado        = 'vinculado',
           vinculado_por_id = (SELECT auth.uid()),
           vinculado_em  = now(),
           observacao    = 'Vinculado pelo codigo do setor.',
           atualizado_em = now()
     WHERE g.empresa_id = v_empresa
       AND g.cod_grupo_filtro = v_codigo
       AND g.setor_id IS DISTINCT FROM p_setor_id
    RETURNING g.nome_grupo_filtro INTO v_carteira;
    v_vinculou := v_carteira IS NOT NULL;

    IF v_carteira IS NULL THEN
      SELECT g.nome_grupo_filtro INTO v_carteira
        FROM public.mestre_grupos g
       WHERE g.empresa_id = v_empresa AND g.cod_grupo_filtro = v_codigo
       LIMIT 1;
    END IF;
  END IF;

  RETURN QUERY SELECT p_setor_id, v_codigo, v_carteira, v_vinculou;
END;
$function$;

COMMENT ON FUNCTION public.fn_setor_definir_codigo_erp(uuid, text) IS
  'Grava o CodGrupoFiltro do setor e resolve na hora a carteira do 59 que usa '
  'esse codigo. Só super_admin. Apagar o codigo NAO desfaz vinculo — para '
  'desfazer existe o vinculo manual.';

REVOKE ALL ON FUNCTION public.fn_setor_definir_codigo_erp(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_setor_definir_codigo_erp(uuid, text) TO authenticated;

-- ═══ 5. O que a aba lê ══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_setores_codigos_erp(p_empresa_id uuid)
RETURNS TABLE (
  setor_id     uuid,
  setor_nome   text,
  ativo        boolean,
  codigo_erp   text,
  carteira     text,
  carteira_ok  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.nome, s.ativo, s.codigo_erp,
         g.nome_grupo_filtro,
         -- O código está preenchido E existe no 59 importado? Código digitado
         -- errado fica visível aqui em vez de virar dinheiro que não aparece.
         (s.codigo_erp IS NOT NULL AND g.cod_grupo_filtro IS NOT NULL)
    FROM public.setores s
    LEFT JOIN public.mestre_grupos g
           ON g.empresa_id = s.empresa_id
          AND g.cod_grupo_filtro = s.codigo_erp
   WHERE s.empresa_id = p_empresa_id
     AND public.fn_can_access_empresa(s.empresa_id)
   ORDER BY s.ativo DESC, s.nome;
$function$;

COMMENT ON FUNCTION public.fn_setores_codigos_erp(uuid) IS
  'Os setores da empresa com o codigo do 59 e a carteira que ele encontra. '
  'Alimenta a aba de configuracao do Painel Diretoria.';

REVOKE ALL ON FUNCTION public.fn_setores_codigos_erp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_setores_codigos_erp(uuid) TO authenticated;
