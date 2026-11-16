-- ============================================================================
-- Desafio Cobrança «para folgar mais cedo» (16/11/2026)
-- ============================================================================
--
-- O dinheiro vem do relatório 59 (o mestre do ERP), por grupo («quem cobrou»).
-- Um grupo só conta se estiver LIGADO a um setor (`mestre_grupos.estado =
-- 'vinculado'`) e esse setor estiver marcado «soma» no desafio. Grupo solto
-- (ex.: «MARILIA - COFEN» em 16/11) não conta — decisão do usuário em
-- 16/11/2026: «se tiver dentro de setores conta, isolado não».
--
-- A exceção é `grupos_avulsos`: grupo solto que o super_admin manda somar
-- mesmo sem setor. «COB PLAY - EM DIA» (cod 61) entra assim (usuário, 16/11).
--
-- ## Fonte do placar (`fonte`)
--
--   '59'     → o 59 (como acima) + os ajustes do super_admin;
--   'manual' → SÓ os lançamentos do super_admin (a tabela de ajustes). O 59
--              continua sendo lido de hora em hora, mas só para comparar —
--              não entra no placar. Trocar de volta para '59' é imediato.
--
-- Configuração, ajustes e o acompanhamento hora a hora: só super_admin (RLS).
-- Quem vê o desafio lê só o placar, pelas funções SECURITY DEFINER abaixo.
--
-- ## Hora a hora
--
-- O 59 é um retrato: o robô sobe um lote por hora e as linhas do lote antigo
-- somem. Para ter a curva, cada promoção de lote grava uma LEITURA (soma por
-- dia e por grupo dos dias do desafio) em `desafio_cobranca_leituras`. O
-- gatilho nunca derruba o robô: erro vira WARNING.
--
-- ## A abertura, uma vez por pessoa
--
-- O ingresso «Toque para abrir» aparece UMA vez por pessoa por desafio
-- (usuário, 16/11/2026). O registro é no banco (`desafio_cobranca_aberturas`),
-- não no navegador: outro PC, outro navegador ou cache limpo não mostram de
-- novo. Quem grava é `fn_desafio_cobranca_abri`; `fn_desafio_cobranca_atual`
-- devolve `ja_abriu`.
--
-- ## Liberação
--
-- `liberado = false` até o usuário mandar. Enquanto isso só super_admin vê
-- (prévia). Nada aparece para a operação sem `liberado = true`.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── Tabelas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desafio_cobranca (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  titulo            text NOT NULL DEFAULT 'Desafio Cobrança',
  subtitulo         text NOT NULL DEFAULT 'para folgar mais cedo',
  dias              date[] NOT NULL CHECK (cardinality(dias) BETWEEN 1 AND 10),
  meta_geral        numeric(14,2) NOT NULL CHECK (meta_geral > 0),
  premio_dia        date,
  premio_hora       text NOT NULL DEFAULT '14:00',
  premio_requisito  text NOT NULL DEFAULT 'Precisa ter banco de horas',
  regra_medias      numeric(4,1) NOT NULL DEFAULT 4.5 CHECK (regra_medias > 0),
  regra_premio      text NOT NULL DEFAULT 'sai 1 hora mais cedo',
  liberado          boolean NOT NULL DEFAULT false,
  liberado_em       timestamptz,
  liberado_por      uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  ativo             boolean NOT NULL DEFAULT true,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_por    uuid REFERENCES public.perfis(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.desafio_cobranca IS
  'Desafio Cobrança (folgar mais cedo). Um ativo por empresa. liberado=false: só super_admin vê.';

-- A regra individual tem dois níveis (16/11/2026): 4,5 médias = 1 hora mais
-- cedo; 5 médias = sai às 14:00. ADD COLUMN para valer também se a tabela já
-- existir de uma colagem anterior desta migration.
ALTER TABLE public.desafio_cobranca
  ADD COLUMN IF NOT EXISTS regra_medias_maior numeric(4,1) NOT NULL DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS regra_premio_maior text NOT NULL DEFAULT 'sai às 14:00',
  -- Grupos do 59 SEM setor que somam assim mesmo (cod_grupo_filtro).
  ADD COLUMN IF NOT EXISTS grupos_avulsos text[] NOT NULL DEFAULT '{}',
  -- De onde vem o placar: '59' (o 59 + ajustes) ou 'manual' (só os lançamentos).
  ADD COLUMN IF NOT EXISTS fonte text NOT NULL DEFAULT '59';
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'desafio_cobranca_medias_ordem') THEN
    ALTER TABLE public.desafio_cobranca
      ADD CONSTRAINT desafio_cobranca_medias_ordem CHECK (regra_medias_maior > regra_medias);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'desafio_cobranca_fonte_valida') THEN
    ALTER TABLE public.desafio_cobranca
      ADD CONSTRAINT desafio_cobranca_fonte_valida CHECK (fonte IN ('59', 'manual'));
  END IF;
END $chk$;

CREATE UNIQUE INDEX IF NOT EXISTS desafio_cobranca_um_ativo
  ON public.desafio_cobranca (empresa_id) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.desafio_cobranca_setores (
  desafio_id  uuid NOT NULL REFERENCES public.desafio_cobranca(id) ON DELETE CASCADE,
  setor_id    uuid NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  -- O recebimento do setor entra na meta.
  soma        boolean NOT NULL DEFAULT false,
  -- A equipe do setor tem a pílula, a gaveta e a TV.
  ve          boolean NOT NULL DEFAULT false,
  PRIMARY KEY (desafio_id, setor_id)
);

-- Divergência: o super_admin lança um valor (positivo ou negativo) com motivo.
-- Ele soma no placar de todo mundo. Remover é marcar, nunca apagar.
CREATE TABLE IF NOT EXISTS public.desafio_cobranca_ajustes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  desafio_id    uuid NOT NULL REFERENCES public.desafio_cobranca(id) ON DELETE CASCADE,
  dia           date NOT NULL,
  -- Nulo = ajuste do geral. Com setor, só conta se o setor soma.
  setor_id      uuid REFERENCES public.setores(id) ON DELETE SET NULL,
  valor         numeric(14,2) NOT NULL CHECK (valor <> 0),
  motivo        text NOT NULL CHECK (length(btrim(motivo)) >= 3),
  criado_por    uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  removido_em   timestamptz,
  removido_por  uuid REFERENCES public.perfis(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS desafio_cobranca_ajustes_desafio ON public.desafio_cobranca_ajustes (desafio_id, dia);

CREATE TABLE IF NOT EXISTS public.desafio_cobranca_leituras (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  desafio_id         uuid NOT NULL REFERENCES public.desafio_cobranca(id) ON DELETE CASCADE,
  lote_id            uuid,
  -- A hora do arquivo do 59 (importado_em do lote vigente).
  lido_em            timestamptz NOT NULL,
  dia                date NOT NULL,
  -- '*' = marcador do dia (valor 0): o dia foi lido, mesmo sem pagamento.
  cod_grupo_filtro   text NOT NULL,
  nome_grupo_filtro  text NOT NULL DEFAULT '',
  setor_id           uuid REFERENCES public.setores(id) ON DELETE SET NULL,
  pagamentos         integer NOT NULL DEFAULT 0,
  valor              numeric(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT desafio_cobranca_leituras_unica UNIQUE (desafio_id, lido_em, dia, cod_grupo_filtro)
);
CREATE INDEX IF NOT EXISTS desafio_cobranca_leituras_dia ON public.desafio_cobranca_leituras (desafio_id, dia, lido_em DESC);

-- Quem já viu a abertura. Uma linha por pessoa por desafio; nunca se apaga.
CREATE TABLE IF NOT EXISTS public.desafio_cobranca_aberturas (
  desafio_id  uuid NOT NULL REFERENCES public.desafio_cobranca(id) ON DELETE CASCADE,
  perfil_id   uuid NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  aberta_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (desafio_id, perfil_id)
);

-- Quem mexeu e quando.
CREATE OR REPLACE FUNCTION public.trg_desafio_cobranca_carimbo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.atualizado_em := now();
  NEW.atualizado_por := coalesce(auth.uid(), NEW.atualizado_por);
  IF NEW.liberado AND NOT coalesce(OLD.liberado, false) THEN
    NEW.liberado_em := now();
    NEW.liberado_por := auth.uid();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS desafio_cobranca_carimbo ON public.desafio_cobranca;
CREATE TRIGGER desafio_cobranca_carimbo BEFORE UPDATE ON public.desafio_cobranca
  FOR EACH ROW EXECUTE FUNCTION public.trg_desafio_cobranca_carimbo();

-- ── RLS: tudo só super_admin ───────────────────────────────────────────────

ALTER TABLE public.desafio_cobranca          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafio_cobranca_setores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafio_cobranca_ajustes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafio_cobranca_leituras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafio_cobranca_aberturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS desafio_cobranca_super ON public.desafio_cobranca;
CREATE POLICY desafio_cobranca_super ON public.desafio_cobranca FOR ALL TO authenticated
  USING ((SELECT public.fn_user_is_super_admin())) WITH CHECK ((SELECT public.fn_user_is_super_admin()));

DROP POLICY IF EXISTS desafio_cobranca_setores_super ON public.desafio_cobranca_setores;
CREATE POLICY desafio_cobranca_setores_super ON public.desafio_cobranca_setores FOR ALL TO authenticated
  USING ((SELECT public.fn_user_is_super_admin())) WITH CHECK ((SELECT public.fn_user_is_super_admin()));

DROP POLICY IF EXISTS desafio_cobranca_ajustes_super ON public.desafio_cobranca_ajustes;
CREATE POLICY desafio_cobranca_ajustes_super ON public.desafio_cobranca_ajustes FOR ALL TO authenticated
  USING ((SELECT public.fn_user_is_super_admin())) WITH CHECK ((SELECT public.fn_user_is_super_admin()));

-- Leitura: só olhar. Quem escreve é o gatilho.
DROP POLICY IF EXISTS desafio_cobranca_leituras_super ON public.desafio_cobranca_leituras;
CREATE POLICY desafio_cobranca_leituras_super ON public.desafio_cobranca_leituras FOR SELECT TO authenticated
  USING ((SELECT public.fn_user_is_super_admin()));

-- Aberturas: cada um vê a sua; o super_admin vê todas. Quem grava é a função.
DROP POLICY IF EXISTS desafio_cobranca_aberturas_ver ON public.desafio_cobranca_aberturas;
CREATE POLICY desafio_cobranca_aberturas_ver ON public.desafio_cobranca_aberturas FOR SELECT TO authenticated
  USING (perfil_id = (SELECT auth.uid()) OR (SELECT public.fn_user_is_super_admin()));

REVOKE ALL ON public.desafio_cobranca, public.desafio_cobranca_setores,
              public.desafio_cobranca_ajustes, public.desafio_cobranca_leituras,
              public.desafio_cobranca_aberturas FROM anon;
GRANT SELECT ON public.desafio_cobranca_aberturas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.desafio_cobranca, public.desafio_cobranca_setores TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.desafio_cobranca_ajustes TO authenticated;
GRANT SELECT ON public.desafio_cobranca_leituras TO authenticated;

-- ── A leitura de um lote do 59 ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_desafio_cobranca_ler(p_desafio uuid, p_lote uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d public.desafio_cobranca%ROWTYPE;
  v_l public.mestre_lotes%ROWTYPE;
  n   integer;
BEGIN
  SELECT * INTO v_d FROM public.desafio_cobranca WHERE id = p_desafio;
  SELECT * INTO v_l FROM public.mestre_lotes WHERE id = p_lote AND estado = 'vigente';
  IF v_d.id IS NULL OR v_l.id IS NULL OR v_l.empresa_id <> v_d.empresa_id THEN
    RETURN 0;
  END IF;

  -- O marcador: o dia foi lido nesta hora, mesmo que não tenha pagamento.
  INSERT INTO public.desafio_cobranca_leituras (desafio_id, lote_id, lido_em, dia, cod_grupo_filtro)
  SELECT v_d.id, v_l.id, v_l.importado_em, x.dia, '*'
    FROM unnest(v_d.dias) AS x(dia)
   WHERE date_trunc('month', x.dia)::date = v_l.mes
  ON CONFLICT ON CONSTRAINT desafio_cobranca_leituras_unica DO NOTHING;

  INSERT INTO public.desafio_cobranca_leituras
         (desafio_id, lote_id, lido_em, dia, cod_grupo_filtro, nome_grupo_filtro, setor_id, pagamentos, valor)
  SELECT v_d.id, v_l.id, v_l.importado_em, r.dt_pgto, r.cod_grupo_filtro, max(r.nome_grupo_filtro),
         CASE WHEN g.estado = 'vinculado' THEN g.setor_id END,
         count(*), sum(r.recebido)
    FROM public.mestre_recebimentos r
    LEFT JOIN public.mestre_grupos g
           ON g.empresa_id = r.empresa_id AND g.cod_grupo_filtro = r.cod_grupo_filtro
   WHERE r.lote_id = v_l.id
     AND r.empresa_id = v_l.empresa_id
     AND r.mes = v_l.mes
     AND r.dt_pgto = ANY (v_d.dias)
   GROUP BY r.dt_pgto, r.cod_grupo_filtro, CASE WHEN g.estado = 'vinculado' THEN g.setor_id END
  ON CONFLICT ON CONSTRAINT desafio_cobranca_leituras_unica DO UPDATE
     SET nome_grupo_filtro = excluded.nome_grupo_filtro, setor_id = excluded.setor_id,
         pagamentos = excluded.pagamentos, valor = excluded.valor, lote_id = excluded.lote_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_cobranca_ler(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- O gatilho do robô: cada lote promovido vira uma leitura. Nunca derruba o 59.
CREATE OR REPLACE FUNCTION public.trg_desafio_cobranca_leitura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NEW.estado = 'vigente' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'vigente') THEN
    FOR v_id IN
      SELECT c.id FROM public.desafio_cobranca c
       WHERE c.ativo AND c.empresa_id = NEW.empresa_id
         AND EXISTS (SELECT 1 FROM unnest(c.dias) x(dia) WHERE date_trunc('month', x.dia)::date = NEW.mes)
         AND (now() AT TIME ZONE 'America/Sao_Paulo')::date
             <= (SELECT max(x.dia) FROM unnest(c.dias) x(dia)) + 7
    LOOP
      BEGIN
        PERFORM public.fn_desafio_cobranca_ler(v_id, NEW.id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'desafio_cobranca: leitura do lote % falhou: %', NEW.id, SQLERRM;
      END;
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS zz_desafio_cobranca_leitura ON public.mestre_lotes;
CREATE TRIGGER zz_desafio_cobranca_leitura
  AFTER INSERT OR UPDATE OF estado ON public.mestre_lotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_desafio_cobranca_leitura();

-- ── O placar ───────────────────────────────────────────────────────────────
--
-- Por dia: a leitura MAIS NOVA daquele dia, só dos setores que somam, mais os
-- ajustes válidos. Com `fonte = 'manual'`, o 59 vale zero: só os lançamentos. `p_detalhe` (só super_admin) acrescenta setores, grupos,
-- horas, ajustes e o lote do 59.

CREATE OR REPLACE FUNCTION public.fn_desafio_cobranca_montar(p_desafio uuid, p_detalhe boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH d AS (SELECT * FROM public.desafio_cobranca WHERE id = p_desafio),
  ult AS (
    SELECT l.dia, max(l.lido_em) AS lido_em
      FROM public.desafio_cobranca_leituras l
     WHERE l.desafio_id = p_desafio
     GROUP BY l.dia
  ),
  atual AS (
    SELECT l.* FROM public.desafio_cobranca_leituras l
      JOIN ult u ON u.dia = l.dia AND u.lido_em = l.lido_em
     WHERE l.desafio_id = p_desafio AND l.cod_grupo_filtro <> '*'
  ),
  soma AS (SELECT setor_id FROM public.desafio_cobranca_setores WHERE desafio_id = p_desafio AND soma),
  aj AS (
    SELECT a.* FROM public.desafio_cobranca_ajustes a
     WHERE a.desafio_id = p_desafio AND a.removido_em IS NULL
       AND (a.setor_id IS NULL OR a.setor_id IN (SELECT setor_id FROM soma))
  ),
  por_dia AS (
    SELECT x.dia, x.i,
           CASE WHEN d.fonte = 'manual' THEN 0 ELSE
           coalesce((SELECT sum(a.valor) FROM atual a
                      WHERE a.dia = x.dia
                        AND (a.setor_id IN (SELECT setor_id FROM soma)
                             OR (a.setor_id IS NULL AND a.cod_grupo_filtro = ANY (d.grupos_avulsos)))), 0) END AS v59,
           coalesce((SELECT sum(j.valor) FROM aj j WHERE j.dia = x.dia), 0) AS ajuste,
           (SELECT u.lido_em FROM ult u WHERE u.dia = x.dia) AS lido_em
      FROM d, unnest(d.dias) WITH ORDINALITY AS x(dia, i)
     ORDER BY x.i
  )
  SELECT jsonb_build_object(
    'id', d.id, 'titulo', d.titulo, 'subtitulo', d.subtitulo, 'dias', to_jsonb(d.dias),
    'meta_geral', d.meta_geral, 'premio_dia', d.premio_dia, 'premio_hora', d.premio_hora,
    'premio_requisito', d.premio_requisito, 'regra_medias', d.regra_medias, 'regra_premio', d.regra_premio,
    'regra_medias_maior', d.regra_medias_maior, 'regra_premio_maior', d.regra_premio_maior,
    'grupos_avulsos', to_jsonb(d.grupos_avulsos),
    'fonte', d.fonte,
    'liberado', d.liberado,
    -- A hora do dado: o retrato do 59, ou o último lançamento no manual.
    'atualizado_em', CASE WHEN d.fonte = 'manual' THEN (SELECT max(criado_em) FROM aj)
                          ELSE (SELECT max(lido_em) FROM ult) END,
    'por_dia', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', p.dia, 'valor_59', p.v59, 'ajuste', p.ajuste,
                                                             'total', p.v59 + p.ajuste, 'lido_em', p.lido_em) ORDER BY p.i)
                           FROM por_dia p), '[]'::jsonb),
    'total', coalesce((SELECT sum(v59 + ajuste) FROM por_dia), 0)
  ) || CASE WHEN p_detalhe THEN jsonb_build_object(
    'ativo', d.ativo, 'empresa_id', d.empresa_id, 'liberado_em', d.liberado_em,
    'setores', coalesce((
      SELECT jsonb_agg(jsonb_build_object('setor_id', s.id, 'nome', s.nome, 'cidade', c.nome, 'regra', s.regra,
                                          'soma', coalesce(cfg.soma, false), 've', coalesce(cfg.ve, false))
                       ORDER BY c.nome NULLS LAST, s.nome)
        FROM public.setores s
        LEFT JOIN public.rh_celulas c ON c.id = s.cidade_id
        LEFT JOIN public.desafio_cobranca_setores cfg ON cfg.desafio_id = d.id AND cfg.setor_id = s.id
       WHERE cfg.setor_id IS NOT NULL
          OR s.id IN (SELECT g.setor_id FROM public.mestre_grupos g
                       WHERE g.empresa_id = d.empresa_id AND g.estado = 'vinculado')), '[]'::jsonb),
    'grupos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('dia', a.dia, 'cod', a.cod_grupo_filtro, 'nome', a.nome_grupo_filtro,
                                          'setor_id', a.setor_id, 'pagamentos', a.pagamentos, 'valor', a.valor)
                       ORDER BY a.dia, a.valor DESC)
        FROM atual a), '[]'::jsonb),
    'horas', coalesce((
      -- Grupo sem setor sai com o `cod`, para o avulso que soma entrar na curva.
      SELECT jsonb_agg(jsonb_build_object('lido_em', h.lido_em, 'dia', h.dia, 'setor_id', h.setor_id,
                                          'cod', h.cod, 'valor', h.valor)
                       ORDER BY h.lido_em)
        FROM (SELECT l.lido_em, l.dia, l.setor_id,
                     CASE WHEN l.setor_id IS NULL THEN l.cod_grupo_filtro END AS cod, sum(l.valor) AS valor
                FROM public.desafio_cobranca_leituras l
               WHERE l.desafio_id = d.id AND l.cod_grupo_filtro <> '*'
               GROUP BY 1, 2, 3, 4) h), '[]'::jsonb),
    'leituras', coalesce((
      SELECT jsonb_agg(DISTINCT l.lido_em) FROM public.desafio_cobranca_leituras l WHERE l.desafio_id = d.id), '[]'::jsonb),
    'ajustes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'dia', a.dia, 'setor_id', a.setor_id, 'valor', a.valor,
                                          'motivo', a.motivo, 'criado_em', a.criado_em, 'criado_por', p.nome,
                                          'removido_em', a.removido_em)
                       ORDER BY a.criado_em DESC)
        FROM public.desafio_cobranca_ajustes a
        LEFT JOIN public.perfis p ON p.id = a.criado_por
       WHERE a.desafio_id = d.id), '[]'::jsonb),
    'aberturas', (SELECT count(*) FROM public.desafio_cobranca_aberturas ab WHERE ab.desafio_id = d.id),
    'lote_59', (
      SELECT jsonb_build_object('importado_em', max(l.importado_em))
        FROM public.mestre_lotes l
       WHERE l.empresa_id = d.empresa_id AND l.estado = 'vigente'
         AND l.mes IN (SELECT DISTINCT date_trunc('month', x)::date FROM unnest(d.dias) x))
  ) ELSE '{}'::jsonb END
  FROM d;
$$;

REVOKE ALL ON FUNCTION public.fn_desafio_cobranca_montar(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- A janela em que o desafio aparece para a operação: 3 dias antes do 1º até o
-- dia da folga (ou o último dia).
CREATE OR REPLACE FUNCTION public.fn_desafio_cobranca_na_janela(p_dias date[], p_premio date)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date
         BETWEEN (SELECT min(x) FROM unnest(p_dias) x) - 3
             AND greatest(coalesce(p_premio, '-infinity'::date), (SELECT max(x) FROM unnest(p_dias) x));
$$;

-- O de quem está no Gestão. Super_admin: o ativo, mesmo não liberado (prévia).
CREATE OR REPLACE FUNCTION public.fn_desafio_cobranca_atual()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sa    boolean := coalesce(public.fn_user_is_super_admin(), false);
  v_setor uuid    := public.fn_user_setor_id();
  v_id    uuid;
  v_lib   boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  IF v_sa THEN
    SELECT c.id, c.liberado INTO v_id, v_lib FROM public.desafio_cobranca c
     WHERE c.ativo ORDER BY c.atualizado_em DESC LIMIT 1;
  ELSE
    SELECT c.id, c.liberado INTO v_id, v_lib FROM public.desafio_cobranca c
      JOIN public.desafio_cobranca_setores s ON s.desafio_id = c.id AND s.setor_id = v_setor AND s.ve
     WHERE c.ativo AND c.liberado AND public.fn_desafio_cobranca_na_janela(c.dias, c.premio_dia)
     ORDER BY c.atualizado_em DESC LIMIT 1;
  END IF;

  IF v_id IS NULL THEN RETURN NULL; END IF;
  RETURN public.fn_desafio_cobranca_montar(v_id, false)
      || jsonb_build_object('previa', NOT v_lib, 'super_admin', v_sa,
           'ja_abriu', EXISTS (SELECT 1 FROM public.desafio_cobranca_aberturas ab
                                WHERE ab.desafio_id = v_id AND ab.perfil_id = auth.uid()));
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_cobranca_atual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_cobranca_atual() TO authenticated;

-- «Abri»: grava que a pessoa viu a abertura deste desafio. Uma vez; repetir
-- não faz nada. Só o desafio que ela enxerga (o mesmo filtro de
-- `fn_desafio_cobranca_atual`).
CREATE OR REPLACE FUNCTION public.fn_desafio_cobranca_abri(p_desafio uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sa    boolean := coalesce(public.fn_user_is_super_admin(), false);
  v_setor uuid    := public.fn_user_setor_id();
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.desafio_cobranca c
     WHERE c.id = p_desafio AND c.ativo
       AND (v_sa OR (c.liberado AND EXISTS (
             SELECT 1 FROM public.desafio_cobranca_setores s
              WHERE s.desafio_id = c.id AND s.setor_id = v_setor AND s.ve)))
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.desafio_cobranca_aberturas (desafio_id, perfil_id)
  VALUES (p_desafio, auth.uid())
  ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_cobranca_abri(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_cobranca_abri(uuid) TO authenticated;

-- O detalhe do super_admin: setores, grupos, horas, ajustes, lote do 59.
CREATE OR REPLACE FUNCTION public.fn_desafio_cobranca_detalhe(p_desafio uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := p_desafio;
BEGIN
  IF NOT coalesce(public.fn_user_is_super_admin(), false) THEN
    RAISE EXCEPTION 'Só super_admin.' USING ERRCODE = '42501';
  END IF;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.desafio_cobranca WHERE ativo ORDER BY atualizado_em DESC LIMIT 1;
  END IF;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  RETURN public.fn_desafio_cobranca_montar(v_id, true);
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_cobranca_detalhe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_cobranca_detalhe(uuid) TO authenticated;

-- «Ler agora»: o super_admin força a leitura do lote vigente (depois de mudar
-- dias, ou para conferir). Devolve quantas linhas gravou.
CREATE OR REPLACE FUNCTION public.fn_desafio_cobranca_ler_agora(p_desafio uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d public.desafio_cobranca%ROWTYPE;
  v_l uuid;
  n   integer := 0;
BEGIN
  IF NOT coalesce(public.fn_user_is_super_admin(), false) THEN
    RAISE EXCEPTION 'Só super_admin.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_d FROM public.desafio_cobranca WHERE id = p_desafio;
  IF v_d.id IS NULL THEN RETURN 0; END IF;
  FOR v_l IN
    SELECT l.id FROM public.mestre_lotes l
     WHERE l.empresa_id = v_d.empresa_id AND l.estado = 'vigente'
       AND l.mes IN (SELECT DISTINCT date_trunc('month', x)::date FROM unnest(v_d.dias) x)
  LOOP
    n := n + public.fn_desafio_cobranca_ler(v_d.id, v_l);
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_cobranca_ler_agora(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_cobranca_ler_agora(uuid) TO authenticated;

-- A TV (sem login, pelo token): só o geral, só liberado, só setor que vê.
CREATE OR REPLACE FUNCTION public.fn_desafio_cobranca_tv(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_setor uuid;
  v_id    uuid;
  v_natal boolean;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT p.setor_id INTO v_setor
    FROM public.tv_conexoes c
    JOIN public.tv_paineis p ON p.id = c.painel_id
   WHERE c.segredo_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF v_setor IS NULL THEN RETURN NULL; END IF;

  SELECT c.id INTO v_id FROM public.desafio_cobranca c
    JOIN public.desafio_cobranca_setores s ON s.desafio_id = c.id AND s.setor_id = v_setor AND s.ve
   WHERE c.ativo AND c.liberado AND public.fn_desafio_cobranca_na_janela(c.dias, c.premio_dia)
   ORDER BY c.atualizado_em DESC LIMIT 1;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  -- As cores da TV seguem o Natal da empresa: liberado = «Noite de Natal»;
  -- senão, «Grafite e ouro». A TV não tem login para ler `natal_liberacao`.
  BEGIN
    v_natal := EXISTS (SELECT 1 FROM public.natal_liberacao);
  EXCEPTION WHEN undefined_table THEN
    v_natal := false;
  END;
  RETURN public.fn_desafio_cobranca_montar(v_id, false) || jsonb_build_object('natal', v_natal);
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_cobranca_tv(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_desafio_cobranca_tv(text) TO anon, authenticated;

-- ── O desafio de 16 a 18/11/2026, NÃO liberado ─────────────────────────────
--
-- Empresa: a do 59 vigente de novembro. Setores: os ligados a grupo do 59.
-- Soma: todos, menos Jornada e regra Cofen (decisão de 16/11), mais o grupo
-- solto «COB PLAY - EM DIA» (61). Vê: Birigui (Marília soma sem ver). O
-- super_admin ajusta tudo na tela depois.

DO $semente$
DECLARE
  v_emp uuid;
  v_id  uuid;
  v_lote uuid;
BEGIN
  SELECT empresa_id, id INTO v_emp, v_lote FROM public.mestre_lotes
   WHERE estado = 'vigente' AND mes = DATE '2026-11-01'
   ORDER BY importado_em DESC LIMIT 1;
  IF v_emp IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.desafio_cobranca WHERE empresa_id = v_emp AND ativo) THEN RETURN; END IF;

  INSERT INTO public.desafio_cobranca (empresa_id, dias, meta_geral, premio_dia, grupos_avulsos)
  VALUES (v_emp, ARRAY[DATE '2026-11-16', DATE '2026-11-17', DATE '2026-11-18'], 1900000, DATE '2026-11-19', ARRAY['61'])
  RETURNING id INTO v_id;

  INSERT INTO public.desafio_cobranca_setores (desafio_id, setor_id, soma, ve)
  SELECT DISTINCT v_id, s.id,
         NOT (s.nome ILIKE 'jornada%' OR coalesce(s.regra, '') = 'cofen'),
         NOT (s.nome ILIKE 'jornada%' OR coalesce(s.regra, '') = 'cofen' OR coalesce(c.nome, '') ILIKE 'mar_lia%')
    FROM public.mestre_grupos g
    JOIN public.setores s ON s.id = g.setor_id
    LEFT JOIN public.rh_celulas c ON c.id = s.cidade_id
   WHERE g.empresa_id = v_emp AND g.estado = 'vinculado'
  ON CONFLICT DO NOTHING;

  PERFORM public.fn_desafio_cobranca_ler(v_id, v_lote);
END
$semente$;

-- Se o desafio de 16/11 já existia (colagem anterior), o 61 entra nele também.
UPDATE public.desafio_cobranca
   SET grupos_avulsos = array_append(grupos_avulsos, '61')
 WHERE ativo AND DATE '2026-11-16' = ANY (dias) AND NOT ('61' = ANY (grupos_avulsos));

COMMIT;
