-- ============================================================================
-- Plantão Elite: recebimento hora a hora da dupla, no Painel Líder
-- ============================================================================
--
-- Pedido de 19/09/2026. O Receptivo (BookPlay) controla o plantão das Elites
-- numa planilha («CONTROLE ELITE.xlsx»): dia ÍMPAR é da dupla Tiago Almada +
-- Agatha Rocha, dia PAR de Matheus + Gabriel Oliveira. Cada faixa de hora
-- (08:30-09:00, 09:00-10:00 … 19:00-20:00) recebe à mão o quanto cada um
-- recebeu, com o acumulado, o resumo do dia e o total do Receptivo. A aba nova
-- do Painel Líder monta o mesmo quadro a partir do analítico.
--
-- ## De onde vem a HORA
--
-- O analítico não guarda a hora do pagamento: `data_pagamento` é DATE, e o
-- relatório 59 também só traz a data (`mestre_recebimentos.dt_pgto`). A única
-- hora que existe é a de CHEGADA: o robô do 59 roda no minuto :07 de cada hora
-- e, desde 20260918100000, grava `importado_em = now()` só na linha nova ou
-- alterada — a linha igual guarda a hora em que apareceu.
--
-- Esta função devolve a HORA DE CHEGADA (fuso de São Paulo) e a tela decide a
-- faixa: o que chegou entre 10:00 e 10:59 é o que foi pago até as 10h, então
-- conta na faixa 09:00-10:00. Linha alterada depois (valor corrigido no ERP)
-- muda de hora junto; é o preço de não haver hora no relatório.
--
-- ## Quem vê
--
-- Chave nova `painel_lider_sub_elite` (só BookPlay). Nasce ligada só para o
-- cargo `elite`. A Gerência NÃO recebe pelo cargo: o pedido é «só a gerência do
-- Receptivo», e cargo não tem setor. Quem é gerência lotada no setor das
-- Elites ganha a chave por EXCEÇÃO na pessoa (`perfis_permissoes`) — o mesmo
-- ajuste que o Admin faz à mão na tela de permissões.
--
-- Quem é da dupla vê SÓ a própria dupla, em qualquer data. Quem não é (gerência,
-- administrador) vê a dupla do dia pela paridade, ou a que pedir.
--
-- ## As duplas
--
-- Tabela `elite_plantao`, uma linha por pessoa. Lida só pela função abaixo
-- (SECURITY DEFINER): a RLS fica ligada e sem policy.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. Catálogo de permissões
-- ============================================================================
--
-- O topo da cadeia é 20260915220000 (Fase 8 do Comercial); nenhuma migration
-- depois dela redefiniu `fn_permissoes_catalogo`. O congelamento abaixo repete,
-- chave por chave, o corpo atual da função — e é isso que o torna retrato.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo_antes_elite_20260919()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_acompanhamento_20260915()
  UNION ALL
  SELECT * FROM (VALUES
    ('ver_acompanhamento', ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),

    ('acompanhamento_escopo_individual',    ARRAY['comercial']::TEXT[],
       ARRAY[]::TEXT[], false),
    ('acompanhamento_escopo_equipe',        ARRAY['comercial']::TEXT[],
       ARRAY[]::TEXT[], false),
    ('acompanhamento_escopo_setor',         ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite']::TEXT[], false),
    ('acompanhamento_escopo_todos_setores', ARRAY['comercial']::TEXT[],
       ARRAY['gerencia','diretoria']::TEXT[], false),

    ('ver_feedbacks',       ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('registrar_feedbacks', ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia']::TEXT[], false),
    ('excluir_feedbacks',   ARRAY['comercial']::TEXT[],
       ARRAY['gerencia']::TEXT[], false),

    ('registrar_ausencias', ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia']::TEXT[], false),
    ('excluir_ausencias',   ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_elite_20260919() IS
  'Retrato do catalogo antes da chave do Plantao Elite (19/09/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_elite_20260919()
  UNION ALL
  SELECT * FROM (VALUES
    -- A aba Plantão Elite do Painel Líder. So BookPlay; nasce so no cargo
    -- elite. Gerencia do Receptivo recebe por excecao na pessoa (secao 5).
    ('painel_lider_sub_elite', ARRAY['bookplay']::TEXT[], ARRAY['elite']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. A extensao 20260919100000 adiciona a chave da aba '
  'Plantao Elite do Painel Lider (BookPlay).';

-- ============================================================================
-- 2. As duplas do plantão
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.elite_plantao (
  empresa_id UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  perfil_id  UUID        NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  plantao    TEXT        NOT NULL CHECK (plantao IN ('impar', 'par')),
  -- A coluna da pessoa no quadro: a mesma ordem da planilha (Tiago, Agatha;
  -- Matheus, Gabriel).
  ordem      SMALLINT    NOT NULL DEFAULT 1,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, perfil_id)
);

COMMENT ON TABLE public.elite_plantao IS
  'Quem faz o plantao Elite em dia impar e em dia par. Lida so por '
  'fn_elite_plantao_hora (SECURITY DEFINER); RLS ligada e sem policy.';

ALTER TABLE public.elite_plantao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.elite_plantao FROM anon, authenticated;

-- ============================================================================
-- 3. O quadro do dia
-- ============================================================================
--
-- Devolve, para a dupla e o dia:
--   membros   — id, nome, usuário, na ordem da planilha (`ordem`);
--   chegadas  — por pessoa e HORA DE CHEGADA (0-23), soma e quantidade.
--               Linha que chegou em dia posterior vem com hora 24; em dia
--               anterior, com hora 0;
--   setor     — total do dia no setor da dupla (o «Valor total do Receptivo»),
--               com a regra do card: carimbo do setor, sem as origens que o
--               setor tirou do acumulado no mês;
--   ultima_chegada — a chegada mais recente no setor naquele dia.
--
-- Sem a chave, erro 42501. Sem dupla cadastrada, `membros` vazio.

CREATE OR REPLACE FUNCTION public.fn_elite_plantao_hora(
  p_empresa_id UUID,
  p_data       DATE,
  p_plantao    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meu_plantao TEXT;
  v_plantao     TEXT;
  v_membros     UUID[];
  v_setor       UUID;
  v_mes         TEXT := to_char(p_data, 'YYYY-MM');
  v_resultado   JSONB;
BEGIN
  IF p_data IS NULL
     OR NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('painel_lider_sub_elite') THEN
    RAISE EXCEPTION 'Sem permissão para o Plantão Elite.' USING ERRCODE = '42501';
  END IF;

  SELECT ep.plantao INTO v_meu_plantao
    FROM public.elite_plantao ep
   WHERE ep.empresa_id = p_empresa_id
     AND ep.perfil_id  = auth.uid();

  -- Quem é da dupla vê a própria, sempre. Os demais: a pedida ou a do dia.
  v_plantao := COALESCE(
    v_meu_plantao,
    CASE WHEN p_plantao IN ('impar', 'par') THEN p_plantao END,
    CASE WHEN extract(day FROM p_data)::INT % 2 = 1 THEN 'impar' ELSE 'par' END
  );

  SELECT array_agg(ep.perfil_id) INTO v_membros
    FROM public.elite_plantao ep
   WHERE ep.empresa_id = p_empresa_id
     AND ep.plantao    = v_plantao;

  -- O setor da dupla: o de quem está nela (o Receptivo). Se um dia a dupla
  -- misturar setores, vale o da maioria — e o total continua sendo de um só.
  SELECT p.setor_id INTO v_setor
    FROM public.perfis p
   WHERE p.id = ANY(COALESCE(v_membros, '{}'))
     AND p.setor_id IS NOT NULL
   GROUP BY p.setor_id
   ORDER BY count(*) DESC, p.setor_id
   LIMIT 1;

  WITH
  membros AS (
    SELECT p.id, p.nome, p.usuario, ep.ordem
      FROM public.perfis p
      JOIN public.elite_plantao ep
        ON ep.perfil_id = p.id AND ep.empresa_id = p_empresa_id
     WHERE p.id = ANY(COALESCE(v_membros, '{}'))
  ),
  chegadas AS (
    SELECT ar.operador_id,
           CASE
             WHEN (ar.importado_em AT TIME ZONE 'America/Sao_Paulo')::DATE > p_data THEN 24
             WHEN (ar.importado_em AT TIME ZONE 'America/Sao_Paulo')::DATE < p_data THEN 0
             ELSE extract(hour FROM ar.importado_em AT TIME ZONE 'America/Sao_Paulo')::INT
           END AS hora,
           ar.valor_recebido
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id     = p_empresa_id
       AND ar.data_pagamento = p_data
       AND ar.operador_id    = ANY(COALESCE(v_membros, '{}'))
  ),
  -- A origem de cada linha do setor, na regra de `origemDaLinha`: o setor de
  -- quem cobrou na contribuição; senão o setor da equipe do operador, caindo
  -- no do cadastro; sem operador, a origem «sem operador» (NULL).
  do_setor AS (
    SELECT ar.valor_recebido, ar.importado_em,
           CASE
             WHEN ar.contribuicao_de_setor_id IS NOT NULL THEN ar.contribuicao_de_setor_id
             WHEN ar.operador_id IS NULL THEN NULL
             ELSE COALESCE(eq.setor_id, op.setor_id)
           END AS origem
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis  op ON op.id = ar.operador_id
      LEFT JOIN public.equipes eq ON eq.id = op.equipe_id
     WHERE v_setor IS NOT NULL
       AND ar.empresa_id     = p_empresa_id
       AND ar.data_pagamento = p_data
       AND ar.setor_id       = v_setor
  ),
  setor_conta AS (
    SELECT d.*
      FROM do_setor d
     WHERE NOT EXISTS (
       SELECT 1 FROM public.analitico_exclusoes_setor x
        WHERE x.empresa_id = p_empresa_id
          AND x.setor_id   = v_setor
          AND x.mes        = v_mes
          AND x.setor_origem_id IS NOT DISTINCT FROM d.origem)
  )
  SELECT jsonb_build_object(
    'data',        p_data,
    'plantao',     v_plantao,
    'sou_da_dupla', v_meu_plantao IS NOT NULL,
    'membros', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'usuario', m.usuario)
                       ORDER BY m.ordem, m.nome)
        FROM membros m), '[]'::JSONB),
    'chegadas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'operador_id', c.operador_id, 'hora', c.hora,
               'valor', c.total, 'qtd', c.qtd) ORDER BY c.operador_id, c.hora)
        FROM (SELECT operador_id, hora, sum(valor_recebido) AS total, count(*) AS qtd
                FROM chegadas GROUP BY operador_id, hora) c), '[]'::JSONB),
    'setor', CASE WHEN v_setor IS NULL THEN NULL ELSE jsonb_build_object(
      'id',    v_setor,
      'nome',  (SELECT s.nome FROM public.setores s WHERE s.id = v_setor),
      'total', COALESCE((SELECT sum(valor_recebido) FROM setor_conta), 0),
      'qtd',   (SELECT count(*) FROM setor_conta)
    ) END,
    'ultima_chegada', (SELECT max(importado_em) FROM do_setor)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_elite_plantao_hora(UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_elite_plantao_hora(UUID, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_elite_plantao_hora(UUID, DATE, TEXT) IS
  'Plantao Elite: recebimento da dupla por hora de CHEGADA no analitico '
  '(importado_em, fuso de Sao Paulo) e total do setor no dia. Exige '
  'painel_lider_sub_elite; quem e da dupla ve so a propria.';

-- ============================================================================
-- 4. Semear a chave
-- ============================================================================

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ============================================================================
-- 5. As duplas de hoje e a Gerência do Receptivo
-- ============================================================================
--
-- Os logins vêm do pedido. O do Matheus não veio: é a pessoa de cargo `elite`
-- cujo nome começa por Matheus. Cada um precisa casar com EXATAMENTE uma
-- pessoa ativa da BookPlay — senão a migration inteira volta atrás, com a
-- lista do que casou, em vez de gravar dupla errada.

DO $$
DECLARE
  v_empresa UUID;
  v_setor   UUID;
  v_falhas  TEXT := '';
  v_excecoes INTEGER;
  r RECORD;
BEGIN
  SELECT id INTO v_empresa FROM public.empresas WHERE slug = 'bookplay';
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Empresa bookplay não encontrada.';
  END IF;

  FOR r IN
    SELECT q.rotulo, q.plantao, q.ordem,
           array_agg(p.id)                                   AS ids,
           string_agg(p.nome || ' <' || coalesce(p.usuario, '-') || '>', ', ') AS achados
      FROM (VALUES
        ('tiago_almada',     'impar', 1, ARRAY['tiago_almada', 'thiago_almada'], NULL::TEXT),
        ('agatha_rocha',     'impar', 2, ARRAY['agatha_rocha', 'agata_rocha'],   NULL::TEXT),
        ('matheus (elite)',  'par',   1, NULL::TEXT[],                           'matheus%'),
        ('gabriel_oliveira', 'par',   2, ARRAY['gabriel_oliveira'],              NULL::TEXT)
      ) AS q(rotulo, plantao, ordem, logins, nome_like)
      LEFT JOIN public.perfis p
        ON p.empresa_id = v_empresa
       AND p.ativo
       AND NOT coalesce(p.arquivado, false)
       AND (
         lower(btrim(p.usuario)) = ANY(q.logins)
         OR (q.nome_like IS NOT NULL AND p.perfil = 'elite' AND lower(p.nome) LIKE q.nome_like)
       )
     GROUP BY q.rotulo, q.plantao, q.ordem
  LOOP
    IF cardinality(array_remove(r.ids, NULL)) <> 1 THEN
      v_falhas := v_falhas || format(E'\n  %s: %s', r.rotulo, coalesce(r.achados, 'ninguém'));
    ELSE
      INSERT INTO public.elite_plantao (empresa_id, perfil_id, plantao, ordem)
      VALUES (v_empresa, r.ids[1], r.plantao, r.ordem)
      ON CONFLICT (empresa_id, perfil_id)
      DO UPDATE SET plantao = excluded.plantao, ordem = excluded.ordem;
    END IF;
  END LOOP;

  IF v_falhas <> '' THEN
    RAISE EXCEPTION 'Plantão Elite: login sem exatamente uma pessoa ativa na BookPlay:%', v_falhas;
  END IF;

  -- O setor das Elites (o Receptivo): o de quem entrou nas duplas.
  SELECT p.setor_id INTO v_setor
    FROM public.elite_plantao ep
    JOIN public.perfis p ON p.id = ep.perfil_id
   WHERE ep.empresa_id = v_empresa AND p.setor_id IS NOT NULL
   GROUP BY p.setor_id
   ORDER BY count(*) DESC
   LIMIT 1;

  IF v_setor IS NULL THEN
    RAISE EXCEPTION 'Plantão Elite: as Elites cadastradas não têm setor.';
  END IF;

  -- Gerência lotada no setor das Elites: a chave por exceção na pessoa. Uma
  -- exceção que já existe para a chave (ligada ou desligada à mão) fica.
  --
  -- Quem está numa dupla e não tem cargo `elite` também entra: a dupla foi
  -- nomeada no pedido, e sem a chave a pessoa não abriria o próprio plantão.
  INSERT INTO public.perfis_permissoes (empresa_id, usuario_id, permissoes)
  SELECT v_empresa, p.id, jsonb_build_object('painel_lider_sub_elite', true)
    FROM public.perfis p
   WHERE p.empresa_id = v_empresa
     AND p.ativo
     AND NOT coalesce(p.arquivado, false)
     AND (
       (p.perfil = 'gerencia' AND p.setor_id = v_setor)
       OR (p.perfil NOT IN ('elite', 'administrador', 'super_admin')
           AND p.id IN (SELECT perfil_id FROM public.elite_plantao WHERE empresa_id = v_empresa))
     )
  ON CONFLICT (empresa_id, usuario_id) DO UPDATE
    SET permissoes    = perfis_permissoes.permissoes || excluded.permissoes,
        atualizado_em = now()
    WHERE NOT (perfis_permissoes.permissoes ? 'painel_lider_sub_elite');
  GET DIAGNOSTICS v_excecoes = ROW_COUNT;

  RAISE NOTICE 'Plantão Elite: 4 pessoas nas duplas; % exceção(ões) gravada(s).', v_excecoes;
END $$;

-- ============================================================================
-- 6. Verificar
-- ============================================================================

DO $$
DECLARE
  v_faltando TEXT;
  n INTEGER;
BEGIN
  SELECT string_agg(DISTINCT format('%s/%s/%s', emp.slug, cp.cargo, cat.chave), ', ')
    INTO v_faltando
    FROM public.empresas emp
    JOIN public.cargos_permissoes cp ON cp.empresa_id = emp.id
    CROSS JOIN public.fn_permissoes_catalogo() cat
   WHERE (cat.tenants IS NULL OR emp.slug = ANY(cat.tenants))
     AND cp.cargo <> 'rh'
     AND NOT (cp.permissoes ? cat.chave);

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves ausentes após semear: %', v_faltando;
  END IF;

  -- Testemunhas da cadeia: uma de cada elo que já se partiu ou veio antes.
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'tickets_excluir') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: tickets_excluir sumiu.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'excluir_indicacoes') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: excluir_indicacoes sumiu.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'excluir_ausencias') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: excluir_ausencias sumiu.';
  END IF;

  SELECT count(*) INTO n FROM public.fn_permissoes_catalogo() WHERE chave = 'painel_lider_sub_elite';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Esperava 1 painel_lider_sub_elite no catalogo, achei %', n;
  END IF;

  -- Só a Elite nasce com a chave; Gerência e o resto, não.
  SELECT count(*) INTO n
    FROM public.cargos_permissoes cp
    JOIN public.empresas emp ON emp.id = cp.empresa_id
   WHERE emp.slug = 'bookplay'
     AND cp.cargo NOT IN ('elite', 'administrador', 'super_admin')
     AND (cp.permissoes ->> 'painel_lider_sub_elite')::BOOLEAN;
  IF n <> 0 THEN
    RAISE EXCEPTION 'painel_lider_sub_elite ligada em % cargo(s) além da Elite', n;
  END IF;

  SELECT count(*) INTO n FROM public.elite_plantao;
  IF n <> 4 THEN
    RAISE EXCEPTION 'Esperava 4 Elites nas duplas, achei %', n;
  END IF;
END $$;

COMMIT;

-- Conferência (só leitura): as duplas e quem da Gerência ganhou a chave.
SELECT 'dupla ' || ep.plantao AS o_que, p.nome, p.usuario, p.perfil, s.nome AS setor
  FROM public.elite_plantao ep
  JOIN public.perfis p ON p.id = ep.perfil_id
  LEFT JOIN public.setores s ON s.id = p.setor_id
UNION ALL
SELECT 'excecao com a chave', p.nome, p.usuario, p.perfil, s.nome
  FROM public.perfis_permissoes pp
  JOIN public.perfis p ON p.id = pp.usuario_id
  LEFT JOIN public.setores s ON s.id = p.setor_id
 WHERE (pp.permissoes ->> 'painel_lider_sub_elite')::BOOLEAN
 ORDER BY 1, 2;
