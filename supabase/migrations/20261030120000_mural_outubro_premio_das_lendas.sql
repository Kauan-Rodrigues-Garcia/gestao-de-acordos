-- ============================================================================
-- Mural de Outubro: o prêmio das Lendas de verdade
-- 30/10/2026 · pedido do Kauan
-- ============================================================================
--
-- O prêmio das Lendas (a garrafa) era de teste: os cliques e a roleta
-- ficavam no navegador, qualquer um clicava pelas três e cada tela sorteava
-- um ganhador diferente. Agora:
--
--   - só as três Lendas clicam, cada uma na própria tela: o banco confere
--     quem está logada (auth.uid()) e recusa todo o resto;
--   - quando a terceira clica, o banco sorteia UMA vez (random(), as três com
--     a mesma chance) e grava; todas as telas mostram o mesmo ganhador;
--   - a roleta gira AO MESMO TEMPO em todas as telas: 10 s depois do sorteio
--     (`gira_em`, pela hora do banco), com a contagem na tela. Os 10 s cobrem
--     a releitura de cada tela (4 s) com folga;
--   - o super_admin pode zerar (cliques e ganhador), se der algo errado.
--
-- Quem é cada Lenda: o top 3 do retrato de 26/10 (`PortalOutubro/dados.ts`,
-- posição 1, 2, 3). O id é o do nome do arquivo da foto do perfil
-- (`avatars/<perfil.id>`, Layout.tsx), que o mural já usa. A prova abaixo
-- confere que cada id existe em `perfis` e que o primeiro nome bate — se não
-- bater, nada é gravado.
--
-- A tela relê `fn_mural_lendas_ler` a cada poucos segundos, só enquanto a
-- janela do prêmio está aberta. Sem broadcast: não mexe no sinal de ninguém.
--
-- Nenhuma linha de dado existente muda. Reexecutável (não apaga cliques já
-- feitos): se a primeira versão deste arquivo já foi colada, colar de novo só
-- troca `fn_mural_lendas_ler` (que ganhou `agora` e `gira_em`).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.mural_outubro_lendas (
  posicao    SMALLINT PRIMARY KEY CHECK (posicao BETWEEN 1 AND 3),
  perfil_id  UUID NOT NULL UNIQUE,
  nome       TEXT NOT NULL,
  clicou_em  TIMESTAMPTZ,
  ganhou_em  TIMESTAMPTZ
);

COMMENT ON TABLE public.mural_outubro_lendas IS
  'As três Lendas do Mural de Outubro e o prêmio delas: quem já clicou e quem ganhou (sorteio único '
  'no banco). Escrita só por fn_mural_lendas_clicar / _zerar. Ver 20261030120000.';

INSERT INTO public.mural_outubro_lendas (posicao, perfil_id, nome) VALUES
  (1, '4f2ca1aa-8da8-450e-9b09-a5734072c030', 'Erika Eduarda'),
  (2, '0744c00a-cd73-4189-bc49-c1d4332eed43', 'Ayslan Silva'),
  (3, '2d917b2f-233f-4b18-9165-049863927958', 'Nicole Pacheco')
ON CONFLICT (posicao) DO NOTHING;

ALTER TABLE public.mural_outubro_lendas ENABLE ROW LEVEL SECURITY;
-- Sem policy: a leitura é `fn_mural_lendas_ler`, que não expõe os ids.
REVOKE ALL ON public.mural_outubro_lendas FROM anon, authenticated;
GRANT ALL ON public.mural_outubro_lendas TO service_role;

-- ── Ler ──────────────────────────────────────────────────────────────────────
-- { agora: hora do banco, lendas: [{posicao, clicou}], eu: posição de quem
--   chama (ou null), ganhador: posição (ou null), gira_em: quando a roleta
--   gira em todas as telas (10 s depois do sorteio, ou null) }
CREATE OR REPLACE FUNCTION public.fn_mural_lendas_ler()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'agora',    now(),
    'lendas',   coalesce((SELECT jsonb_agg(jsonb_build_object('posicao', l.posicao, 'clicou', l.clicou_em IS NOT NULL)
                                   ORDER BY l.posicao)
                            FROM public.mural_outubro_lendas l), '[]'::jsonb),
    'eu',       (SELECT l.posicao FROM public.mural_outubro_lendas l WHERE l.perfil_id = auth.uid()),
    'ganhador', (SELECT l.posicao FROM public.mural_outubro_lendas l WHERE l.ganhou_em IS NOT NULL),
    'gira_em',  (SELECT l.ganhou_em + interval '10 seconds' FROM public.mural_outubro_lendas l WHERE l.ganhou_em IS NOT NULL));
$function$;

REVOKE ALL ON FUNCTION public.fn_mural_lendas_ler() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mural_lendas_ler() TO authenticated;

-- ── Clicar: só a própria Lenda; a terceira dispara o sorteio ────────────────
CREATE OR REPLACE FUNCTION public.fn_mural_lendas_clicar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu smallint;
BEGIN
  SELECT l.posicao INTO v_eu FROM public.mural_outubro_lendas l WHERE l.perfil_id = auth.uid();
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'SO_AS_LENDAS: só as três Lendas liberam o prêmio' USING ERRCODE = '42501';
  END IF;

  -- As três linhas presas, sempre na mesma ordem: duas clicando juntas não
  -- sorteiam duas vezes (a segunda espera e já vê o ganhador da primeira).
  PERFORM 1 FROM public.mural_outubro_lendas l ORDER BY l.posicao FOR UPDATE;

  UPDATE public.mural_outubro_lendas
     SET clicou_em = coalesce(clicou_em, now())
   WHERE posicao = v_eu;

  IF NOT EXISTS (SELECT 1 FROM public.mural_outubro_lendas WHERE clicou_em IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.mural_outubro_lendas WHERE ganhou_em IS NOT NULL) THEN
    UPDATE public.mural_outubro_lendas
       SET ganhou_em = now()
     WHERE posicao = (SELECT l.posicao FROM public.mural_outubro_lendas l ORDER BY random() LIMIT 1);
  END IF;

  RETURN public.fn_mural_lendas_ler();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_mural_lendas_clicar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mural_lendas_clicar() TO authenticated;

-- ── Zerar (super_admin): cliques e ganhador ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mural_lendas_zerar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin zera o prêmio das Lendas' USING ERRCODE = '42501';
  END IF;
  UPDATE public.mural_outubro_lendas SET clicou_em = NULL, ganhou_em = NULL
   WHERE clicou_em IS NOT NULL OR ganhou_em IS NOT NULL;
  RETURN public.fn_mural_lendas_ler();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_mural_lendas_zerar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mural_lendas_zerar() TO authenticated;

-- ── Prova ──────────────────────────────────────────────────────────────────
DO $prova$
DECLARE
  r record;
BEGIN
  IF (SELECT count(*) FROM public.mural_outubro_lendas) <> 3 THEN
    RAISE EXCEPTION 'mural_outubro_lendas: deviam ser 3 Lendas';
  END IF;
  -- Cada id existe e o primeiro nome bate com o do mural.
  FOR r IN SELECT l.posicao, l.nome, p.nome AS no_perfil
             FROM public.mural_outubro_lendas l
             LEFT JOIN public.perfis p ON p.id = l.perfil_id LOOP
    IF r.no_perfil IS NULL THEN
      RAISE EXCEPTION 'mural_outubro_lendas: % (posição %) não está em perfis', r.nome, r.posicao;
    END IF;
    IF lower(split_part(trim(r.no_perfil), ' ', 1)) <> lower(split_part(r.nome, ' ', 1)) THEN
      RAISE EXCEPTION 'mural_outubro_lendas: posição % é «%» no perfil, esperado «%»', r.posicao, r.no_perfil, r.nome;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.mural_outubro_lendas WHERE ganhou_em IS NOT NULL) > 1 THEN
    RAISE EXCEPTION 'mural_outubro_lendas: mais de um ganhador';
  END IF;
  IF has_table_privilege('authenticated', 'public.mural_outubro_lendas', 'SELECT')
     OR has_table_privilege('authenticated', 'public.mural_outubro_lendas', 'UPDATE') THEN
    RAISE EXCEPTION 'mural_outubro_lendas: tabela aberta demais';
  END IF;
END;
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Para conferir depois ───────────────────────────────────────────────────
-- SELECT posicao, nome, clicou_em, ganhou_em FROM public.mural_outubro_lendas ORDER BY posicao;

-- ── Para desfazer ──────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.fn_mural_lendas_zerar(), public.fn_mural_lendas_clicar(),
--   public.fn_mural_lendas_ler();
-- DROP TABLE IF EXISTS public.mural_outubro_lendas;
