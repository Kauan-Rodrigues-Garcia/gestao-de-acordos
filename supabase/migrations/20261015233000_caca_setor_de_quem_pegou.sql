-- ============================================================================
-- Caça: o SETOR de quem pegou vai na rodada
-- ============================================================================
--
-- ## O pedido (15/10/2026)
--
-- «Nas bruxas aparecer o setor de quem pegou.» A faixa já diz o nome e a foto
-- (`achada_por_nome`, `achada_por_foto`); agora diz também o setor.
--
-- ## O que muda
--
--   1. Coluna nova `abobora_rodadas.achada_por_setor` (text, pode ser nula):
--      o nome do setor de quem pegou, gravado NA HORA do tiro — se a pessoa
--      mudar de setor depois, a rodada continua dizendo de onde ela era.
--   2. `fn_abobora_pegar` lê o setor (`perfis.setor_id` → `setores.nome`)
--      junto com o nome e a foto. O resto da função é o de 20261014200000,
--      igual: mesma assinatura, mesma trava, mesmos recordes.
--
-- O aviso da caça (`fn_abobora_avisar`) manda a linha inteira (`to_jsonb`),
-- então o setor chega às telas sem mexer no aviso. Vale para zumbis e bruxas;
-- quem mostra é a faixa das bruxas (`CacaAbobora/bruxas/faixa.ts`).
--
-- ## Compatibilidade
--
-- Aba aberta antes do deploy ignora a coluna nova. Front novo antes desta
-- migration: a coluna não vem, e a faixa sai sem setor, como antes.
-- Rodadas antigas ficam sem setor (nula).
--
-- Reexecutável.
-- ============================================================================

BEGIN;

ALTER TABLE public.abobora_rodadas
  ADD COLUMN IF NOT EXISTS achada_por_setor text;

COMMENT ON COLUMN public.abobora_rodadas.achada_por_setor IS
  'Nome do setor de quem pegou, gravado na hora do tiro (fn_abobora_pegar).';

-- Tiro no zumbi ou na bruxa. Devolve { ganhou, rodada } — `rodada` é a linha
-- como ficou, para quem perdeu saber quem levou.
CREATE OR REPLACE FUNCTION public.fn_abobora_pegar(
  p_rodada   bigint,
  p_headshot boolean DEFAULT false,
  p_tiro     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- A hora em que o pedido CHEGOU — antes de esperar a trava de ninguém.
  v_agora    timestamptz := clock_timestamp();
  v_rodada   public.abobora_rodadas%ROWTYPE;
  -- `coalesce` nos dois lados: `false OR NULL` é NULL, e headshot é NOT NULL.
  v_headshot boolean := coalesce(p_headshot, false) OR coalesce(p_tiro = 'cabeca', false);
  v_tiro     text;
  v_nome     text;
  v_foto     text;
  v_setor    text;
  v_ms       integer;
  v_rapida   boolean;
  v_hs       boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;

  v_tiro := CASE
    WHEN p_tiro IN ('cabeca', 'corpo', 'vassoura') THEN p_tiro
    WHEN v_headshot THEN 'cabeca'
    ELSE 'corpo'
  END;

  -- A trava que decide: quem chega depois espera aqui e lê a linha já achada.
  SELECT * INTO v_rodada FROM public.abobora_rodadas WHERE id = p_rodada FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ganhou', false, 'rodada', NULL);
  END IF;
  IF v_rodada.situacao <> 'solta' OR v_rodada.expira_em <= v_agora THEN
    RETURN jsonb_build_object('ganhou', false, 'rodada', to_jsonb(v_rodada));
  END IF;

  -- O setor vai junto (15/10/2026): a faixa diz de onde é quem pegou.
  SELECT p.nome, nullif(btrim(p.foto_url), ''), nullif(btrim(s.nome), '')
    INTO v_nome, v_foto, v_setor
    FROM public.perfis p
    LEFT JOIN public.setores s ON s.id = p.setor_id
   WHERE p.id = auth.uid();

  v_ms := greatest(0, round(extract(epoch FROM (v_agora - v_rodada.solta_em)) * 1000))::int;

  -- O mais rápido do dia, de qualquer tiro: precisa ter outro morto hoje para bater.
  v_rapida := EXISTS (
      SELECT 1 FROM public.abobora_rodadas r
       WHERE r.dia = v_rodada.dia AND r.situacao = 'achada' AND r.id <> v_rodada.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.abobora_rodadas r
       WHERE r.dia = v_rodada.dia AND r.situacao = 'achada' AND r.id <> v_rodada.id AND r.ms <= v_ms);

  -- O headshot mais rápido do dia: o mesmo, só entre os headshots.
  v_hs := v_headshot
    AND EXISTS (
      SELECT 1 FROM public.abobora_rodadas r
       WHERE r.dia = v_rodada.dia AND r.situacao = 'achada' AND r.headshot AND r.id <> v_rodada.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.abobora_rodadas r
       WHERE r.dia = v_rodada.dia AND r.situacao = 'achada' AND r.headshot AND r.id <> v_rodada.id
         AND r.ms <= v_ms);

  UPDATE public.abobora_rodadas
     SET situacao                    = 'achada',
         achada_em                   = v_agora,
         achada_por                  = auth.uid(),
         achada_por_nome             = coalesce(nullif(btrim(v_nome), ''), 'Alguém'),
         achada_por_foto             = v_foto,
         achada_por_setor            = v_setor,
         ms                          = v_ms,
         mais_rapida_do_dia          = v_rapida,
         headshot                    = v_headshot,
         headshot_mais_rapido_do_dia = v_hs,
         tiro                        = v_tiro
   WHERE id = v_rodada.id
  RETURNING * INTO v_rodada;

  -- O próximo conta de agora — se a caça ainda está ligada hoje.
  UPDATE public.abobora_caca
     SET proxima_em = public.fn_abobora_sortear(v_agora, dia)
   WHERE id = 1 AND dia = public.fn_abobora_hoje();

  RETURN jsonb_build_object('ganhou', true, 'rodada', to_jsonb(v_rodada));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_abobora_pegar(bigint, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_abobora_pegar(bigint, boolean, text) TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'abobora_rodadas'
                    AND column_name = 'achada_por_setor') THEN
    RAISE EXCEPTION 'abobora_rodadas.achada_por_setor não criada';
  END IF;
  IF position('achada_por_setor' IN pg_get_functiondef('public.fn_abobora_pegar(bigint, boolean, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_abobora_pegar não grava o setor';
  END IF;
END;
$prova$;

COMMIT;

-- ── Para desfazer ───────────────────────────────────────────────────────────
-- Reaplicar a fn_abobora_pegar de 20261014200000_caca_bruxas.sql e depois:
--   ALTER TABLE public.abobora_rodadas DROP COLUMN IF EXISTS achada_por_setor;
