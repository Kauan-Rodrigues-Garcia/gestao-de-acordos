-- ============================================================================
-- Banco de Horas: aba própria (18/11/2026)
-- ============================================================================
--
-- O painel de banco de horas (relatório HRBH102 do DP, «Vencimento de
-- Lançamentos não Compensados») era um HTML solto, com os dados no IndexedDB
-- de um computador só. Ele vira a aba Banco de Horas do menu, com os dados
-- aqui e cada setor vendo o próprio.
--
-- ## Como o dado fica guardado
--
-- Uma linha por SETOR DO DP por data do «Saldo Banco em»: é a unidade que o DP
-- manda (um CSV por setor). Importar de novo só mexe no que mudou:
--
--   * setor novo naquela data ........ entra;
--   * setor igual (mesma assinatura) .. não é tocado;
--   * setor diferente ................ é trocado pela versão nova.
--
-- Setor que não veio no lote fica como estava. É a mesma regra do painel solto
-- (`importar()` do HTML), agora no banco: `fn_banco_horas_importar`.
--
-- ## Quem vê o quê
--
-- O setor do DP («HOME RECEPTIVO», «PLAY 2»...) não é o setor do gestão. O
-- vínculo fica em `banco_horas_mapa`, configurado na própria aba por quem
-- gerencia (um setor do DP pode cair em mais de um setor do gestão).
--
--   ver_banco_horas ................... abre a aba
--   banco_horas_escopo_setor .......... vê os setores do DP ligados ao seu setor
--   banco_horas_escopo_todos_setores .. vê todos
--   banco_horas_gerenciar ............. importa, apaga relatório e liga os setores
--                                       (exige todos_setores: quem importa vê o
--                                        que está importando)
--
-- As quatro nascem com padrão vazio: nenhum cargo configurável ganha acesso, e
-- administrador/super_admin enxergam por acesso total, como toda chave não
-- explícita (§2.4-b). A gerência e os líderes entram ligando no painel.
--
-- ⚠️ `banco_horas` entra no registro de abas com escopo. `fn_user_escopo_perfis`
-- é o MAIOR escopo entre as abas: um cargo com `banco_horas_escopo_todos_setores`
-- passa a alcançar `perfis` da empresa (§2.4-c, «o escopo por aba também amplia»).
-- Nasce desligado para todo mundo, então hoje nada muda.
--
-- Escrita só por RPC. A tabela não tem política de INSERT/UPDATE/DELETE.
--
-- Pode rodar de novo, inclusive por cima do primeiro rascunho desta migration
-- (que deixava a aba dentro do Fechamento, chave `fechamento_sub_banco_horas`):
-- as cadeias `_antes_` só renomeiam uma vez, e a chave antiga é tirada.
--
-- Reverter: DROP das duas tabelas e das funções `fn_banco_horas_*`; renomear
-- `fn_permissoes_catalogo_antes_banco_horas_20261118` e
-- `fn_abas_escopo_antes_banco_horas_20261118` de volta. As chaves semeadas
-- ficam sem efeito.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. As chaves no catálogo ────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_banco_horas_20261118()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_banco_horas_20261118;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_banco_horas_20261118() IS
  'Retrato do catalogo antes das chaves do Banco de horas (18/11/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_banco_horas_20261118()
  UNION ALL
  SELECT * FROM (VALUES
    ('ver_banco_horas',                  ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('banco_horas_escopo_setor',         ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('banco_horas_escopo_todos_setores', ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('banco_horas_gerenciar',            ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261118180000 soma as chaves do Banco de horas.';

-- ── 2. A aba `banco_horas` no registro de escopo ────────────────────────────
--
-- Desligar `ver_banco_horas` torna os níveis inefetivos (§2.4-c, regra 2).

DO $$
BEGIN
  IF to_regprocedure('public.fn_abas_escopo_antes_banco_horas_20261118()') IS NULL THEN
    ALTER FUNCTION public.fn_abas_escopo() RENAME TO fn_abas_escopo_antes_banco_horas_20261118;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_abas_escopo()
RETURNS TABLE(aba TEXT, chave_aba TEXT)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT a.aba, a.chave_aba
    FROM public.fn_abas_escopo_antes_banco_horas_20261118() a
   WHERE a.aba <> 'banco_horas'
  UNION ALL
  VALUES ('banco_horas', 'ver_banco_horas');
$function$;

COMMENT ON FUNCTION public.fn_abas_escopo() IS
  'Registro de abas com escopo. `banco_horas` entrou em 20261118180000 (aba '
  'propria, niveis setor e todos_setores).';

-- ── 3. Semear ───────────────────────────────────────────────────────────────

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- Cargo fora da lista da semeadura (rh, ou algum gravado à mão): só as chaves
-- que faltam, com o padrão do catálogo — que é ninguém.
UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || (
         SELECT COALESCE(jsonb_object_agg(c.chave, cp.cargo = ANY (COALESCE(c.padrao, ARRAY[]::TEXT[]))), '{}'::jsonb)
           FROM public.fn_permissoes_catalogo() c
          WHERE c.chave IN ('ver_banco_horas', 'banco_horas_escopo_setor',
                            'banco_horas_escopo_todos_setores', 'banco_horas_gerenciar')
            AND NOT (cp.permissoes ? c.chave)
       )
 WHERE cp.empresa_id IN (SELECT e.id FROM public.empresas e WHERE e.slug = 'bookplay')
   AND cp.cargo NOT IN ('administrador', 'super_admin')
   AND EXISTS (
         SELECT 1 FROM unnest(ARRAY['ver_banco_horas', 'banco_horas_escopo_setor',
                                    'banco_horas_escopo_todos_setores', 'banco_horas_gerenciar']) k
          WHERE NOT (cp.permissoes ? k));

-- A chave do primeiro rascunho (aba dentro do Fechamento) não existe mais.
UPDATE public.cargos_permissoes
   SET permissoes = permissoes - 'fechamento_sub_banco_horas'
 WHERE permissoes ? 'fechamento_sub_banco_horas';

-- ── 4. As tabelas ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.banco_horas_setores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- A data do «Saldo Banco em» do relatório. Um relatório = uma data.
  saldo_em        DATE NOT NULL,
  -- A empresa do DP (3 = Book Play, 5 = Pague Play) e o setor como o DP escreve.
  empresa_codigo  TEXT NOT NULL,
  empresa_nome    TEXT,
  setor_dp        TEXT NOT NULL,
  depto           TEXT,
  hierarquia      TEXT,
  arquivo         TEXT,
  -- Quando o DP gerou o arquivo (cabeçalho «HRBH102 ... dd/mm/aaaa - hh:mm»).
  gerado_em       TIMESTAMP WITHOUT TIME ZONE,
  usuario_dp      TEXT,
  -- [{ mat, nome, saldo (min), em (data), venc: [[data, min], ...] }]
  pessoas         JSONB NOT NULL CHECK (jsonb_typeof(pessoas) = 'array'),
  -- Mesmas pessoas, saldos e vencimentos = mesma assinatura = nada a trocar.
  assinatura      TEXT NOT NULL,
  importado_por   UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  importado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT banco_horas_setores_unico UNIQUE (empresa_id, saldo_em, empresa_codigo, setor_dp)
);

CREATE INDEX IF NOT EXISTS banco_horas_setores_setor_idx
  ON public.banco_horas_setores (empresa_id, empresa_codigo, setor_dp);

COMMENT ON TABLE public.banco_horas_setores IS
  'Banco de horas do DP (HRBH102): uma linha por setor do DP por data de saldo. '
  'Escrita so por fn_banco_horas_importar / fn_banco_horas_apagar. 20261118180000.';

CREATE TABLE IF NOT EXISTS public.banco_horas_mapa (
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  empresa_codigo  TEXT NOT NULL,
  setor_dp        TEXT NOT NULL,
  setor_id        UUID NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  atualizado_por  UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, empresa_codigo, setor_dp, setor_id)
);

CREATE INDEX IF NOT EXISTS banco_horas_mapa_setor_idx ON public.banco_horas_mapa (setor_id);

COMMENT ON TABLE public.banco_horas_mapa IS
  'Qual setor do gestao enxerga cada setor do DP no Banco de horas (escopo setor). '
  'Escrita so por fn_banco_horas_mapa_salvar. 20261118180000.';

-- ── 5. Alcance ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_banco_horas_alcanca(
  p_empresa_id UUID, p_empresa_codigo TEXT, p_setor_dp TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH nivel AS (SELECT public.fn_user_escopo('banco_horas') AS n)
  SELECT public.fn_can_access_empresa(p_empresa_id)
    AND CASE
      WHEN (SELECT n FROM nivel) >= 3 THEN TRUE
      WHEN (SELECT n FROM nivel) = 2 THEN EXISTS (
        SELECT 1 FROM public.banco_horas_mapa m
         WHERE m.empresa_id     = p_empresa_id
           AND m.empresa_codigo = p_empresa_codigo
           AND m.setor_dp       = p_setor_dp
           AND m.setor_id IN (SELECT s FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s)
      )
      ELSE FALSE
    END;
$function$;

REVOKE ALL ON FUNCTION public.fn_banco_horas_alcanca(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_banco_horas_alcanca(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_banco_horas_alcanca(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_banco_horas_alcanca(UUID, TEXT, TEXT) IS
  'O usuario logado ve este setor do DP no Banco de horas? '
  'nivel 3 = empresa; nivel 2 = setores do DP ligados (banco_horas_mapa) aos setores do usuario.';

CREATE OR REPLACE FUNCTION public.fn_banco_horas_pode_gerenciar(p_empresa_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_can_access_empresa(p_empresa_id)
    AND public.fn_user_escopo('banco_horas') >= 3
    AND public.fn_user_tem('banco_horas_gerenciar');
$function$;

REVOKE ALL ON FUNCTION public.fn_banco_horas_pode_gerenciar(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_banco_horas_pode_gerenciar(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_banco_horas_pode_gerenciar(UUID) TO authenticated;

-- ── 6. RLS: só leitura ──────────────────────────────────────────────────────

ALTER TABLE public.banco_horas_setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banco_horas_mapa    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.banco_horas_setores FROM anon;
REVOKE ALL ON TABLE public.banco_horas_mapa    FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.banco_horas_setores FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.banco_horas_mapa    FROM authenticated;
GRANT SELECT ON TABLE public.banco_horas_setores TO authenticated;
GRANT SELECT ON TABLE public.banco_horas_mapa    TO authenticated;

DROP POLICY IF EXISTS banco_horas_setores_select ON public.banco_horas_setores;
CREATE POLICY banco_horas_setores_select ON public.banco_horas_setores
  FOR SELECT TO authenticated
  USING (public.fn_banco_horas_alcanca(empresa_id, empresa_codigo, setor_dp));

-- O vínculo não tem dado de pessoa; quem abre a aba com algum alcance o lê.
DROP POLICY IF EXISTS banco_horas_mapa_select ON public.banco_horas_mapa;
CREATE POLICY banco_horas_mapa_select ON public.banco_horas_mapa
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_can_access_empresa(empresa_id))
    AND (SELECT public.fn_user_escopo('banco_horas')) >= 2
  );

-- ── 7. Importar: só o que mudou ─────────────────────────────────────────────
--
-- `p_setores`: [{ saldo_em, empresa_codigo, empresa_nome, setor_dp, depto,
-- hierarquia, arquivo, gerado_em, usuario_dp, pessoas, assinatura }].
-- Devolve { novos, trocados, iguais }.

CREATE OR REPLACE FUNCTION public.fn_banco_horas_importar(p_empresa_id UUID, p_setores JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_s         JSONB;
  v_saldo_em  DATE;
  v_codigo    TEXT;
  v_setor     TEXT;
  v_ass       TEXT;
  v_atual     RECORD;
  v_novos     INTEGER := 0;
  v_trocados  INTEGER := 0;
  v_iguais    INTEGER := 0;
BEGIN
  IF NOT public.fn_banco_horas_pode_gerenciar(p_empresa_id) THEN
    RAISE EXCEPTION 'BANCO_HORAS_SEM_PERMISSAO: voce nao pode importar o banco de horas.'
      USING ERRCODE = '42501';
  END IF;
  IF p_setores IS NULL OR jsonb_typeof(p_setores) <> 'array' THEN
    RAISE EXCEPTION 'BANCO_HORAS_FORMATO: a lista de setores nao veio.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_setores) > 500 THEN
    RAISE EXCEPTION 'BANCO_HORAS_FORMATO: mais de 500 setores num lote.' USING ERRCODE = '22023';
  END IF;

  FOR v_s IN SELECT * FROM jsonb_array_elements(p_setores) LOOP
    v_saldo_em := NULLIF(v_s->>'saldo_em', '')::DATE;
    v_codigo   := NULLIF(btrim(v_s->>'empresa_codigo'), '');
    v_setor    := NULLIF(btrim(v_s->>'setor_dp'), '');
    v_ass      := COALESCE(v_s->>'assinatura', '');
    IF v_saldo_em IS NULL OR v_codigo IS NULL OR v_setor IS NULL
       OR jsonb_typeof(v_s->'pessoas') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'BANCO_HORAS_FORMATO: setor sem data, empresa, nome ou pessoas.' USING ERRCODE = '22023';
    END IF;

    SELECT id, assinatura INTO v_atual
      FROM public.banco_horas_setores
     WHERE empresa_id = p_empresa_id AND saldo_em = v_saldo_em
       AND empresa_codigo = v_codigo AND setor_dp = v_setor
     FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.banco_horas_setores (
        empresa_id, saldo_em, empresa_codigo, empresa_nome, setor_dp, depto, hierarquia,
        arquivo, gerado_em, usuario_dp, pessoas, assinatura, importado_por
      ) VALUES (
        p_empresa_id, v_saldo_em, v_codigo, v_s->>'empresa_nome', v_setor, v_s->>'depto',
        v_s->>'hierarquia', v_s->>'arquivo', NULLIF(v_s->>'gerado_em', '')::TIMESTAMP,
        v_s->>'usuario_dp', v_s->'pessoas', v_ass, (SELECT auth.uid())
      );
      v_novos := v_novos + 1;
    ELSIF v_atual.assinatura = v_ass THEN
      v_iguais := v_iguais + 1;
    ELSE
      UPDATE public.banco_horas_setores
         SET empresa_nome = v_s->>'empresa_nome',
             depto        = v_s->>'depto',
             hierarquia   = v_s->>'hierarquia',
             arquivo      = v_s->>'arquivo',
             gerado_em    = NULLIF(v_s->>'gerado_em', '')::TIMESTAMP,
             usuario_dp   = v_s->>'usuario_dp',
             pessoas      = v_s->'pessoas',
             assinatura   = v_ass,
             importado_por = (SELECT auth.uid()),
             importado_em  = NOW()
       WHERE id = v_atual.id;
      v_trocados := v_trocados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('novos', v_novos, 'trocados', v_trocados, 'iguais', v_iguais);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_banco_horas_importar(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_banco_horas_importar(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_banco_horas_importar(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_banco_horas_importar(UUID, JSONB) IS
  'Grava os setores de um lote do HRBH102: novo entra, igual (assinatura) fica, '
  'diferente e trocado. Exige banco_horas_gerenciar + todos_setores. 20261118180000.';

-- ── 8. Apagar um relatório (uma data inteira) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_banco_horas_apagar(p_empresa_id UUID, p_saldo_em DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_n INTEGER;
BEGIN
  IF NOT public.fn_banco_horas_pode_gerenciar(p_empresa_id) THEN
    RAISE EXCEPTION 'BANCO_HORAS_SEM_PERMISSAO: voce nao pode apagar o banco de horas.'
      USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.banco_horas_setores
   WHERE empresa_id = p_empresa_id AND saldo_em = p_saldo_em;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_banco_horas_apagar(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_banco_horas_apagar(UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_banco_horas_apagar(UUID, DATE) TO authenticated;

-- ── 9. Ligar setor do DP a setor do gestão ──────────────────────────────────
--
-- `p_mapa`: [{ empresa_codigo, setor_dp, setor_ids: [uuid, ...] }]. Cada par
-- listado tem os vínculos trocados pelos da lista (lista vazia = desliga).
-- Par que não veio fica como estava.

CREATE OR REPLACE FUNCTION public.fn_banco_horas_mapa_salvar(p_empresa_id UUID, p_mapa JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_m      JSONB;
  v_codigo TEXT;
  v_setor  TEXT;
  v_n      INTEGER := 0;
  v_add    INTEGER;
BEGIN
  IF NOT public.fn_banco_horas_pode_gerenciar(p_empresa_id) THEN
    RAISE EXCEPTION 'BANCO_HORAS_SEM_PERMISSAO: voce nao pode ligar os setores do banco de horas.'
      USING ERRCODE = '42501';
  END IF;
  IF p_mapa IS NULL OR jsonb_typeof(p_mapa) <> 'array' THEN
    RAISE EXCEPTION 'BANCO_HORAS_FORMATO: a lista de vinculos nao veio.' USING ERRCODE = '22023';
  END IF;

  FOR v_m IN SELECT * FROM jsonb_array_elements(p_mapa) LOOP
    v_codigo := NULLIF(btrim(v_m->>'empresa_codigo'), '');
    v_setor  := NULLIF(btrim(v_m->>'setor_dp'), '');
    IF v_codigo IS NULL OR v_setor IS NULL
       OR jsonb_typeof(COALESCE(v_m->'setor_ids', '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'BANCO_HORAS_FORMATO: vinculo sem empresa ou setor.' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.banco_horas_mapa
     WHERE empresa_id = p_empresa_id AND empresa_codigo = v_codigo AND setor_dp = v_setor;

    -- Só setor desta empresa entra.
    INSERT INTO public.banco_horas_mapa (empresa_id, empresa_codigo, setor_dp, setor_id, atualizado_por)
    SELECT DISTINCT p_empresa_id, v_codigo, v_setor, s.id, (SELECT auth.uid())
      FROM jsonb_array_elements_text(COALESCE(v_m->'setor_ids', '[]'::jsonb)) AS x(sid)
      JOIN public.setores s ON s.id::TEXT = x.sid AND s.empresa_id = p_empresa_id;
    GET DIAGNOSTICS v_add = ROW_COUNT;
    v_n := v_n + v_add;
  END LOOP;

  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_banco_horas_mapa_salvar(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_banco_horas_mapa_salvar(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_banco_horas_mapa_salvar(UUID, JSONB) TO authenticated;

-- ── 10. Prova ───────────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF (SELECT count(*) FROM public.fn_permissoes_catalogo() c
       WHERE c.chave IN ('ver_banco_horas', 'banco_horas_escopo_setor',
                         'banco_horas_escopo_todos_setores', 'banco_horas_gerenciar')) <> 4 THEN
    RAISE EXCEPTION 'As chaves do Banco de horas nao entraram no catalogo (ou entraram duas vezes).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'fechamento_sub_banco_horas') THEN
    RAISE EXCEPTION 'A chave do rascunho (fechamento_sub_banco_horas) continua no catalogo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_fechamento') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: chaves antigas sumiram.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_abas_escopo() a WHERE a.aba = 'banco_horas')
     OR NOT EXISTS (SELECT 1 FROM public.fn_abas_escopo() a WHERE a.aba = 'fechamento') THEN
    RAISE EXCEPTION 'O registro de abas com escopo ficou sem banco_horas ou perdeu o fechamento.';
  END IF;
  -- A aba nasce fechada para todo cargo configurável.
  IF EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp
      JOIN public.empresas e ON e.id = cp.empresa_id
     WHERE e.slug = 'bookplay'
       AND cp.cargo NOT IN ('administrador', 'super_admin')
       AND COALESCE((cp.permissoes->>'ver_banco_horas')::BOOLEAN, false)
       AND NOT EXISTS (SELECT 1 FROM public.banco_horas_setores)
  ) THEN
    RAISE EXCEPTION 'Algum cargo configuravel nasceu com ver_banco_horas ligada.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261118180000', 'banco_de_horas', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
--   select chave, tenants, padrao from public.fn_permissoes_catalogo()
--    where chave like '%banco_horas%';
--   select * from public.fn_abas_escopo() where aba = 'banco_horas';
--   select to_regclass('public.banco_horas_setores'), to_regclass('public.banco_horas_mapa');
