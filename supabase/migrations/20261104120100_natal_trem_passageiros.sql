-- ============================================================================
-- Natal: a fila do trenzinho e os cinco passageiros de cada viagem
-- ============================================================================
--
-- Pedido do Cleber, 04/11/2026. O trenzinho de Natal sai da estação do
-- Dashboard a cada viagem levando cinco pessoas sorteadas, uma de cada vez,
-- de surpresa. Quem quer viajar se inscreve UMA vez, clicando na estação; daí
-- em diante entra em todos os sorteios. Ninguém repete no mesmo dia — a não
-- ser que todo mundo da fila já tenha viajado (aí volta quem viajou menos).
--
-- ## Por que no banco
--
-- O sorteio tem de sair igual para todo mundo, e lembrar quem já viajou no
-- dia — então ele é GRAVADO: a primeira pessoa que pergunta pela viagem sorteia, e
-- as outras leem o que ficou gravado. Corrida entre duas perguntas ao mesmo
-- tempo: `ON CONFLICT DO NOTHING` e a releitura deixam valer a primeira.
-- No navegador também não daria: `perfis_select` mostra a cada um só o
-- próprio alcance.
--
-- ## Tabelas
--
-- `natal_trem_inscricoes` — quem está na fila (a pessoa e quando entrou).
-- `natal_trem_viagens`    — o sorteio de cada viagem: empresa, regra, chave
--                           (o minuto da partida, `chaveDoSorteio` em
--                           `src/components/Natal/trem/horario.ts`), o dia
--                           (Brasília) e os cinco, em ordem de embarque.
-- As duas com RLS ligado e sem policy: só as funções abaixo mexem nelas.
--
-- ## Funções (todas para `authenticated`, sobre quem pergunta)
--
-- `fn_natal_trem_inscricao()`            — estou na fila? e quantos estão.
-- `fn_natal_trem_inscrever(p_entrar)`    — entra (true) ou sai (false).
-- `fn_natal_trem_passageiros(p_chave)`   — os passageiros da viagem; sorteia
--                                          na primeira pergunta.
--
-- Quem viaja: os inscritos da empresa de quem pergunta e da mesma REGRA do
-- setor (Nosso produto ou Cofen — CLAUDE.md, «Cofen não é PaguePlay»: são
-- trens diferentes), ativos, não arquivados e não desligados. Primeiro quem
-- ainda não viajou no dia; acabando esses, completa com quem viajou menos
-- vezes (pedido do Cleber, 04/11/2026). O que sai: nome, foto e nome do
-- setor — de quem se inscreveu para isso.
--
-- Limite: só viagens a até 30 minutos de agora (a volta do trem tem ~5 min).
--
-- Reaplicável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- A versão desta migration que nunca foi aplicada tinha outra assinatura.
DROP FUNCTION IF EXISTS public.fn_natal_trem_passageiros(BIGINT[]);

CREATE TABLE IF NOT EXISTS public.natal_trem_inscricoes (
  perfil_id   UUID PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  inscrito_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.natal_trem_inscricoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.natal_trem_viagens (
  empresa_id  UUID   NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  regra       TEXT   NOT NULL,
  chave       BIGINT NOT NULL,
  dia         DATE   NOT NULL,
  passageiros UUID[] NOT NULL,
  sorteado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, regra, chave)
);
CREATE INDEX IF NOT EXISTS natal_trem_viagens_do_dia ON public.natal_trem_viagens (empresa_id, regra, dia);
ALTER TABLE public.natal_trem_viagens ENABLE ROW LEVEL SECURITY;

-- ── Estou na fila? ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_inscricao()
RETURNS TABLE(inscrito BOOLEAN, total INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH eu AS (
    SELECT p.id, p.empresa_id, COALESCE(s.regra, 'nosso_produto') AS regra
      FROM public.perfis p LEFT JOIN public.setores s ON s.id = p.setor_id
     WHERE p.id = auth.uid()
  )
  SELECT EXISTS (SELECT 1 FROM public.natal_trem_inscricoes i, eu WHERE i.perfil_id = eu.id),
         (SELECT count(*)::INT
            FROM public.natal_trem_inscricoes i
            JOIN public.perfis p ON p.id = i.perfil_id
            LEFT JOIN public.setores s ON s.id = p.setor_id, eu
           WHERE p.empresa_id = eu.empresa_id
             AND COALESCE(s.regra, 'nosso_produto') = eu.regra
             AND p.ativo AND NOT p.arquivado AND p.situacao <> 'desligado')
    FROM eu;
$fn$;

-- ── Entrar ou sair da fila ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_inscrever(p_entrar BOOLEAN)
RETURNS TABLE(inscrito BOOLEAN, total INT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF p_entrar THEN
    INSERT INTO public.natal_trem_inscricoes (perfil_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.natal_trem_inscricoes WHERE perfil_id = auth.uid();
  END IF;
  RETURN QUERY SELECT * FROM public.fn_natal_trem_inscricao();
END;
$fn$;

-- ── Os passageiros de uma viagem (sorteia na primeira pergunta) ─────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_passageiros(p_chave BIGINT)
RETURNS TABLE(ordem INT, perfil_id UUID, nome TEXT, foto_url TEXT, setor_nome TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_eu      UUID := auth.uid();
  v_empresa UUID;
  v_regra   TEXT;
  v_dia     DATE;
  v_minuto  BIGINT := floor(extract(epoch FROM now()) / 60)::BIGINT;
  v_lista   UUID[];
BEGIN
  IF v_eu IS NULL OR p_chave IS NULL OR p_chave NOT BETWEEN v_minuto - 30 AND v_minuto + 30 THEN RETURN; END IF;

  SELECT p.empresa_id, COALESCE(s.regra, 'nosso_produto')
    INTO v_empresa, v_regra
    FROM public.perfis p LEFT JOIN public.setores s ON s.id = p.setor_id
   WHERE p.id = v_eu;
  IF v_empresa IS NULL THEN RETURN; END IF;

  SELECT v.passageiros INTO v_lista
    FROM public.natal_trem_viagens v
   WHERE v.empresa_id = v_empresa AND v.regra = v_regra AND v.chave = p_chave;

  IF v_lista IS NULL THEN
    v_dia := (to_timestamp(p_chave * 60) AT TIME ZONE 'America/Sao_Paulo')::DATE;
    SELECT COALESCE(array_agg(x.id), '{}') INTO v_lista
      FROM (
        SELECT p.id
          FROM public.natal_trem_inscricoes i
          JOIN public.perfis p ON p.id = i.perfil_id
          LEFT JOIN public.setores s ON s.id = p.setor_id
         WHERE p.empresa_id = v_empresa
           AND COALESCE(s.regra, 'nosso_produto') = v_regra
           AND p.ativo AND NOT p.arquivado AND p.situacao <> 'desligado'
         -- Primeiro quem ainda não viajou hoje; acabando, quem viajou menos vezes.
         ORDER BY (SELECT count(*) FROM public.natal_trem_viagens v
                    WHERE v.empresa_id = v_empresa AND v.regra = v_regra AND v.dia = v_dia
                      AND p.id = ANY (v.passageiros)),
                  random()
         LIMIT 5
      ) x;
    INSERT INTO public.natal_trem_viagens (empresa_id, regra, chave, dia, passageiros)
    VALUES (v_empresa, v_regra, p_chave, v_dia, v_lista)
    ON CONFLICT DO NOTHING;
    -- Se outra pergunta sorteou ao mesmo tempo, vale a dela.
    SELECT v.passageiros INTO v_lista
      FROM public.natal_trem_viagens v
     WHERE v.empresa_id = v_empresa AND v.regra = v_regra AND v.chave = p_chave;
  END IF;

  RETURN QUERY
  SELECT l.ordem::INT, p.id, p.nome::TEXT, p.foto_url::TEXT, s.nome::TEXT
    FROM unnest(v_lista) WITH ORDINALITY AS l(id, ordem)
    JOIN public.perfis p ON p.id = l.id
    LEFT JOIN public.setores s ON s.id = p.setor_id
   ORDER BY l.ordem;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_natal_trem_inscricao()            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_natal_trem_inscrever(BOOLEAN)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_natal_trem_passageiros(BIGINT)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_inscricao()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_inscrever(BOOLEAN)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_passageiros(BIGINT) TO authenticated;

COMMENT ON TABLE public.natal_trem_inscricoes IS 'Natal 2026: quem entrou na fila do trenzinho. Ver a migration 20261104120100.';
COMMENT ON TABLE public.natal_trem_viagens IS 'Natal 2026: o sorteio gravado de cada viagem do trenzinho (ninguém repete no dia). Ver a migration 20261104120100.';

COMMIT;
