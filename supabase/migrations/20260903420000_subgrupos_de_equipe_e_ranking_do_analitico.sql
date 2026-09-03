-- ═══════════════════════════════════════════════════════════════════════════
-- Subgrupos dentro da equipe, destaques por grupo e ranking configurável
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que aconteceu na operação
--
-- Um líder saiu. A divisão que existia embaixo dele deixou de existir, e para
-- não perder a contabilidade de recebimento POR EQUIPE todo mundo foi jogado
-- numa equipe só. O número da equipe voltou a fechar; a leitura de quem produz
-- dentro dela sumiu.
--
-- A saída poderia ser recriar equipes — e recriar equipe muda o recebimento,
-- muda meta, muda quem lidera, muda o retrato do mês. Muito estrago para uma
-- divisão que é interna à equipe e pode mudar de novo no mês que vem.
--
-- Então a divisão passa a existir DENTRO da equipe, como subgrupo. A equipe
-- continua sendo a unidade que soma dinheiro; o subgrupo é só um recorte de
-- leitura por cima dela. Nada que hoje conta por `equipe_id` muda de resposta.
--
-- ## As três coisas que esta migration cria
--
-- 1. `equipe_subgrupos` + `perfis.subgrupo_id` — a divisão interna.
-- 2. `fn_analitico_destaques_dia_por_grupo` — um destaque por grupo, por dia,
--    em vez do único destaque do dia inteiro.
-- 3. `analitico_ranking_config` — a gerência do setor escolhe o critério do
--    ranking e quem participa dele.
--
-- ## Por que uma pessoa cabe em UM subgrupo
--
-- `perfis.subgrupo_id` espelha o `perfis.equipe_id` que já existe, e a pergunta
-- que a tela faz é sempre «em qual grupo esta pessoa é contada?». Com N:N essa
-- pergunta passa a ter várias respostas e o destaque do dia teria que escolher
-- uma — ou repetir a mesma pessoa em dois cards. Um vínculo só mantém a soma
-- por grupo igual à soma da equipe.

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. A tabela dos subgrupos ───────────────────────────────────────────────
--
-- `empresa_id` é redundante com `equipes.empresa_id` de propósito: TODA policy
-- daqui é `fn_can_access_empresa(empresa_id)`, e sem a coluna cada verificação
-- viraria um JOIN em `equipes` dentro da policy — o padrão que
-- `security-rls-performance` manda evitar.

CREATE TABLE IF NOT EXISTS public.equipe_subgrupos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  equipe_id  UUID NOT NULL REFERENCES public.equipes(id)  ON DELETE CASCADE,
  nome       TEXT NOT NULL CHECK (btrim(nome) <> ''),
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL
);

-- Dois subgrupos com o mesmo nome na mesma equipe são indistinguíveis na tela
-- do destaque — o operador apareceria "no Sub-A" duas vezes, em dois cards.
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipe_subgrupos_equipe_nome
  ON public.equipe_subgrupos (equipe_id, lower(btrim(nome)));

CREATE INDEX IF NOT EXISTS idx_equipe_subgrupos_equipe
  ON public.equipe_subgrupos (equipe_id);
CREATE INDEX IF NOT EXISTS idx_equipe_subgrupos_empresa
  ON public.equipe_subgrupos (empresa_id);

COMMENT ON TABLE public.equipe_subgrupos IS
  'Divisao interna de uma equipe. Recorte de LEITURA: o recebimento continua '
  'somando por equipe_id — o subgrupo so separa quem aparece com quem.';

ALTER TABLE public.equipe_subgrupos ENABLE ROW LEVEL SECURITY;

-- Ler é como ler `equipes`: a empresa inteira. Quem não pode ver a equipe já
-- não chega até aqui, porque o subgrupo só é útil junto com ela.
DROP POLICY IF EXISTS equipe_subgrupos_select ON public.equipe_subgrupos;
CREATE POLICY equipe_subgrupos_select ON public.equipe_subgrupos
FOR SELECT USING ((SELECT public.fn_can_access_empresa(empresa_id)));

-- Escrever é a MESMA chave que já governa mexer na composição da equipe
-- (líderes e clones). Criar subgrupo é dividir a composição; não merece uma
-- chave nova que a gerência teria que descobrir que existe.
DROP POLICY IF EXISTS equipe_subgrupos_write ON public.equipe_subgrupos;
CREATE POLICY equipe_subgrupos_write ON public.equipe_subgrupos
FOR ALL USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('equipes_gerenciar_composicao'))
) WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('equipes_gerenciar_composicao'))
);

DROP POLICY IF EXISTS equipe_subgrupos_super_admin ON public.equipe_subgrupos;
CREATE POLICY equipe_subgrupos_super_admin ON public.equipe_subgrupos
FOR ALL TO authenticated
USING ((SELECT public.fn_user_is_super_admin()))
WITH CHECK ((SELECT public.fn_user_is_super_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipe_subgrupos TO authenticated;

-- ── 2. O vínculo da pessoa com o subgrupo ───────────────────────────────────

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS subgrupo_id UUID
    REFERENCES public.equipe_subgrupos(id) ON DELETE SET NULL;

-- FK sem índice é varredura em todo CASCADE e em todo JOIN por grupo
-- (`schema-foreign-key-indexes`). Parcial porque a coluna nasce nula para a
-- empresa inteira e só uma fração vai preenchê-la.
CREATE INDEX IF NOT EXISTS idx_perfis_subgrupo
  ON public.perfis (subgrupo_id) WHERE subgrupo_id IS NOT NULL;

COMMENT ON COLUMN public.perfis.subgrupo_id IS
  'Subgrupo dentro da equipe_id. Zerado automaticamente quando nao pertence a '
  'equipe da pessoa — ver trigger trg_perfis_subgrupo_coerente.';

/*
 * O subgrupo tem que ser da equipe da pessoa.
 *
 * E quando não for, ele é ZERADO, não recusado. O motivo é o arrastar-e-soltar
 * de `AdminEquipes.tsx`: mover alguém de equipe é um `UPDATE perfis SET
 * equipe_id = ...` que não sabe que subgrupo existe. Levantar exceção ali
 * quebraria o gesto mais usado da tela para proteger uma coluna nova.
 *
 * Zerar diz a verdade: quem mudou de equipe deixou o subgrupo da equipe velha,
 * e alguém escolhe o novo na tela.
 */
CREATE OR REPLACE FUNCTION public.fn_perfis_subgrupo_coerente()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_equipe_do_subgrupo UUID;
BEGIN
  IF NEW.subgrupo_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sg.equipe_id INTO v_equipe_do_subgrupo
    FROM public.equipe_subgrupos sg
   WHERE sg.id = NEW.subgrupo_id;

  IF v_equipe_do_subgrupo IS DISTINCT FROM NEW.equipe_id THEN
    NEW.subgrupo_id := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_perfis_subgrupo_coerente ON public.perfis;
CREATE TRIGGER trg_perfis_subgrupo_coerente
  BEFORE INSERT OR UPDATE OF equipe_id, subgrupo_id ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_perfis_subgrupo_coerente();

-- ── 3. Destaques do dia, um por grupo ───────────────────────────────────────
--
-- Função NOVA em vez de `CREATE OR REPLACE` na antiga: o retorno ganha colunas,
-- e Postgres recusa trocar o tipo de retorno de uma função existente. A antiga
-- fica de pé — `fn_analitico_destaques_dia` continua respondendo o destaque
-- único para qualquer tela que ainda peça isso.
--
-- ## O que é "grupo" aqui
--
-- O subgrupo da pessoa quando ela tem um; a equipe dela quando não tem. É a
-- regra que o pedido descreve: «caso uma equipe não possua subgrupos, o filtro
-- considera a própria equipe normalmente».
--
-- Quem não tem equipe nenhuma entra com `grupo_id` nulo. Some-los num grupo
-- "Sem equipe" é feio na tela e é exatamente por isso que fica assim: um
-- destaque órfão é um pedido de alocação, e escondê-lo só adiaria o conserto.
--
-- ## O clone continua no grupo de origem
--
-- `equipe_operadores_clones` entra no FILTRO (a equipe emprestada enxerga a
-- pessoa) mas não no AGRUPAMENTO. Se entrasse, a mesma pessoa seria destaque
-- de dois grupos no mesmo dia com o mesmo dinheiro, e a soma dos destaques
-- deixaria de bater com a soma das equipes.

CREATE OR REPLACE FUNCTION public.fn_analitico_destaques_dia_por_grupo(
  p_empresa_id UUID,
  p_mes        TEXT,
  p_equipe_id  UUID DEFAULT NULL,
  p_setor_id   UUID DEFAULT NULL
)
RETURNS TABLE (
  dia              DATE,
  grupo_id         UUID,
  grupo_nome       TEXT,
  grupo_tipo       TEXT,
  equipe_id        UUID,
  equipe_nome      TEXT,
  operador_id      UUID,
  operador_usuario TEXT,
  operador_nome    TEXT,
  total_recebido   NUMERIC,
  total_pagamentos BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Mesma porta da função de destaque único: quem podia ver o destaque do dia
  -- vê os destaques por grupo. Operador não entra — esta é leitura de gestão.
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_has_any_role(
              ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
            )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (d.dia, d.grupo_id)
    d.dia,
    d.grupo_id,
    d.grupo_nome,
    d.grupo_tipo,
    d.equipe_id,
    d.equipe_nome,
    d.operador_id,
    d.operador_usuario,
    p.nome AS operador_nome,
    d.total_recebido,
    d.total_pagamentos
  FROM (
    SELECT
      ar.data_pagamento                     AS dia,
      COALESCE(sg.id, eq.id)                AS grupo_id,
      COALESCE(sg.nome, eq.nome)            AS grupo_nome,
      CASE WHEN sg.id IS NOT NULL THEN 'subgrupo' ELSE 'equipe' END AS grupo_tipo,
      eq.id                                 AS equipe_id,
      eq.nome                               AS equipe_nome,
      ar.operador_id,
      ar.operador_usuario,
      SUM(ar.valor_recebido)::NUMERIC       AS total_recebido,
      COUNT(*)::BIGINT                      AS total_pagamentos
    FROM public.analitico_recebimentos ar
    JOIN public.perfis pf            ON pf.id = ar.operador_id
    LEFT JOIN public.equipes eq      ON eq.id = pf.equipe_id
    -- O subgrupo só conta quando é da MESMA equipe da pessoa. O trigger já
    -- garante isso na escrita; a condição aqui é o cinto de segurança para as
    -- linhas que existirem antes dele.
    LEFT JOIN public.equipe_subgrupos sg
           ON sg.id = pf.subgrupo_id AND sg.equipe_id = pf.equipe_id
    WHERE ar.empresa_id     = p_empresa_id
      AND ar.operador_id    IS NOT NULL
      AND ar.data_pagamento >= (p_mes || '-01')::DATE
      AND ar.data_pagamento <= (
            DATE_TRUNC('month', (p_mes || '-01')::DATE)
            + INTERVAL '1 month' - INTERVAL '1 day'
          )::DATE
      -- Equipe: a de origem OU uma em que o operador é clone
      AND (
            p_equipe_id IS NULL
            OR pf.equipe_id = p_equipe_id
            OR EXISTS (
                 SELECT 1
                 FROM public.equipe_operadores_clones c
                 WHERE c.operador_id = ar.operador_id
                   AND c.equipe_id   = p_equipe_id
               )
          )
      -- Setor: o de origem OU o dono de uma equipe em que ele é clone
      AND (
            p_setor_id IS NULL
            OR eq.setor_id = p_setor_id
            OR EXISTS (
                 SELECT 1
                 FROM public.equipe_operadores_clones c
                 JOIN public.equipes ec ON ec.id = c.equipe_id
                 WHERE c.operador_id = ar.operador_id
                   AND ec.setor_id   = p_setor_id
               )
          )
    GROUP BY
      ar.data_pagamento, sg.id, sg.nome, eq.id, eq.nome,
      ar.operador_id, ar.operador_usuario
  ) d
  LEFT JOIN public.perfis p ON p.id = d.operador_id
  ORDER BY d.dia ASC, d.grupo_id, d.total_recebido DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_analitico_destaques_dia_por_grupo(UUID, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_analitico_destaques_dia_por_grupo(UUID, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_analitico_destaques_dia_por_grupo(UUID, TEXT, UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.fn_analitico_destaques_dia_por_grupo(UUID, TEXT, UUID, UUID) IS
  'Maior recebimento do dia de CADA equipe/subgrupo. Grupo = subgrupo da '
  'pessoa, ou a equipe dela quando nao ha subgrupo.';

-- ── 4. A configuração do ranking, por setor ─────────────────────────────────
--
-- Uma linha por setor, sem competência: a gerência configura uma vez e vale
-- daí em diante. Congelar por mês seria mais fiel ao histórico e cobraria uma
-- reconfiguração todo dia 1º — trabalho recorrente para uma decisão que muda
-- uma vez por semestre.
--
-- ## Os dois arrays, e por que vazio significa coisas diferentes em cada um
--
-- `grupos_incluidos` vazio = TODOS participam. É o estado em que a tabela
-- nasce, e é o comportamento de hoje: ninguém precisa configurar nada para o
-- ranking continuar funcionando como sempre funcionou. Listar grupos é um ato
-- de EXCLUSÃO deliberada («só estes»), que é como o pedido descreve o caso da
-- Elite.
--
-- `perfis_excluidos` vazio = ninguém excluído. Aqui a lista é do que sai, não
-- do que fica, porque tirar uma pessoa é a exceção e listar o setor inteiro
-- para manter todo mundo seria um formulário absurdo.

CREATE TABLE IF NOT EXISTS public.analitico_ranking_config (
  setor_id         UUID PRIMARY KEY REFERENCES public.setores(id)  ON DELETE CASCADE,
  empresa_id       UUID NOT NULL    REFERENCES public.empresas(id) ON DELETE CASCADE,
  criterio         TEXT NOT NULL DEFAULT 'recebimento'
                     CHECK (criterio IN ('recebimento', 'percentual', 'equipes')),
  grupos_incluidos UUID[] NOT NULL DEFAULT '{}'::UUID[],
  perfis_excluidos UUID[] NOT NULL DEFAULT '{}'::UUID[],
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por   UUID REFERENCES public.perfis(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_analitico_ranking_config_empresa
  ON public.analitico_ranking_config (empresa_id);

COMMENT ON TABLE public.analitico_ranking_config IS
  'Criterio e participantes do ranking do Analitico, por setor. Sem linha = '
  'ranking por recebimento com todo mundo, que e o comportamento historico.';
COMMENT ON COLUMN public.analitico_ranking_config.grupos_incluidos IS
  'Ids de equipe/subgrupo que participam. VAZIO = todos participam.';
COMMENT ON COLUMN public.analitico_ranking_config.perfis_excluidos IS
  'Ids de pessoas que ficam de fora. VAZIO = ninguem excluido.';

ALTER TABLE public.analitico_ranking_config ENABLE ROW LEVEL SECURITY;

-- Ler é para todo mundo da empresa: o ranking que o operador vê tem que ser o
-- mesmo que o líder vê, e o operador não tem a chave de configurar.
DROP POLICY IF EXISTS analitico_ranking_config_select ON public.analitico_ranking_config;
CREATE POLICY analitico_ranking_config_select ON public.analitico_ranking_config
FOR SELECT USING ((SELECT public.fn_can_access_empresa(empresa_id)));

DROP POLICY IF EXISTS analitico_ranking_config_write ON public.analitico_ranking_config;
CREATE POLICY analitico_ranking_config_write ON public.analitico_ranking_config
FOR ALL USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('analitico_ranking_configurar'))
) WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('analitico_ranking_configurar'))
);

DROP POLICY IF EXISTS analitico_ranking_config_super_admin ON public.analitico_ranking_config;
CREATE POLICY analitico_ranking_config_super_admin ON public.analitico_ranking_config
FOR ALL TO authenticated
USING ((SELECT public.fn_user_is_super_admin()))
WITH CHECK ((SELECT public.fn_user_is_super_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.analitico_ranking_config TO authenticated;

-- ── 5. A chave nova no catálogo de permissões ───────────────────────────────
--
-- `analitico_ranking_configurar` precisa existir nos DOIS catálogos: o de
-- TypeScript, que o painel desenha, e o de SQL, que semeia empresa nova e é o
-- que `fn_user_tem` consulta. `permissoes-catalogo.sql.test.ts` compara as duas
-- listas chave a chave justamente para esta metade não ser esquecida.
--
-- O catálogo é estendido por acumulação — a função nova soma um `VALUES` ao
-- resultado da anterior, sem reescrever o que já estava lá.

ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_ranking_20260903;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_ranking_20260903()
  UNION ALL
  SELECT * FROM (VALUES
    -- Sem `tenants`: a régua do ranking não é de um produto, é do Analítico,
    -- que existe nos dois. `padrao` = gerência e diretoria, como o pedido diz.
    ('analitico_ranking_configurar', NULL::TEXT[],
     ARRAY['gerencia','diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

REVOKE ALL ON FUNCTION public.fn_permissoes_catalogo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_permissoes_catalogo() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao de 20260903420000 acrescenta '
  'analitico_ranking_configurar sem reescrever o catalogo anterior.';

/*
 * Semeadura das empresas que já existem.
 *
 * `fn_user_tem` trata chave AUSENTE como negada, então sem este passo a
 * gerência veria o botão de configurar (o front decide pelo catálogo dele) e
 * levaria uma recusa da RLS ao salvar.
 *
 * Escrito nos dois sentidos, e não só onde é TRUE: cartão em branco no painel
 * não distingue «é não» de «ninguém decidiu ainda», e essa dúvida sobra para
 * quem for configurar depois.
 */
UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('analitico_ranking_configurar', TRUE)
 WHERE cargo IN ('gerencia', 'diretoria')
   AND NOT (permissoes ? 'analitico_ranking_configurar');

UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('analitico_ranking_configurar', FALSE)
 WHERE cargo NOT IN ('gerencia', 'diretoria')
   AND NOT (permissoes ? 'analitico_ranking_configurar');

COMMIT;
