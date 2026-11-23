-- ============================================================================
-- Desafio do Vale: 9 médias + Cupons do Pix (23/11/2026)
-- ============================================================================
--
-- Pedido do usuário (23/11/2026), para todos os setores da cobrança, tudo
-- configurável pelo super_admin:
--
-- ## 1. As 9 médias (23 a 30/11)
--
-- O operador que fizer 9 médias diárias DELE nos dias do desafio ganha o
-- vale Bandeirante. O VALOR do vale depende de como o SETOR dele fecha o mês:
--
--   setor fechou com 100% ou mais da meta ..... R$ 120,00
--   setor fechou entre 90% e 99% .............. R$ 100,00
--   setor fechou abaixo de 90% ................ R$  80,00
--
-- As faixas ficam em `faixas` (jsonb, `[{pct, valor}]`), editáveis na tela.
-- A média de cada um é a mesma régua do Desafio Cobrança
-- (`src/lib/desafioMediaOperador.ts`): meta do mês da pessoa ÷ os dias úteis
-- dela no mês. O feito é o recebido dela no Analítico (o 59 atribuído),
-- somado no navegador — a RLS do Analítico já deixa cada um ver o seu e o
-- líder ver o setor. Aqui no banco fica só o % do SETOR.
--
-- ## O % do setor
--
-- O que o Painel Diretoria mostra: o 59 atribuído ao setor
-- (`fn_mestre_diretoria_linhas`, a mesma atribuição de equipe movida, colchão
-- fora) ÷ a meta do setor no mês (`metas`, tipo 'setor'). É conta pesada
-- (~1 s), então NÃO roda a cada pessoa que abre: o resultado fica guardado em
-- `desafio_vale_setores` e só é refeito quando o robô sobe um lote novo do 59
-- (o primeiro que abrir depois do lote refaz; os outros leem o guardado).
-- Nada disso toca o robô: não há gatilho em `mestre_lotes`.
--
-- Setor de regra Cofen: o dinheiro Cofen não vem do 59 (CLAUDE.md), então o
-- % automático fica vazio e vale o % que o super_admin digitar.
--
-- `pct_manual` (o «fechamento oficial» digitado pelo super_admin) sempre ganha
-- do automático. «Confirmar o fechamento» (`fechado_em`) congela tudo: o 59
-- deixa de ser relido e o prêmio passa a ser o final.
--
-- ## 2. Cupons do Pix (23 a 26/11)
--
-- A cada 3 Pix automáticos registrados na aba Pix Automático no período, 1
-- cupom — só conta Pix APROVADO pelo líder. A contagem é no navegador sobre
-- `pix_automatico_acordos` (a RLS do Pix já dá ao operador os dele e ao líder
-- os do setor). Aqui ficam só o período, a quantidade por cupom e o texto do
-- prêmio. A aba Pix destaca as linhas do período para o líder achar e aprovar.
--
-- ## Liberação
--
-- `liberado = false` até o super_admin ligar na tela /desafio-vale. Antes
-- disso só o super_admin vê (prévia).
--
-- Reexecutável. Não mexe em nenhuma tabela que já existe.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── Tabelas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desafio_vale (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  titulo           text NOT NULL DEFAULT 'Desafio das 9 médias',
  premio_nome      text NOT NULL DEFAULT 'vale Bandeirante',
  inicio           date NOT NULL,
  fim              date NOT NULL,
  medias           numeric(4,1) NOT NULL DEFAULT 9 CHECK (medias > 0),
  -- Do maior % para o menor; a última costuma ser `pct = 0` (o piso).
  faixas           jsonb NOT NULL DEFAULT '[{"pct":100,"valor":120},{"pct":90,"valor":100},{"pct":0,"valor":80}]'::jsonb,
  cupom_ativo      boolean NOT NULL DEFAULT true,
  cupom_inicio     date,
  cupom_fim        date,
  cupom_pix        integer NOT NULL DEFAULT 3 CHECK (cupom_pix BETWEEN 1 AND 50),
  cupom_premio     text NOT NULL DEFAULT '',
  liberado         boolean NOT NULL DEFAULT false,
  liberado_em      timestamptz,
  liberado_por     uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  -- Fechamento confirmado: o % dos setores para de ser relido do 59.
  fechado_em       timestamptz,
  fechado_por      uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  -- O lote do 59 (importado_em) que deu o % guardado nos setores.
  calculado_lote   timestamptz,
  calculado_em     timestamptz,
  ativo            boolean NOT NULL DEFAULT true,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_por   uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  CONSTRAINT desafio_vale_periodo CHECK (fim >= inicio AND fim - inicio <= 31),
  CONSTRAINT desafio_vale_cupom_periodo CHECK (cupom_inicio IS NULL OR cupom_fim IS NULL OR cupom_fim >= cupom_inicio),
  CONSTRAINT desafio_vale_faixas_validas CHECK (
    jsonb_typeof(faixas) = 'array' AND jsonb_array_length(faixas) BETWEEN 1 AND 6)
);
COMMENT ON TABLE public.desafio_vale IS
  'Desafio do Vale (9 médias → vale pelo % do setor) + Cupons do Pix. Um ativo por empresa. liberado=false: só super_admin vê.';

CREATE UNIQUE INDEX IF NOT EXISTS desafio_vale_um_ativo
  ON public.desafio_vale (empresa_id) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.desafio_vale_setores (
  desafio_id     uuid NOT NULL REFERENCES public.desafio_vale(id) ON DELETE CASCADE,
  setor_id       uuid NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  -- O setor está no desafio: a equipe vê a pílula e a gaveta.
  participa      boolean NOT NULL DEFAULT false,
  -- O fechamento oficial digitado pelo super_admin. Ganha do automático.
  pct_manual     numeric(7,2) CHECK (pct_manual IS NULL OR pct_manual >= 0),
  -- O automático (o 59 do setor ÷ a meta do setor), guardado por lote.
  recebido_auto  numeric(14,2),
  meta_auto      numeric(14,2),
  pct_auto       numeric(9,2),
  PRIMARY KEY (desafio_id, setor_id)
);

CREATE OR REPLACE FUNCTION public.trg_desafio_vale_carimbo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  -- O recálculo do % (fn_desafio_vale_calcular) não é «mexer no desafio».
  IF (to_jsonb(NEW) - ARRAY['calculado_lote', 'calculado_em'])
   = (to_jsonb(OLD) - ARRAY['calculado_lote', 'calculado_em']) THEN
    RETURN NEW;
  END IF;
  NEW.atualizado_em := now();
  NEW.atualizado_por := coalesce(auth.uid(), NEW.atualizado_por);
  IF NEW.liberado AND NOT coalesce(OLD.liberado, false) THEN
    NEW.liberado_em := now();
    NEW.liberado_por := auth.uid();
  END IF;
  IF NEW.fechado_em IS NOT NULL AND OLD.fechado_em IS NULL THEN
    NEW.fechado_por := auth.uid();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS desafio_vale_carimbo ON public.desafio_vale;
CREATE TRIGGER desafio_vale_carimbo BEFORE UPDATE ON public.desafio_vale
  FOR EACH ROW EXECUTE FUNCTION public.trg_desafio_vale_carimbo();

-- ── RLS: tudo só super_admin ───────────────────────────────────────────────

ALTER TABLE public.desafio_vale         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafio_vale_setores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS desafio_vale_super ON public.desafio_vale;
CREATE POLICY desafio_vale_super ON public.desafio_vale FOR ALL TO authenticated
  USING ((SELECT public.fn_user_is_super_admin())) WITH CHECK ((SELECT public.fn_user_is_super_admin()));

DROP POLICY IF EXISTS desafio_vale_setores_super ON public.desafio_vale_setores;
CREATE POLICY desafio_vale_setores_super ON public.desafio_vale_setores FOR ALL TO authenticated
  USING ((SELECT public.fn_user_is_super_admin())) WITH CHECK ((SELECT public.fn_user_is_super_admin()));

REVOKE ALL ON public.desafio_vale, public.desafio_vale_setores FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.desafio_vale, public.desafio_vale_setores TO authenticated;

-- ── O % dos setores ────────────────────────────────────────────────────────
--
-- O 59 do mês do FIM do desafio (o mês que «fecha»), até hoje no mês corrente
-- — o mesmo corte do Painel Diretoria. Grava em todos os setores do desafio
-- (participando ou não, para a tela do super_admin comparar).

CREATE OR REPLACE FUNCTION public.fn_desafio_vale_calcular(p_desafio uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d     public.desafio_vale%ROWTYPE;
  v_mes   date;
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_corte integer;
  v_lote  timestamptz;
  n       integer;
BEGIN
  SELECT * INTO v_d FROM public.desafio_vale WHERE id = p_desafio;
  IF v_d.id IS NULL OR v_d.fechado_em IS NOT NULL THEN RETURN 0; END IF;

  v_mes := date_trunc('month', v_d.fim)::date;
  v_corte := CASE WHEN date_trunc('month', v_hoje)::date = v_mes THEN extract(day FROM v_hoje)::integer END;
  SELECT max(l.importado_em) INTO v_lote FROM public.mestre_lotes l
   WHERE l.empresa_id = v_d.empresa_id AND l.mes = v_mes AND l.estado = 'vigente';

  WITH linhas AS (
    SELECT l.setor_id, sum(l.recebido) AS v
      FROM public.fn_mestre_diretoria_linhas(v_d.empresa_id, to_char(v_mes, 'YYYY-MM'), v_corte) l
     WHERE l.setor_id IS NOT NULL
     GROUP BY l.setor_id
  ),
  meta AS (
    SELECT m.referencia_id::text AS setor, max(m.meta_valor) AS v
      FROM public.metas m
     WHERE m.empresa_id = v_d.empresa_id AND m.tipo = 'setor'
       AND m.mes = extract(month FROM v_mes)::integer AND m.ano = extract(year FROM v_mes)::integer
     GROUP BY 1
  )
  UPDATE public.desafio_vale_setores s
     SET recebido_auto = coalesce(li.v, 0),
         meta_auto     = me.v,
         pct_auto      = CASE WHEN coalesce(st.regra, '') = 'cofen' OR coalesce(me.v, 0) <= 0 THEN NULL
                              ELSE round(coalesce(li.v, 0) / me.v * 100, 2) END
    FROM public.setores st
    LEFT JOIN linhas li ON li.setor_id = st.id
    LEFT JOIN meta me ON me.setor = st.id::text
   WHERE s.desafio_id = v_d.id AND st.id = s.setor_id;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.desafio_vale SET calculado_lote = v_lote, calculado_em = now() WHERE id = v_d.id;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_calcular(uuid) FROM PUBLIC, anon, authenticated;

-- Refaz o % se o 59 tem lote novo desde a última conta. Um por vez (o
-- primeiro que pega a trava refaz; quem chega junto lê o guardado). Nunca
-- derruba quem abriu a gaveta: erro vira WARNING.
CREATE OR REPLACE FUNCTION public.fn_desafio_vale_atualizar_se_preciso(p_desafio uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d    public.desafio_vale%ROWTYPE;
  v_lote timestamptz;
BEGIN
  SELECT * INTO v_d FROM public.desafio_vale WHERE id = p_desafio;
  IF v_d.id IS NULL OR v_d.fechado_em IS NOT NULL THEN RETURN; END IF;
  -- Fora da janela (antes de 3 dias do início ou 10 dias depois do fim): o guardado basta.
  IF (now() AT TIME ZONE 'America/Sao_Paulo')::date NOT BETWEEN v_d.inicio - 3 AND v_d.fim + 10 THEN RETURN; END IF;
  SELECT max(l.importado_em) INTO v_lote FROM public.mestre_lotes l
   WHERE l.empresa_id = v_d.empresa_id AND l.mes = date_trunc('month', v_d.fim)::date AND l.estado = 'vigente';
  IF v_d.calculado_em IS NOT NULL AND v_d.calculado_lote IS NOT DISTINCT FROM v_lote
     -- Lote igual: refaz no máximo a cada 30 min (meta do setor mudou na aba Metas).
     AND v_d.calculado_em > now() - interval '30 minutes' THEN
    RETURN;
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('desafio_vale:' || p_desafio::text)) THEN RETURN; END IF;
  BEGIN
    PERFORM public.fn_desafio_vale_calcular(p_desafio);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'desafio_vale: cálculo do %% dos setores falhou: %', SQLERRM;
  END;
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_atualizar_se_preciso(uuid) FROM PUBLIC, anon, authenticated;

-- ── O que a tela lê ────────────────────────────────────────────────────────

-- Um setor do desafio, pronto: o % que vale (manual ganha) e de onde veio.
CREATE OR REPLACE FUNCTION public.fn_desafio_vale_setor_json(p_desafio uuid, p_setor uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'setor_id', st.id, 'nome', st.nome, 'cidade', c.nome, 'regra', st.regra,
    'participa', coalesce(s.participa, false),
    'pct', coalesce(s.pct_manual, s.pct_auto),
    'origem', CASE WHEN s.pct_manual IS NOT NULL THEN 'manual' WHEN s.pct_auto IS NOT NULL THEN 'automatico' END,
    'pct_manual', s.pct_manual, 'pct_auto', s.pct_auto,
    'recebido', s.recebido_auto, 'meta', s.meta_auto)
    FROM public.setores st
    LEFT JOIN public.rh_celulas c ON c.id = st.cidade_id
    LEFT JOIN public.desafio_vale_setores s ON s.desafio_id = p_desafio AND s.setor_id = st.id
   WHERE st.id = p_setor;
$$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_setor_json(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_desafio_vale_montar(p_desafio uuid, p_todos boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', d.id, 'titulo', d.titulo, 'premio_nome', d.premio_nome,
    'inicio', d.inicio, 'fim', d.fim, 'medias', d.medias, 'faixas', d.faixas,
    'cupom_ativo', d.cupom_ativo, 'cupom_inicio', d.cupom_inicio, 'cupom_fim', d.cupom_fim,
    'cupom_pix', d.cupom_pix, 'cupom_premio', d.cupom_premio,
    'liberado', d.liberado, 'fechado_em', d.fechado_em,
    'calculado_em', d.calculado_em, 'calculado_lote', d.calculado_lote,
    -- Quem vê todos os setores (super_admin, Analítico de todos os setores):
    -- o % de cada setor do desafio. Os outros só o do próprio setor.
    'setores', CASE WHEN p_todos THEN coalesce((
      SELECT jsonb_agg(public.fn_desafio_vale_setor_json(d.id, s.setor_id)
                       ORDER BY c.nome NULLS LAST, st.nome)
        FROM public.desafio_vale_setores s
        JOIN public.setores st ON st.id = s.setor_id
        LEFT JOIN public.rh_celulas c ON c.id = st.cidade_id
       WHERE s.desafio_id = d.id AND s.participa), '[]'::jsonb) END
  )
  FROM public.desafio_vale d WHERE d.id = p_desafio;
$$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_montar(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- O de quem está no Gestão. Super_admin: o ativo, mesmo não liberado (prévia).
-- A operação: liberado, setor participando, de 3 dias antes do início a 10
-- dias depois do fim (o resultado fica à vista um tempo).
CREATE OR REPLACE FUNCTION public.fn_desafio_vale_atual()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sa    boolean := coalesce(public.fn_user_is_super_admin(), false);
  v_setor uuid    := public.fn_user_setor_id();
  v_hoje  date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_id    uuid;
  v_lib   boolean;
  v_todos boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  IF v_sa THEN
    SELECT c.id, c.liberado INTO v_id, v_lib FROM public.desafio_vale c
     WHERE c.ativo ORDER BY c.atualizado_em DESC LIMIT 1;
  ELSE
    SELECT c.id, c.liberado INTO v_id, v_lib FROM public.desafio_vale c
      JOIN public.desafio_vale_setores s ON s.desafio_id = c.id AND s.setor_id = v_setor AND s.participa
     WHERE c.ativo AND c.liberado AND v_hoje BETWEEN c.inicio - 3 AND c.fim + 10
     ORDER BY c.atualizado_em DESC LIMIT 1;
  END IF;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  PERFORM public.fn_desafio_vale_atualizar_se_preciso(v_id);

  v_todos := v_sa OR coalesce(public.fn_user_tem('analitico_escopo_todos_setores'), false);
  RETURN public.fn_desafio_vale_montar(v_id, v_todos)
      || jsonb_build_object(
           'previa', NOT v_lib, 'super_admin', v_sa,
           'meu_setor', CASE WHEN v_setor IS NOT NULL THEN public.fn_desafio_vale_setor_json(v_id, v_setor) END);
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_atual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_vale_atual() TO authenticated;

-- A tela do super_admin: todos os setores do desafio (participando ou não).
CREATE OR REPLACE FUNCTION public.fn_desafio_vale_detalhe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT coalesce(public.fn_user_is_super_admin(), false) THEN
    RAISE EXCEPTION 'Só super_admin.' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_id FROM public.desafio_vale WHERE ativo ORDER BY atualizado_em DESC LIMIT 1;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  PERFORM public.fn_desafio_vale_atualizar_se_preciso(v_id);
  RETURN public.fn_desafio_vale_montar(v_id, true) || jsonb_build_object(
    'empresa_id', (SELECT empresa_id FROM public.desafio_vale WHERE id = v_id),
    'liberado_em', (SELECT liberado_em FROM public.desafio_vale WHERE id = v_id),
    'todos_setores', coalesce((
      SELECT jsonb_agg(public.fn_desafio_vale_setor_json(v_id, s.setor_id) ORDER BY c.nome NULLS LAST, st.nome)
        FROM public.desafio_vale_setores s
        JOIN public.setores st ON st.id = s.setor_id
        LEFT JOIN public.rh_celulas c ON c.id = st.cidade_id
       WHERE s.desafio_id = v_id), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_detalhe() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_vale_detalhe() TO authenticated;

-- «Recalcular agora»: o super_admin refaz o % dos setores na hora.
CREATE OR REPLACE FUNCTION public.fn_desafio_vale_recalcular(p_desafio uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT coalesce(public.fn_user_is_super_admin(), false) THEN
    RAISE EXCEPTION 'Só super_admin.' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_desafio_vale_calcular(p_desafio);
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_recalcular(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_vale_recalcular(uuid) TO authenticated;

-- ── Ao vivo ────────────────────────────────────────────────────────────────
-- O mesmo sinal do Desafio Cobrança (20261116210000): `desafios:<empresa>`,
-- payload só com o nome da tabela. Quem ouve relê pelo `fn_desafio_vale_atual`.

CREATE OR REPLACE FUNCTION public.fn_realtime_sinal_desafio_vale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa uuid;
BEGIN
  BEGIN
    FOR v_empresa IN SELECT e.id FROM public.empresas e LOOP
      PERFORM public.fn_realtime_sinal_emitir('desafios:' || v_empresa::text,
        jsonb_build_object('tabela', tg_table_name, 'operacao', tg_op, 'importado_por', '[]'::jsonb));
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'desafio_vale: sinal de % falhou: %', tg_table_name, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_realtime_sinal_desafio_vale() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_realtime_sinal_desafio_vale ON public.desafio_vale;
CREATE TRIGGER trg_realtime_sinal_desafio_vale
  AFTER INSERT OR UPDATE OR DELETE ON public.desafio_vale
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_sinal_desafio_vale();

DROP TRIGGER IF EXISTS trg_realtime_sinal_desafio_vale_setores ON public.desafio_vale_setores;
CREATE TRIGGER trg_realtime_sinal_desafio_vale_setores
  AFTER INSERT OR UPDATE OR DELETE ON public.desafio_vale_setores
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_sinal_desafio_vale();

-- ── O desafio de 23 a 30/11/2026, NÃO liberado ─────────────────────────────
--
-- Empresa: a do 59 vigente de novembro (a mesma do Desafio Cobrança).
-- Setores: os ligados a grupo do 59. Participam todos da cobrança, menos
-- Jornada e regra Cofen (a decisão de 16/11 sobre «o que é cobrança»). O
-- super_admin liga e desliga na tela.

DO $semente$
DECLARE
  v_emp uuid;
  v_id  uuid;
BEGIN
  SELECT empresa_id INTO v_emp FROM public.mestre_lotes
   WHERE estado = 'vigente' AND mes = DATE '2026-11-01'
   ORDER BY importado_em DESC LIMIT 1;
  IF v_emp IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.desafio_vale WHERE empresa_id = v_emp AND ativo) THEN RETURN; END IF;

  INSERT INTO public.desafio_vale (empresa_id, inicio, fim, cupom_inicio, cupom_fim)
  VALUES (v_emp, DATE '2026-11-23', DATE '2026-11-30', DATE '2026-11-23', DATE '2026-11-26')
  RETURNING id INTO v_id;

  INSERT INTO public.desafio_vale_setores (desafio_id, setor_id, participa)
  SELECT DISTINCT v_id, s.id, NOT (s.nome ILIKE 'jornada%' OR coalesce(s.regra, '') = 'cofen')
    FROM public.mestre_grupos g
    JOIN public.setores s ON s.id = g.setor_id
   WHERE g.empresa_id = v_emp AND g.estado = 'vinculado'
  ON CONFLICT DO NOTHING;
END
$semente$;

COMMIT;

-- ============================================================================
-- Conferência (só leitura), depois de colar:
--
--   select id, inicio, fim, medias, faixas, cupom_inicio, cupom_fim, liberado
--     from public.desafio_vale where ativo;
--   select st.nome, s.participa from public.desafio_vale_setores s
--     join public.setores st on st.id = s.setor_id order by 2 desc, 1;
-- ============================================================================
