-- ============================================================================
-- RH › Quadro de Pessoal › Histórico do mês (13/11/2026)
-- ============================================================================
--
-- O RH pediu o histórico de movimentação das pessoas num mês, separado por
-- cidade: transferências, mudanças de cargo, desligamentos, reativações,
-- entradas, trocas de equipe, afastamentos e férias.
--
-- Spec: docs/superpowers/specs/2026-11-13-rh-historico-do-mes-design.md
--
-- ## Por que uma função, e não `ver_logs` para o RH
--
-- `logs_sistema` abre só com `ver_logs`, e liberar isso ao RH entregaria tudo
-- (IP, acordos, financeiro). A função lê o log por dentro e devolve só os
-- eventos de pessoas, já traduzidos. Nada é gravado.
--
-- ## Duas camadas
--
-- `fn_rh_historico_mes_eventos` é `language sql`: o Postgres valida o corpo na
-- criação (plpgsql só valida ao executar — ver memória «plpgsql só valida em
-- execução»). Não é exposta: sem EXECUTE para authenticated.
-- `fn_rh_historico_mes` é a porta (plpgsql, SECURITY DEFINER): confere a
-- permissão e as empresas e chama a de dentro.
--
-- ## Leitura do log
--
-- `antes`/`depois` guardam só os campos que mudaram. O valor de um campo no
-- instante T é o `antes` da PRIMEIRA mudança posterior a T, ou o valor de hoje
-- (memória «logs reconstroem o passado»). Sempre `->` (jsonb) e `#>> '{}'`,
-- nunca `->>` direto no COALESCE: campo NULL viraria SQL NULL e cairia no
-- valor de hoje.
--
-- Índices usados: idx_logs_empresa_tabela_criado (empresa_id, tabela,
-- criado_em) para o mês, idx_logs_registro (registro_id, criado_em) para a
-- reconstrução. Nenhum índice novo.
--
-- ## Limites conhecidos
--
-- * Setor de afastamento/férias é o setor de HOJE da pessoa (ausência não
--   passa pelo log de perfis).
-- * A cidade de um setor é a de hoje (`setores.cidade_id`).
-- * Cúpula fora: cargo no instante do evento `super_admin` ou `diretoria`,
--   e contas de sistema (`perfis.robo`).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_rh_historico_mes_eventos(p_empresas uuid[], p_mes date)
RETURNS TABLE (
  tipo            text,
  dia             date,
  pessoa_id       uuid,
  pessoa_nome     text,
  cargo           text,
  empresa_id      uuid,
  setor_de_id     uuid,
  setor_de_nome   text,
  cidade_de       text,
  setor_para_id   uuid,
  setor_para_nome text,
  cidade_para     text,
  valor_de        text,
  valor_para      text,
  sentido         text,
  ausencia_tipo   text,
  ausencia_rotulo text,
  inicio          date,
  fim             date,
  feito_por       text
)
LANGUAGE sql
STABLE
AS $fn$
  WITH
  janela AS (
    SELECT date_trunc('month', p_mes)::date                                         AS ini,
           (date_trunc('month', p_mes) + interval '1 month')::date                  AS fim,
           (date_trunc('month', p_mes)::timestamp) AT TIME ZONE 'America/Sao_Paulo' AS ini_ts,
           ((date_trunc('month', p_mes) + interval '1 month')::timestamp)
             AT TIME ZONE 'America/Sao_Paulo'                                        AS fim_ts
  ),

  -- As alterações de perfis no mês que interessam ao RH.
  mudancas AS (
    SELECT l.criado_em,
           (l.criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia_log,
           l.empresa_id                                         AS emp,
           l.registro_id,
           -- O filtro de formato está no WHERE, mas o Postgres não garante a
           -- ordem: o CASE impede o cast de estourar num registro estranho.
           CASE WHEN l.registro_id ~* '^[0-9a-f-]{36}$' THEN l.registro_id::uuid END AS pid,
           l.acao,
           COALESCE(l.campos, ARRAY[]::text[])                  AS campos,
           COALESCE(l.antes,  '{}'::jsonb)                      AS antes,
           COALESCE(l.depois, '{}'::jsonb)                      AS depois,
           l.usuario_nome,
           l.alvo_rotulo
      FROM public.logs_sistema l, janela j
     WHERE l.empresa_id = ANY (p_empresas)
       AND l.tabela = 'perfis'
       AND l.criado_em >= j.ini_ts
       AND l.criado_em <  j.fim_ts
       AND l.registro_id ~* '^[0-9a-f-]{36}$'
       AND (
             l.acao LIKE '%\_criado'
          OR COALESCE(l.campos, ARRAY[]::text[]) && ARRAY['setor_id', 'equipe_id', 'perfil', 'situacao']
       )
  ),

  -- Cada mudança com o setor e o cargo DEPOIS dela (o estado no instante).
  com_estado AS (
    SELECT m.*,
           p.nome         AS nome_hoje,
           p.robo         AS robo,
           p.desligado_em AS desligado_hoje,
           CASE WHEN m.depois ? 'setor_id' THEN m.depois -> 'setor_id'
                ELSE COALESCE(
                  (SELECT l2.antes -> 'setor_id'
                     FROM public.logs_sistema l2
                    WHERE l2.registro_id = m.registro_id
                      AND l2.tabela = 'perfis'
                      AND l2.criado_em > m.criado_em
                      AND l2.antes ? 'setor_id'
                    ORDER BY l2.criado_em
                    LIMIT 1),
                  to_jsonb(p.setor_id))
           END #>> '{}' AS setor_txt,
           CASE WHEN m.depois ? 'perfil' THEN m.depois -> 'perfil'
                ELSE COALESCE(
                  (SELECT l2.antes -> 'perfil'
                     FROM public.logs_sistema l2
                    WHERE l2.registro_id = m.registro_id
                      AND l2.tabela = 'perfis'
                      AND l2.criado_em > m.criado_em
                      AND l2.antes ? 'perfil'
                    ORDER BY l2.criado_em
                    LIMIT 1),
                  to_jsonb(p.perfil))
           END #>> '{}' AS cargo_txt
      FROM mudancas m
      LEFT JOIN public.perfis p ON p.id = m.pid
  ),

  -- Um evento por tipo de mudança: um mesmo UPDATE pode virar dois.
  eventos_log AS (
    -- Entrada
    SELECT 'entrada'::text AS ev_tipo, e.dia_log AS ev_dia, e.*,
           NULL::text AS de_txt, e.setor_txt AS para_txt,
           NULL::text AS v_de, NULL::text AS v_para
      FROM com_estado e
     WHERE e.acao LIKE '%\_criado'

    UNION ALL
    -- Transferência de setor
    SELECT 'transferencia', e.dia_log, e.*,
           e.antes #>> '{setor_id}', e.depois #>> '{setor_id}',
           NULL, NULL
      FROM com_estado e
     WHERE e.acao NOT LIKE '%\_criado'
       AND 'setor_id' = ANY (e.campos)

    UNION ALL
    -- Troca de equipe no mesmo setor. A saída da equipe de quem foi desligado
    -- (virada do mês) não é troca: é consequência do desligamento.
    SELECT 'troca_equipe', e.dia_log, e.*,
           e.setor_txt, e.setor_txt,
           e.antes #>> '{equipe_id}', e.depois #>> '{equipe_id}'
      FROM com_estado e
     WHERE e.acao NOT LIKE '%\_criado'
       AND 'equipe_id' = ANY (e.campos)
       AND NOT ('setor_id' = ANY (e.campos))
       AND NOT (e.depois -> 'equipe_id' = 'null'::jsonb AND e.desligado_hoje IS NOT NULL)

    UNION ALL
    -- Mudança de cargo
    SELECT 'cargo', e.dia_log, e.*,
           e.setor_txt, e.setor_txt,
           e.antes #>> '{perfil}', e.depois #>> '{perfil}'
      FROM com_estado e
     WHERE e.acao NOT LIKE '%\_criado'
       AND 'perfil' = ANY (e.campos)

    UNION ALL
    -- Desligamento: o dia é o informado no cadastro, quando houver.
    SELECT 'desligamento',
           COALESCE(
             ((NULLIF(e.depois #>> '{desligado_em}', ''))::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date,
             (e.desligado_hoje AT TIME ZONE 'America/Sao_Paulo')::date,
             e.dia_log),
           e.*,
           e.setor_txt, e.setor_txt,
           e.antes #>> '{situacao}', 'desligado'
      FROM com_estado e
     WHERE e.acao NOT LIKE '%\_criado'
       AND 'situacao' = ANY (e.campos)
       AND e.depois #>> '{situacao}' = 'desligado'

    UNION ALL
    -- Reativação
    SELECT 'reativacao', e.dia_log, e.*,
           e.setor_txt, e.setor_txt,
           'desligado', e.depois #>> '{situacao}'
      FROM com_estado e
     WHERE e.acao NOT LIKE '%\_criado'
       AND 'situacao' = ANY (e.campos)
       AND e.antes  #>> '{situacao}' = 'desligado'
       AND e.depois #>> '{situacao}' IS DISTINCT FROM 'desligado'
  ),

  -- Afastamentos e férias lançados (tabela `ausencias`, das duas operações).
  eventos_ausencia AS (
    SELECT CASE WHEN a.tipo = 'ferias' THEN 'ferias' ELSE 'afastamento' END AS ev_tipo,
           GREATEST(a.inicio, j.ini) AS ev_dia,
           a.operador_id             AS pid,
           p.nome, p.perfil, p.robo,
           a.empresa_id              AS emp,
           p.setor_id::text          AS setor_txt,
           a.tipo                    AS a_tipo,
           t.rotulo                  AS a_rotulo,
           a.inicio                  AS a_inicio,
           a.fim                     AS a_fim,
           autor.nome                AS autor
      FROM public.ausencias a
      CROSS JOIN janela j
      JOIN public.perfis p           ON p.id = a.operador_id
      LEFT JOIN public.ausencias_tipos t ON t.tipo = a.tipo
      LEFT JOIN public.perfis autor  ON autor.id = a.criado_por
     WHERE a.empresa_id = ANY (p_empresas)
       AND a.inicio <  j.fim
       AND a.fim    >= j.ini

    UNION ALL
    -- Férias marcadas só no cadastro (sem linha em `ausencias`).
    SELECT 'ferias', GREATEST(p.ferias_desde, j.ini), p.id,
           p.nome, p.perfil, p.robo,
           p.empresa_id, p.setor_id::text,
           'ferias', 'Férias',
           p.ferias_desde, COALESCE(p.ferias_ate, DATE '9999-12-31'),
           NULL::text
      FROM public.perfis p
      CROSS JOIN janela j
     WHERE p.empresa_id = ANY (p_empresas)
       AND p.ferias_desde IS NOT NULL
       AND p.ferias_desde < j.fim
       AND COALESCE(p.ferias_ate, DATE '9999-12-31') >= j.ini
       AND NOT EXISTS (
             SELECT 1 FROM public.ausencias a2
              WHERE a2.operador_id = p.id
                AND a2.tipo = 'ferias'
                AND a2.inicio <= COALESCE(p.ferias_ate, DATE '9999-12-31')
                AND a2.fim    >= p.ferias_desde)
  ),

  todos AS (
    SELECT e.ev_tipo, e.ev_dia, e.pid,
           COALESCE(e.nome_hoje, e.alvo_rotulo, 'Pessoa removida') AS nome,
           e.cargo_txt AS cargo_ev, e.robo, e.emp,
           e.de_txt, e.para_txt, e.v_de, e.v_para,
           NULL::text AS a_tipo, NULL::text AS a_rotulo,
           NULL::date AS a_inicio, NULL::date AS a_fim,
           COALESCE(e.usuario_nome, 'Sistema') AS autor
      FROM eventos_log e
    UNION ALL
    SELECT a.ev_tipo, a.ev_dia, a.pid, a.nome, a.perfil, a.robo, a.emp,
           a.setor_txt, a.setor_txt, NULL, NULL,
           a.a_tipo, a.a_rotulo, a.a_inicio, a.a_fim, a.autor
      FROM eventos_ausencia a
  )

  SELECT t.ev_tipo,
         t.ev_dia,
         t.pid,
         t.nome,
         t.cargo_ev,
         t.emp,
         sd.id, sd.nome, cd.nome,
         sp.id, sp.nome, cp.nome,
         CASE WHEN t.ev_tipo = 'troca_equipe' THEN eqd.nome ELSE t.v_de   END,
         CASE WHEN t.ev_tipo = 'troca_equipe' THEN eqp.nome ELSE t.v_para END,
         CASE WHEN t.ev_tipo <> 'cargo' THEN NULL
              WHEN kd.nivel IS NULL OR kp.nivel IS NULL OR kd.nivel = kp.nivel THEN NULL
              WHEN kp.nivel > kd.nivel THEN 'promocao'
              ELSE 'rebaixamento' END,
         t.a_tipo, t.a_rotulo, t.a_inicio, t.a_fim,
         t.autor
    FROM todos t
    LEFT JOIN public.setores    sd  ON sd.id  = NULLIF(t.de_txt,   '')::uuid
    LEFT JOIN public.rh_celulas cd  ON cd.id  = sd.cidade_id
    LEFT JOIN public.setores    sp  ON sp.id  = NULLIF(t.para_txt, '')::uuid
    LEFT JOIN public.rh_celulas cp  ON cp.id  = sp.cidade_id
    LEFT JOIN public.equipes    eqd ON eqd.id = CASE WHEN t.ev_tipo = 'troca_equipe' THEN NULLIF(t.v_de,   '')::uuid END
    LEFT JOIN public.equipes    eqp ON eqp.id = CASE WHEN t.ev_tipo = 'troca_equipe' THEN NULLIF(t.v_para, '')::uuid END
    LEFT JOIN public.cargos     kd  ON t.ev_tipo = 'cargo' AND kd.slug = t.v_de
    LEFT JOIN public.cargos     kp  ON t.ev_tipo = 'cargo' AND kp.slug = t.v_para
   WHERE COALESCE(t.robo, false) = false
     AND COALESCE(t.cargo_ev, '') NOT IN ('super_admin', 'diretoria')
   ORDER BY t.ev_dia, t.ev_tipo, t.nome;
  -- (o cast de equipe fica dentro do CASE: em linha de cargo, v_de é «operador»)
$fn$;

COMMENT ON FUNCTION public.fn_rh_historico_mes_eventos(uuid[], date) IS
  'Miolo do histórico do mês do RH. Sem porta: só fn_rh_historico_mes chama.';

REVOKE ALL ON FUNCTION public.fn_rh_historico_mes_eventos(uuid[], date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_rh_historico_mes_eventos(uuid[], date) FROM anon, authenticated;


CREATE OR REPLACE FUNCTION public.fn_rh_historico_mes(p_empresas uuid[], p_mes date)
RETURNS TABLE (
  tipo            text,
  dia             date,
  pessoa_id       uuid,
  pessoa_nome     text,
  cargo           text,
  empresa_id      uuid,
  setor_de_id     uuid,
  setor_de_nome   text,
  cidade_de       text,
  setor_para_id   uuid,
  setor_para_nome text,
  cidade_para     text,
  valor_de        text,
  valor_para      text,
  sentido         text,
  ausencia_tipo   text,
  ausencia_rotulo text,
  inicio          date,
  fim             date,
  feito_por       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_empresas uuid[];
BEGIN
  IF NOT (public.fn_user_tem('ver_rh_gestao') AND public.fn_user_tem('rh_escopo_todos_setores')) THEN
    RAISE EXCEPTION 'Sem acesso ao histórico do RH' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(x.emp_id) INTO v_empresas
    FROM unnest(p_empresas) AS x(emp_id)
   WHERE public.fn_can_access_empresa(x.emp_id);

  -- Antes de 12/08/2026 não há log de perfis; agosto já sai incompleto.
  IF v_empresas IS NULL OR p_mes < DATE '2026-08-01' THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.fn_rh_historico_mes_eventos(v_empresas, p_mes);
END;
$fn$;

COMMENT ON FUNCTION public.fn_rh_historico_mes(uuid[], date) IS
  'Histórico do mês do RH (Quadro de Pessoal): transferências, cargo, desligamento, '
  'reativação, entrada, troca de equipe, afastamento e férias. Só leitura; exige '
  'ver_rh_gestao + rh_escopo_todos_setores.';

REVOKE ALL ON FUNCTION public.fn_rh_historico_mes(uuid[], date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_rh_historico_mes(uuid[], date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_rh_historico_mes(uuid[], date) TO authenticated;

COMMIT;
