-- ============================================================================
-- Desafio do Vale: o sorteio AO VIVO, setor a setor (26/11/2026)
-- ============================================================================
--
-- Pedido do usuário: «quando eu fizer o sorteio do Play 1, ele aparece ao
-- mesmo tempo para todo mundo do Play 1, com a contagem de 5 segundos e uma
-- animação, e só revela o ganhador quando a contagem acaba. Ninguém pode
-- achar o nome no código antes, e recarregar a página no meio não pode
-- bugar.» O super_admin escolhe o setor, quem assiste (o setor, o gestão
-- inteiro ou pessoa a pessoa) e pode pôr mais alguém para concorrer.
--
-- O ciclo de um sorteio (`desafio_vale_show`):
--
--   aberto    → a plateia vê a tela: o prêmio, quem concorre, «aguardando»
--   contagem  → o super_admin apertou «Começar»: a lista de quem concorre é
--               congelada (`desafio_vale_show_concorrentes`) e `revela_em` =
--               agora + 7 s (2 s de «preparando» + 5 s de contagem)
--   revelado  → o PRIMEIRO pedido depois de `revela_em` faz o sorteio
--   encerrado / cancelado → a tela fecha para todo mundo
--
-- POR QUE NINGUÉM DESCOBRE ANTES: o ganhador não existe até a contagem
-- acabar. O sorteio é feito DENTRO de `fn_vale_show_revelar`, que recusa
-- (AINDA_NAO) qualquer chamada antes de `revela_em` pelo relógio do banco.
-- Não há nome guardado, nem no banco, para ninguém espiar — nem o super_admin.
--
-- Recarregar no meio: o estado mora aqui. `fn_vale_show_meu` devolve o
-- sorteio em que a pessoa está na plateia, com `revela_em` e o `agora` do
-- banco; a tela retoma no segundo certo.
--
-- Os avisos: um Broadcast «vale» no tópico pessoal `corrida-eu:<usuario>`,
-- que o app já ouve para a Corrida da Sorte (policy `corrida_eu_receber`,
-- 20261020130000). Só quem está na plateia recebe. Nenhum tópico novo.
--
-- O resultado é gravado em `desafio_vale_sorteio` (o mesmo do sorteio
-- direto, 20261123220000): a gaveta do setor mostra os ganhadores depois.
--
-- Reexecutável. Só cria tabelas e funções novas; não mexe em linha existente.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.desafio_vale_show (
  id            bigserial PRIMARY KEY,
  desafio_id    uuid NOT NULL REFERENCES public.desafio_vale(id) ON DELETE CASCADE,
  setor_id      uuid NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  estado        text NOT NULL DEFAULT 'aberto'
                CHECK (estado IN ('aberto', 'contagem', 'revelado', 'encerrado', 'cancelado')),
  qtd           integer NOT NULL CHECK (qtd BETWEEN 1 AND 50),
  -- Quem o super_admin pôs para concorrer além dos que têm cupom (1 chance cada).
  extras        uuid[] NOT NULL DEFAULT '{}',
  refazer       boolean NOT NULL DEFAULT false,
  ganhadores    jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  criado_por    uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  revela_em     timestamptz,
  revelado_em   timestamptz,
  encerrado_em  timestamptz
);
COMMENT ON TABLE public.desafio_vale_show IS
  'Sorteio ao vivo do Desafio do Vale (20261126150000). O ganhador só nasce em fn_vale_show_revelar, depois de revela_em.';

-- Um sorteio no ar por vez (aberto ou em contagem).
CREATE UNIQUE INDEX IF NOT EXISTS desafio_vale_show_um_no_ar
  ON public.desafio_vale_show (desafio_id) WHERE estado IN ('aberto', 'contagem');

CREATE TABLE IF NOT EXISTS public.desafio_vale_show_plateia (
  show_id   bigint NOT NULL REFERENCES public.desafio_vale_show(id) ON DELETE CASCADE,
  perfil_id uuid NOT NULL,
  PRIMARY KEY (show_id, perfil_id)
);
CREATE INDEX IF NOT EXISTS desafio_vale_show_plateia_perfil ON public.desafio_vale_show_plateia (perfil_id, show_id DESC);

-- A lista congelada no «Começar»: é dela que sai o ganhador.
CREATE TABLE IF NOT EXISTS public.desafio_vale_show_concorrentes (
  show_id   bigint NOT NULL REFERENCES public.desafio_vale_show(id) ON DELETE CASCADE,
  perfil_id uuid NOT NULL,
  nome      text NOT NULL,
  foto      text,
  cupons    integer NOT NULL,
  chances   integer NOT NULL CHECK (chances > 0),
  extra     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (show_id, perfil_id)
);

-- Ninguém lê as tabelas direto: tudo passa pelas funções abaixo.
ALTER TABLE public.desafio_vale_show ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafio_vale_show_plateia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desafio_vale_show_concorrentes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.desafio_vale_show, public.desafio_vale_show_plateia, public.desafio_vale_show_concorrentes FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.desafio_vale_show_id_seq FROM anon, authenticated;

-- ── Quem concorre (antes de congelar: o cupom de agora + os extras) ─────────

CREATE OR REPLACE FUNCTION public.fn_vale_show_pool(p_show bigint)
RETURNS TABLE (perfil_id uuid, nome text, foto text, cupons integer, chances integer, extra boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH s AS (SELECT * FROM public.desafio_vale_show WHERE id = p_show),
  cupom AS (
    SELECT c.perfil_id, c.nome, c.cupons, c.chances
      FROM s, public.fn_desafio_vale_concorrentes(s.desafio_id, s.setor_id) c
     WHERE c.chances > 0
  )
  SELECT c.perfil_id, coalesce(p.nome, c.nome), p.foto_url, c.cupons, c.chances, false
    FROM cupom c LEFT JOIN public.perfis p ON p.id = c.perfil_id
  UNION ALL
  SELECT p.id, coalesce(p.nome, 'Sem nome'), p.foto_url, 0, 1, true
    FROM s, public.perfis p
   WHERE p.id = ANY (s.extras)
     AND p.id NOT IN (SELECT cupom.perfil_id FROM cupom);
$$;
REVOKE ALL ON FUNCTION public.fn_vale_show_pool(bigint) FROM PUBLIC, anon, authenticated;

-- ── O que a tela recebe (igual para toda a plateia) ─────────────────────────
-- Os ganhadores SÓ entram depois de revelado. Antes disso, eles não existem.

CREATE OR REPLACE FUNCTION public.fn_vale_show_json(p_show bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'setor_id', s.setor_id, 'setor_nome', st.nome,
    'premio', coalesce(nullif(btrim(d.cupom_premio), ''), 'hot dog'),
    'estado', s.estado, 'qtd', s.qtd,
    'criado_em', s.criado_em, 'revela_em', s.revela_em, 'revelado_em', s.revelado_em, 'encerrado_em', s.encerrado_em,
    'plateia', (SELECT count(*) FROM public.desafio_vale_show_plateia pl WHERE pl.show_id = s.id),
    'concorrentes', CASE WHEN s.estado = 'aberto' THEN
        coalesce((SELECT jsonb_agg(jsonb_build_object('perfil_id', c.perfil_id, 'nome', c.nome, 'foto', c.foto) ORDER BY c.nome)
                    FROM public.fn_vale_show_pool(s.id) c), '[]'::jsonb)
      ELSE
        coalesce((SELECT jsonb_agg(jsonb_build_object('perfil_id', c.perfil_id, 'nome', c.nome, 'foto', c.foto) ORDER BY c.nome)
                    FROM public.desafio_vale_show_concorrentes c WHERE c.show_id = s.id), '[]'::jsonb)
      END,
    'ganhadores', CASE WHEN s.estado IN ('revelado', 'encerrado') THEN coalesce(s.ganhadores, '[]'::jsonb) END)
    FROM public.desafio_vale_show s
    JOIN public.desafio_vale d ON d.id = s.desafio_id
    LEFT JOIN public.setores st ON st.id = s.setor_id
   WHERE s.id = p_show;
$$;
REVOKE ALL ON FUNCTION public.fn_vale_show_json(bigint) FROM PUBLIC, anon, authenticated;

-- ── O aviso para a plateia: um Broadcast por pessoa, no tópico pessoal ──────

CREATE OR REPLACE FUNCTION public.fn_vale_show_avisar(p_show bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_carga jsonb;
  v_quem  uuid;
BEGIN
  v_carga := jsonb_build_object('agora', clock_timestamp(), 'show', public.fn_vale_show_json(p_show));
  FOR v_quem IN SELECT pl.perfil_id FROM public.desafio_vale_show_plateia pl WHERE pl.show_id = p_show LOOP
    BEGIN
      PERFORM realtime.send(v_carga, 'vale', 'corrida-eu:' || v_quem::text, true);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'vale_show: aviso para % falhou: %', v_quem, SQLERRM;
    END;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.fn_vale_show_avisar(bigint) FROM PUBLIC, anon, authenticated;

-- ── Abrir (só super_admin) ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vale_show_abrir(
  p_setor uuid, p_plateia uuid[], p_extras uuid[] DEFAULT '{}', p_refazer boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d     public.desafio_vale%ROWTYPE;
  v_qtd   integer;
  v_regra text;
  v_no_ar record;
  v_id    bigint;
  v_velho bigint;
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
  IF coalesce(cardinality(p_plateia), 0) > 3000 THEN RAISE EXCEPTION 'Plateia grande demais.'; END IF;

  SELECT s.id, st.nome INTO v_no_ar FROM public.desafio_vale_show s LEFT JOIN public.setores st ON st.id = s.setor_id
   WHERE s.desafio_id = v_d.id AND s.estado IN ('aberto', 'contagem') LIMIT 1;
  IF v_no_ar.id IS NOT NULL THEN
    RAISE EXCEPTION 'Já tem um sorteio no ar (%). Encerre antes de abrir outro.', coalesce(v_no_ar.nome, 'outro setor');
  END IF;

  IF EXISTS (SELECT 1 FROM public.desafio_vale_sorteio WHERE desafio_id = v_d.id AND setor_id = p_setor) AND NOT p_refazer THEN
    RAISE EXCEPTION 'Este setor já foi sorteado. Para sortear de novo, confirme «refazer».';
  END IF;

  -- O que já foi revelado e ficou na tela de alguém: fecha antes do novo.
  FOR v_velho IN SELECT s.id FROM public.desafio_vale_show s WHERE s.desafio_id = v_d.id AND s.estado = 'revelado' LOOP
    UPDATE public.desafio_vale_show SET estado = 'encerrado', encerrado_em = clock_timestamp() WHERE id = v_velho;
    PERFORM public.fn_vale_show_avisar(v_velho);
  END LOOP;

  INSERT INTO public.desafio_vale_show (desafio_id, setor_id, qtd, extras, refazer, criado_por)
  VALUES (v_d.id, p_setor, v_qtd,
          coalesce((SELECT array_agg(DISTINCT p.id) FROM public.perfis p WHERE p.id = ANY (coalesce(p_extras, '{}'))), '{}'),
          p_refazer, auth.uid())
  RETURNING id INTO v_id;

  -- A plateia: quem foi escolhido (só perfis que existem) e sempre quem sorteia.
  INSERT INTO public.desafio_vale_show_plateia (show_id, perfil_id)
  SELECT v_id, p.id FROM public.perfis p WHERE p.id = ANY (coalesce(p_plateia, '{}')) OR p.id = auth.uid()
  ON CONFLICT DO NOTHING;

  PERFORM public.fn_vale_show_avisar(v_id);
  RETURN jsonb_build_object('agora', clock_timestamp(), 'show', public.fn_vale_show_json(v_id));
END $$;
REVOKE ALL ON FUNCTION public.fn_vale_show_abrir(uuid, uuid[], uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vale_show_abrir(uuid, uuid[], uuid[], boolean) TO authenticated;

-- ── Começar a contagem (só super_admin) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vale_show_comecar(p_show bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  IF NOT coalesce(public.fn_user_is_super_admin(), false) THEN
    RAISE EXCEPTION 'Só super_admin sorteia.' USING ERRCODE = '42501';
  END IF;
  SELECT estado INTO v_estado FROM public.desafio_vale_show WHERE id = p_show FOR UPDATE;
  IF v_estado IS NULL THEN RAISE EXCEPTION 'Sorteio não encontrado.'; END IF;
  IF v_estado <> 'aberto' THEN RAISE EXCEPTION 'Este sorteio já começou.'; END IF;

  DELETE FROM public.desafio_vale_show_concorrentes WHERE show_id = p_show;
  INSERT INTO public.desafio_vale_show_concorrentes (show_id, perfil_id, nome, foto, cupons, chances, extra)
  SELECT p_show, c.perfil_id, c.nome, c.foto, c.cupons, c.chances, c.extra FROM public.fn_vale_show_pool(p_show) c;
  IF NOT EXISTS (SELECT 1 FROM public.desafio_vale_show_concorrentes WHERE show_id = p_show) THEN
    RAISE EXCEPTION 'Ninguém concorrendo neste setor — nada a sortear.';
  END IF;

  UPDATE public.desafio_vale_show
     SET estado = 'contagem', revela_em = clock_timestamp() + interval '7 seconds'
   WHERE id = p_show;
  PERFORM public.fn_vale_show_avisar(p_show);
  RETURN jsonb_build_object('agora', clock_timestamp(), 'show', public.fn_vale_show_json(p_show));
END $$;
REVOKE ALL ON FUNCTION public.fn_vale_show_comecar(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vale_show_comecar(bigint) TO authenticated;

-- ── Revelar: o sorteio acontece AQUI, e só depois de revela_em ─────────────
-- Qualquer pessoa da plateia pode pedir (a tela do super_admin pode ter
-- fechado). O primeiro pedido sorteia; os outros esperam a trava e leem.

CREATE OR REPLACE FUNCTION public.fn_vale_show_revelar(p_show bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_s      public.desafio_vale_show%ROWTYPE;
  v_conc   integer;
  v_total  integer;
  v_resta  integer;
  v_alvo   integer;
  v_escolh record;
  v_ja     uuid[] := '{}';
  v_lista  jsonb := '[]'::jsonb;
  i        integer;
BEGIN
  IF NOT coalesce(public.fn_user_is_super_admin(), false)
     AND NOT EXISTS (SELECT 1 FROM public.desafio_vale_show_plateia WHERE show_id = p_show AND perfil_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sorteio não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s FROM public.desafio_vale_show WHERE id = p_show FOR UPDATE;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'Sorteio não encontrado.'; END IF;

  IF v_s.estado = 'contagem' THEN
    IF clock_timestamp() < v_s.revela_em THEN
      RAISE EXCEPTION 'AINDA_NAO: a contagem ainda não acabou.';
    END IF;

    SELECT count(*), coalesce(sum(chances), 0) INTO v_conc, v_total
      FROM public.desafio_vale_show_concorrentes WHERE show_id = p_show;

    FOR i IN 1..v_s.qtd LOOP
      SELECT coalesce(sum(c.chances), 0) INTO v_resta
        FROM public.desafio_vale_show_concorrentes c
       WHERE c.show_id = p_show AND NOT (c.perfil_id = ANY (v_ja));
      EXIT WHEN v_resta = 0;
      v_alvo := floor(random() * v_resta)::integer;  -- 0 .. v_resta-1

      SELECT x.perfil_id, x.nome, x.foto, x.cupons, x.chances INTO v_escolh
        FROM (
          SELECT c.*, sum(c.chances) OVER (ORDER BY c.perfil_id) AS acumulado
            FROM public.desafio_vale_show_concorrentes c
           WHERE c.show_id = p_show AND NOT (c.perfil_id = ANY (v_ja))
        ) x
       WHERE x.acumulado > v_alvo
       ORDER BY x.acumulado
       LIMIT 1;

      v_ja := v_ja || v_escolh.perfil_id;
      v_lista := v_lista || jsonb_build_array(jsonb_build_object(
        'posicao', i, 'perfil_id', v_escolh.perfil_id, 'nome', v_escolh.nome, 'foto', v_escolh.foto));
    END LOOP;

    -- O resultado oficial do setor (a gaveta e a lista de quem ganhou leem daqui).
    DELETE FROM public.desafio_vale_sorteio WHERE desafio_id = v_s.desafio_id AND setor_id = v_s.setor_id;
    INSERT INTO public.desafio_vale_sorteio
           (desafio_id, setor_id, posicao, perfil_id, nome, cupons, chances, concorrentes, chances_total, sorteado_por)
    SELECT v_s.desafio_id, v_s.setor_id, (g->>'posicao')::integer, c.perfil_id, c.nome, c.cupons, c.chances,
           v_conc, v_total, v_s.criado_por
      FROM jsonb_array_elements(v_lista) g
      JOIN public.desafio_vale_show_concorrentes c ON c.show_id = p_show AND c.perfil_id = (g->>'perfil_id')::uuid;

    UPDATE public.desafio_vale_show
       SET estado = 'revelado', revelado_em = clock_timestamp(), ganhadores = v_lista
     WHERE id = p_show;
    PERFORM public.fn_vale_show_avisar(p_show);
  END IF;

  RETURN jsonb_build_object('agora', clock_timestamp(), 'show', public.fn_vale_show_json(p_show));
END $$;
REVOKE ALL ON FUNCTION public.fn_vale_show_revelar(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vale_show_revelar(bigint) TO authenticated;

-- ── Encerrar / cancelar (só super_admin): a tela fecha para todo mundo ──────

CREATE OR REPLACE FUNCTION public.fn_vale_show_encerrar(p_show bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  IF NOT coalesce(public.fn_user_is_super_admin(), false) THEN
    RAISE EXCEPTION 'Só super_admin.' USING ERRCODE = '42501';
  END IF;
  SELECT estado INTO v_estado FROM public.desafio_vale_show WHERE id = p_show FOR UPDATE;
  IF v_estado IS NULL THEN RAISE EXCEPTION 'Sorteio não encontrado.'; END IF;
  IF v_estado IN ('encerrado', 'cancelado') THEN
    RETURN jsonb_build_object('agora', clock_timestamp(), 'show', public.fn_vale_show_json(p_show));
  END IF;
  UPDATE public.desafio_vale_show
     SET estado = CASE WHEN v_estado = 'revelado' THEN 'encerrado' ELSE 'cancelado' END,
         encerrado_em = clock_timestamp()
   WHERE id = p_show;
  PERFORM public.fn_vale_show_avisar(p_show);
  RETURN jsonb_build_object('agora', clock_timestamp(), 'show', public.fn_vale_show_json(p_show));
END $$;
REVOKE ALL ON FUNCTION public.fn_vale_show_encerrar(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vale_show_encerrar(bigint) TO authenticated;

-- ── O sorteio em que estou na plateia (ao abrir o app e ao reconectar) ─────

CREATE OR REPLACE FUNCTION public.fn_vale_show_meu()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('agora', clock_timestamp(), 'show', (
    SELECT public.fn_vale_show_json(s.id)
      FROM public.desafio_vale_show_plateia pl
      JOIN public.desafio_vale_show s ON s.id = pl.show_id
     WHERE pl.perfil_id = auth.uid()
       AND s.estado IN ('aberto', 'contagem', 'revelado')
       AND s.criado_em > now() - interval '12 hours'
     ORDER BY s.id DESC
     LIMIT 1));
$$;
REVOKE ALL ON FUNCTION public.fn_vale_show_meu() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vale_show_meu() TO authenticated;

COMMIT;
