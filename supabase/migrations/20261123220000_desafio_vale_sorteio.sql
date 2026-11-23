-- ============================================================================
-- Desafio do Vale: o sorteio dos cupons do Pix, por setor (23/11/2026)
-- ============================================================================
--
-- Pedido do usuário: «será um sorteio, não importando a quantidade de cupons;
-- cada setor tem a quantidade de pessoas que podem ser sorteadas. Na
-- Manutenção será recebimento e não sorteio. Play 1, Play 2, Play 3 e
-- Receptivo: 3 pessoas ganham; Play Mix: 2; Treinamento: 1».
--
-- Cada setor de Pix tem `sorteio_qtd` ganhadores. Concorrem os operadores com
-- cupom (a cada `cupom_pix` Pix APROVADOS registrados no setor no período, 1
-- cupom). `sorteio_por_cupom` (no desafio) decide o peso:
--
--   false → UMA chance por pessoa com pelo menos 1 cupom (decisão do usuário,
--           23/11: «não importando a quantidade de cupons») — o padrão
--   true  → cada cupom é uma chance (fica como opção na tela)
--
-- Ninguém ganha duas vezes no mesmo setor. O sorteio é feito AQUI
-- (`fn_desafio_vale_sortear`, só super_admin), com o dado do banco, e fica
-- gravado em `desafio_vale_sorteio` com quantas chances cada ganhador tinha e
-- quantos concorriam — para conferir depois. Sortear de novo pede `p_refazer`.
--
-- A Manutenção (cupom_regra = 'ranking') não tem sorteio: são os 2 que mais
-- recebem (20261123200000).
--
-- Já sai configurado (setores pelo nome): Play 1/2/3 e Receptivo = 3; Playmix
-- = 2; Treinamento = 1. Os outros ficam com 0 (o super_admin define na tela).
--
-- MARÍLIA NÃO PARTICIPA (usuário, 23/11): os setores da cidade de Marília
-- (Play Mix Marília, Play 5, Play Night…) saem do desafio inteiro — médias,
-- cupons e sorteio. Colar de novo esta migration tira de novo.
--
-- Reexecutável. Tabela nova, colunas novas e funções.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.desafio_vale_setores
  ADD COLUMN IF NOT EXISTS sorteio_qtd integer NOT NULL DEFAULT 0;
ALTER TABLE public.desafio_vale
  ADD COLUMN IF NOT EXISTS sorteio_por_cupom boolean NOT NULL DEFAULT false;

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'desafio_vale_setores_sorteio_qtd') THEN
    ALTER TABLE public.desafio_vale_setores
      ADD CONSTRAINT desafio_vale_setores_sorteio_qtd CHECK (sorteio_qtd BETWEEN 0 AND 50);
  END IF;
END $chk$;

CREATE TABLE IF NOT EXISTS public.desafio_vale_sorteio (
  desafio_id    uuid NOT NULL REFERENCES public.desafio_vale(id) ON DELETE CASCADE,
  setor_id      uuid NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  posicao       integer NOT NULL,
  perfil_id     uuid NOT NULL,
  nome          text NOT NULL,
  cupons        integer NOT NULL,
  chances       integer NOT NULL,
  -- O retrato do sorteio: quantas pessoas e quantas chances havia no total.
  concorrentes  integer NOT NULL,
  chances_total integer NOT NULL,
  sorteado_em   timestamptz NOT NULL DEFAULT now(),
  sorteado_por  uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  PRIMARY KEY (desafio_id, setor_id, posicao),
  UNIQUE (desafio_id, setor_id, perfil_id)
);
COMMENT ON TABLE public.desafio_vale_sorteio IS
  'Ganhadores do sorteio dos cupons do Pix do Desafio do Vale, por setor (fn_desafio_vale_sortear).';

ALTER TABLE public.desafio_vale_sorteio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS desafio_vale_sorteio_super ON public.desafio_vale_sorteio;
CREATE POLICY desafio_vale_sorteio_super ON public.desafio_vale_sorteio FOR SELECT TO authenticated
  USING ((SELECT public.fn_user_is_super_admin()));
REVOKE ALL ON public.desafio_vale_sorteio FROM anon;
GRANT SELECT ON public.desafio_vale_sorteio TO authenticated;

-- Marília fora do desafio (a cidade do setor).
UPDATE public.desafio_vale_setores s
   SET participa = false
  FROM public.setores st, public.rh_celulas c, public.desafio_vale d
 WHERE st.id = s.setor_id AND c.id = st.cidade_id AND d.id = s.desafio_id AND d.ativo
   AND c.nome ILIKE 'mar_lia%' AND s.participa;

-- A cota de cada setor (pelo nome), no desafio ativo. Só onde ainda está 0.
UPDATE public.desafio_vale_setores s
   SET sorteio_qtd = CASE
         WHEN lower(btrim(st.nome)) IN ('play 1', 'play 2', 'play 3', 'receptivo') THEN 3
         WHEN st.nome ILIKE 'playmix%' THEN 2
         WHEN st.nome ILIKE 'treinamento%' THEN 1
         ELSE 0 END
  FROM public.setores st, public.desafio_vale d
 WHERE st.id = s.setor_id AND d.id = s.desafio_id AND d.ativo AND s.sorteio_qtd = 0;

-- ── Quem concorre num setor ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_desafio_vale_concorrentes(p_desafio uuid, p_setor uuid)
RETURNS TABLE (perfil_id uuid, nome text, aprovados integer, cupons integer, chances integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH d AS (SELECT * FROM public.desafio_vale WHERE id = p_desafio),
  pix AS (
    SELECT a.operador_id, max(coalesce(p.nome, a.operador_nome, 'Sem nome')) AS nome, count(*)::integer AS aprovados
      FROM public.pix_automatico_acordos a
      JOIN d ON a.empresa_id = d.empresa_id
      LEFT JOIN public.perfis p ON p.id = a.operador_id
     WHERE a.setor_id = p_setor AND a.status = 'aprovado'
       AND (a.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN d.cupom_inicio AND d.cupom_fim
     GROUP BY a.operador_id
  )
  SELECT pix.operador_id, pix.nome, pix.aprovados,
         (pix.aprovados / greatest(d.cupom_pix, 1))::integer AS cupons,
         CASE WHEN d.sorteio_por_cupom THEN (pix.aprovados / greatest(d.cupom_pix, 1))::integer
              WHEN pix.aprovados >= d.cupom_pix THEN 1 ELSE 0 END AS chances
    FROM pix, d
   WHERE pix.aprovados >= d.cupom_pix;
$$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_concorrentes(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── O sorteio (só super_admin) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_desafio_vale_sortear(p_setor uuid, p_refazer boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d      public.desafio_vale%ROWTYPE;
  v_qtd    integer;
  v_regra  text;
  v_conc   integer;
  v_total  integer;
  v_resta  integer;
  v_alvo   integer;
  v_escolh record;
  i        integer;
BEGIN
  IF NOT coalesce(public.fn_user_is_super_admin(), false) THEN
    RAISE EXCEPTION 'Só super_admin sorteia.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_d FROM public.desafio_vale WHERE ativo ORDER BY atualizado_em DESC LIMIT 1;
  IF v_d.id IS NULL THEN RAISE EXCEPTION 'Nenhum desafio ativo.'; END IF;
  SELECT s.sorteio_qtd, s.cupom_regra INTO v_qtd, v_regra FROM public.desafio_vale_setores s
   WHERE s.desafio_id = v_d.id AND s.setor_id = p_setor AND s.participa;
  IF v_qtd IS NULL THEN RAISE EXCEPTION 'Setor fora do desafio.'; END IF;
  IF v_regra = 'ranking' THEN RAISE EXCEPTION 'Este setor é de ranking (os que mais recebem), não de sorteio.'; END IF;
  IF v_qtd <= 0 THEN RAISE EXCEPTION 'Defina quantas pessoas ganham neste setor antes de sortear.'; END IF;

  IF EXISTS (SELECT 1 FROM public.desafio_vale_sorteio WHERE desafio_id = v_d.id AND setor_id = p_setor) THEN
    IF NOT p_refazer THEN RAISE EXCEPTION 'Este setor já foi sorteado. Para sortear de novo, confirme «refazer».'; END IF;
    DELETE FROM public.desafio_vale_sorteio WHERE desafio_id = v_d.id AND setor_id = p_setor;
  END IF;

  SELECT count(*), coalesce(sum(c.chances), 0) INTO v_conc, v_total
    FROM public.fn_desafio_vale_concorrentes(v_d.id, p_setor) c WHERE c.chances > 0;

  FOR i IN 1..v_qtd LOOP
    -- As chances de quem ainda não ganhou.
    SELECT coalesce(sum(c.chances), 0) INTO v_resta
      FROM public.fn_desafio_vale_concorrentes(v_d.id, p_setor) c
     WHERE c.chances > 0
       AND c.perfil_id NOT IN (SELECT g.perfil_id FROM public.desafio_vale_sorteio g WHERE g.desafio_id = v_d.id AND g.setor_id = p_setor);
    EXIT WHEN v_resta = 0;
    v_alvo := floor(random() * v_resta)::integer;  -- 0 .. v_resta-1

    SELECT x.perfil_id, x.nome, x.cupons, x.chances INTO v_escolh
      FROM (
        SELECT c.*, sum(c.chances) OVER (ORDER BY c.perfil_id) AS acumulado
          FROM public.fn_desafio_vale_concorrentes(v_d.id, p_setor) c
         WHERE c.chances > 0
           AND c.perfil_id NOT IN (SELECT g.perfil_id FROM public.desafio_vale_sorteio g WHERE g.desafio_id = v_d.id AND g.setor_id = p_setor)
      ) x
     WHERE x.acumulado > v_alvo
     ORDER BY x.acumulado
     LIMIT 1;

    INSERT INTO public.desafio_vale_sorteio
           (desafio_id, setor_id, posicao, perfil_id, nome, cupons, chances, concorrentes, chances_total, sorteado_por)
    VALUES (v_d.id, p_setor, i, v_escolh.perfil_id, v_escolh.nome, v_escolh.cupons, v_escolh.chances, v_conc, v_total, auth.uid());
  END LOOP;

  RETURN jsonb_build_object(
    'concorrentes', v_conc, 'chances_total', v_total, 'qtd', v_qtd,
    'ganhadores', coalesce((SELECT jsonb_agg(jsonb_build_object('posicao', g.posicao, 'perfil_id', g.perfil_id, 'nome', g.nome,
                                                               'cupons', g.cupons, 'chances', g.chances) ORDER BY g.posicao)
                              FROM public.desafio_vale_sorteio g WHERE g.desafio_id = v_d.id AND g.setor_id = p_setor), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_sortear(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_vale_sortear(uuid, boolean) TO authenticated;

-- Antes de sortear: quem concorre e com quantas chances (só super_admin).
CREATE OR REPLACE FUNCTION public.fn_desafio_vale_sorteio_previa(p_setor uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
  RETURN jsonb_build_object(
    'concorrentes', coalesce((SELECT jsonb_agg(jsonb_build_object('perfil_id', c.perfil_id, 'nome', c.nome, 'aprovados', c.aprovados,
                                                                 'cupons', c.cupons, 'chances', c.chances) ORDER BY c.chances DESC, c.nome)
                                FROM public.fn_desafio_vale_concorrentes(v_id, p_setor) c), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_sorteio_previa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_vale_sorteio_previa(uuid) TO authenticated;

-- ── O setor e o desafio, agora com o sorteio ───────────────────────────────

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
    'recebido', s.recebido_auto, 'meta', s.meta_auto,
    'cupom_regra', coalesce(s.cupom_regra, 'pix'), 'cupom_ranking_qtd', coalesce(s.cupom_ranking_qtd, 2),
    'sorteio_qtd', coalesce(s.sorteio_qtd, 0),
    -- Os ganhadores do sorteio do setor (nome e posição): todo mundo do setor vê.
    'ganhadores', coalesce((SELECT jsonb_agg(jsonb_build_object('posicao', g.posicao, 'perfil_id', g.perfil_id, 'nome', g.nome)
                                             ORDER BY g.posicao)
                              FROM public.desafio_vale_sorteio g WHERE g.desafio_id = p_desafio AND g.setor_id = st.id), '[]'::jsonb),
    'sorteado_em', (SELECT max(g.sorteado_em) FROM public.desafio_vale_sorteio g WHERE g.desafio_id = p_desafio AND g.setor_id = st.id))
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
    'cupom_pix', d.cupom_pix, 'cupom_premio', d.cupom_premio, 'sorteio_por_cupom', d.sorteio_por_cupom,
    'liberado', d.liberado, 'fechado_em', d.fechado_em,
    'calculado_em', d.calculado_em, 'calculado_lote', d.calculado_lote,
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

-- O sinal ao vivo quando o sorteio sai (a gaveta mostra os ganhadores).
DROP TRIGGER IF EXISTS trg_realtime_sinal_desafio_vale_sorteio ON public.desafio_vale_sorteio;
CREATE TRIGGER trg_realtime_sinal_desafio_vale_sorteio
  AFTER INSERT OR UPDATE OR DELETE ON public.desafio_vale_sorteio
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_sinal_desafio_vale();

COMMIT;
