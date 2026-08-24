-- ============================================================================
-- uso_sessoes — «entrou no sistema hoje», independente de ter digitado a senha
-- ============================================================================
--
-- ## O defeito relatado
--
-- «tem gente usando todo dia mas consta 1 login».
--
-- Esta certo, e o numero e que esta errado. `logs_sistema` so ganha a linha
-- `acao = 'login'` dentro de `signIn()` — quando alguem DIGITA credencial
-- (`src/hooks/useAuth.tsx`). A sessao do Supabase e renovada por refresh token
-- em segundo plano e sobrevive a fechar o navegador, entao quem trabalha todo
-- dia na mesma maquina digita a senha uma vez por mes e aparece com 1 login.
--
-- O inverso tambem acontece: rede que expira sessao produz tres «logins» num
-- dia so. O numero mede politica de token, nao presenca.
--
-- ## Por que uma tabela, e nao um evento em `logs_sistema`
--
-- Mesma razao que separou `uso_telas` da trilha em 20260817180000: a auditoria
-- responde «quem alterou isto», guarda 730 dias e nao deve crescer com sinal de
-- telemetria. Aqui sao ~45 linhas/dia. Cabe ao lado do uso, com a MESMA
-- retencao de 180 dias, e a chave primaria ja faz a deduplicacao — nao ha
-- consulta de «ja registrei hoje?» antes de cada insercao.
--
-- ## Por que nao bastava `uso_telas`
--
-- `uso_telas` mede TELA: identificador de rota, segundos em foco, com piso de 2
-- segundos e a tela de login fora da medicao. Quem abre o sistema e fecha antes
-- disso nao deixa linha. E, mais importante, «abriu 4 telas» e uma pergunta
-- diferente de «entrou no sistema» — juntar as duas num numero so foi
-- exatamente o que produziu o valor que o gerente nao reconheceu.
--
-- ## O que NAO muda
--
-- O percentual de uso continua contando DIAS DISTINTOS, nunca entradas (ver o
-- cabecalho de `src/pages/AdminLogs/assiduidade.ts`). Esta migration so amplia
-- a fonte desses dias: uniao de `uso_telas` com `uso_sessoes`, para que quem
-- abriu o sistema sem navegar tambem conte como presente.
-- ============================================================================

BEGIN;

-- ── 1. A tabela ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.uso_sessoes (
  empresa_id  uuid        NOT NULL REFERENCES public.empresas(id),
  usuario_id  uuid        NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  dia         date        NOT NULL,
  /**
   * Quantas vezes o sistema foi ABERTO com aquela pessoa dentro, no dia.
   *
   * Recarregar a pagina e abrir uma segunda aba contam. E o numero honesto de
   * «entrou»: nao depende de a sessao ter expirado, que era o defeito.
   */
  entradas    integer     NOT NULL DEFAULT 0,
  primeiro_em timestamptz NOT NULL DEFAULT now(),
  ultimo_em   timestamptz NOT NULL DEFAULT now(),
  /** Cargo no momento, desnormalizado — mesma razao de `uso_telas.cargo`. */
  cargo       text,
  PRIMARY KEY (empresa_id, usuario_id, dia)
);

COMMENT ON TABLE public.uso_sessoes IS
  'Uma linha por (empresa, pessoa, dia) em que o sistema foi aberto. Existe '
  'porque logs_sistema.acao=login so registra credencial digitada, e a sessao '
  'do Supabase sobrevive dias — ver 20260824180000.';

CREATE INDEX IF NOT EXISTS ix_uso_sessoes_empresa_dia
  ON public.uso_sessoes (empresa_id, dia DESC);
CREATE INDEX IF NOT EXISTS ix_uso_sessoes_usuario_dia
  ON public.uso_sessoes (usuario_id, dia DESC);

-- ── 2. RLS ─────────────────────────────────────────────────────────────────
--
-- Copia exata da regra de `uso_telas`, inclusive o embrulho em `(select ...)`:
-- sem ele o Postgres avalia as tres funcoes STABLE uma vez POR LINHA, que foi a
-- causa do `statement timeout` corrigido em 20260824170000. Com o embrulho vira
-- InitPlan, avaliado uma vez por consulta. Mesma regra de acesso.

ALTER TABLE public.uso_sessoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uso_sessoes_select ON public.uso_sessoes;
CREATE POLICY uso_sessoes_select ON public.uso_sessoes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_is_super_admin())
    OR (empresa_id = (SELECT public.fn_user_empresa_id())
        AND (SELECT public.fn_user_has_any_role(ARRAY['administrador'])))
  );

-- Sem policy de escrita: fail-closed. So a RPC abaixo grava, e ela e DEFINER.

-- ── 3. Registro ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_uso_registrar_sessao()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_empresa uuid;
  v_cargo   text;
BEGIN
  -- Sem sessao nao ha o que registrar. Devolve em silencio: e chamada de dentro
  -- de um efeito, e estourar aqui quebraria a abertura do sistema por causa de
  -- telemetria.
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT p.empresa_id, p.perfil INTO v_empresa, v_cargo
    FROM public.perfis p WHERE p.id = auth.uid();
  IF v_empresa IS NULL THEN RETURN; END IF;

  -- O dia e o de Sao Paulo, nao UTC: uma entrada as 22h de terca em Brasilia e
  -- 01h de quarta em UTC, e cairia no dia seguinte no relatorio.
  INSERT INTO public.uso_sessoes AS s
    (empresa_id, usuario_id, dia, entradas, cargo, primeiro_em, ultimo_em)
  VALUES
    (v_empresa, auth.uid(), (now() AT TIME ZONE 'America/Sao_Paulo')::date,
     1, v_cargo, now(), now())
  ON CONFLICT (empresa_id, usuario_id, dia) DO UPDATE
     SET entradas  = s.entradas + 1,
         cargo     = COALESCE(EXCLUDED.cargo, s.cargo),
         ultimo_em = now();
END;
$function$;

COMMENT ON FUNCTION public.fn_uso_registrar_sessao() IS
  'Marca que a pessoa da sessao abriu o sistema hoje. Deduplicado por dia via '
  'chave primaria. Identidade vem de auth.uid(), nunca do cliente.';

REVOKE ALL ON FUNCTION public.fn_uso_registrar_sessao() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_uso_registrar_sessao() TO authenticated;

-- ── 4. Historico ───────────────────────────────────────────────────────────
--
-- Sem isto o painel nasceria zerado e diria, por 180 dias, que ninguem nunca
-- entrou — trocaria um numero errado por outro. Os dois passados disponiveis:
--
--   a) `uso_telas`: houve tela aberta naquele dia, logo houve entrada. E o
--      sinal mais completo, mas nao sabe QUANTAS vezes — assume 1.
--   b) `logs_sistema`: os logins com credencial de fato, que sao o piso real de
--      entradas do dia. Onde ha os dois, vence o maior.
--
-- `entradas` do passado e portanto um piso, nao uma contagem exata. A partir
-- desta migration passa a ser exata.

INSERT INTO public.uso_sessoes (empresa_id, usuario_id, dia, entradas, cargo, primeiro_em, ultimo_em)
SELECT u.empresa_id,
       u.usuario_id,
       u.dia,
       1,
       MODE() WITHIN GROUP (ORDER BY u.cargo),
       MIN(u.primeiro_em),
       MAX(u.ultimo_em)
  FROM public.uso_telas u
 GROUP BY u.empresa_id, u.usuario_id, u.dia
ON CONFLICT (empresa_id, usuario_id, dia) DO NOTHING;

INSERT INTO public.uso_sessoes (empresa_id, usuario_id, dia, entradas, cargo, primeiro_em, ultimo_em)
SELECT pr.empresa_id,
       l.usuario_id,
       (l.criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
       COUNT(*)::int,
       MODE() WITHIN GROUP (ORDER BY l.usuario_cargo),
       MIN(l.criado_em),
       MAX(l.criado_em)
  FROM public.logs_sistema l
  JOIN public.perfis pr ON pr.id = l.usuario_id
 WHERE l.acao = 'login'
   AND l.usuario_id IS NOT NULL
   AND l.criado_em >= now() - INTERVAL '180 days'
 GROUP BY pr.empresa_id, l.usuario_id, (l.criado_em AT TIME ZONE 'America/Sao_Paulo')::date
ON CONFLICT (empresa_id, usuario_id, dia) DO UPDATE
   SET entradas    = GREATEST(public.uso_sessoes.entradas, EXCLUDED.entradas),
       primeiro_em = LEAST(public.uso_sessoes.primeiro_em, EXCLUDED.primeiro_em),
       ultimo_em   = GREATEST(public.uso_sessoes.ultimo_em, EXCLUDED.ultimo_em);

-- ── 5. Retencao ────────────────────────────────────────────────────────────
--
-- Os mesmos 180 dias de `uso_telas`, no mesmo trabalho: duas retencoes
-- diferentes para o mesmo dado fariam o painel mostrar dias de sessao sem uso
-- de tela (ou o contrario) nas bordas da janela.

CREATE OR REPLACE FUNCTION public.fn_uso_expurgar(p_dias integer DEFAULT 180)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_corte date;
  v_qtd   integer;
  v_ses   integer;
BEGIN
  IF p_dias IS NULL OR p_dias < 30 THEN
    RAISE EXCEPTION 'Retencao minima de 30 dias (pedido: % dias).', p_dias
      USING ERRCODE = 'check_violation';
  END IF;

  v_corte := (now() AT TIME ZONE 'America/Sao_Paulo')::date - p_dias;

  DELETE FROM public.uso_telas WHERE dia < v_corte;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  DELETE FROM public.uso_sessoes WHERE dia < v_corte;
  GET DIAGNOSTICS v_ses = ROW_COUNT;

  INSERT INTO public.logs_sistema
    (acao, categoria, severidade, descricao, origem, tabela, alvo_tipo, detalhes)
  VALUES
    ('uso_expurgado', 'sistema', 'info',
     format('Expurgo de uso: %s linha(s) de tela e %s de sessao anteriores a %s.',
            v_qtd, v_ses, v_corte),
     'automatico', 'uso_telas', 'monitoramento de uso',
     jsonb_build_object('dias', p_dias, 'corte', v_corte,
                        'removidas', v_qtd, 'removidas_sessoes', v_ses));

  -- Continua devolvendo as linhas de TELA: e o que a assinatura sempre
  -- prometeu, e mudar o significado do retorno quebraria quem ja le.
  RETURN v_qtd;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_uso_expurgar(integer) FROM public, anon, authenticated;

-- ── 6. Leitura: quem nao acessou ───────────────────────────────────────────
--
-- Quem abriu o sistema tambem nao e «sem acesso». Sem esta correcao, alguem que
-- entra todo dia e resolve tudo numa rota fora do catalogo de telas apareceria
-- na lista de «nunca acessou» — o falso positivo mais caro desta tela, que
-- existe justamente para virar cobranca.

CREATE OR REPLACE FUNCTION public.fn_uso_sem_acesso(
  p_empresa_id uuid,
  p_desde      date,
  p_ate        date,
  p_cargo      text DEFAULT NULL,
  p_setor_id   uuid DEFAULT NULL,
  p_equipe_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  usuario_id   uuid,
  nome         text,
  usuario      text,
  cargo        text,
  empresa_id   uuid,
  empresa_nome text,
  setor_nome   text,
  equipe_nome  text,
  situacao     text,
  criado_em    timestamptz,
  /** Ultimo acesso de TODOS os tempos, tela ou sessao. NULL = nunca acessou. */
  ultimo_em    timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  WITH ultimo AS (
    -- Ultimo sinal de vida das duas fontes. Continua GLOBAL de proposito: e a
    -- resposta para «desde quando», e limita-lo a janela o deixaria sempre nulo.
    SELECT x.usuario_id, MAX(x.ultimo_em) AS ultimo_em
      FROM (
        SELECT u.usuario_id, u.ultimo_em FROM public.uso_telas u
        UNION ALL
        SELECT s2.usuario_id, s2.ultimo_em FROM public.uso_sessoes s2
      ) x
     GROUP BY x.usuario_id
  )
  SELECT p.id                                     AS usuario_id,
         COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario, '—')::TEXT AS nome,
         p.usuario::TEXT,
         p.perfil::TEXT                           AS cargo,
         p.empresa_id,
         e.nome::TEXT                             AS empresa_nome,
         s.nome::TEXT                             AS setor_nome,
         eq.nome::TEXT                            AS equipe_nome,
         COALESCE(p.situacao, 'ativo')::TEXT      AS situacao,
         p.criado_em,
         ul.ultimo_em
    FROM public.perfis p
    JOIN public.empresas e ON e.id = p.empresa_id
    LEFT JOIN public.setores s  ON s.id  = p.setor_id
    LEFT JOIN public.equipes eq ON eq.id = p.equipe_id
    LEFT JOIN ultimo ul ON ul.usuario_id = p.id
   WHERE (p_empresa_id IS NULL OR p.empresa_id = p_empresa_id)
     AND (p_cargo     IS NULL OR p.perfil    = p_cargo)
     AND (p_setor_id  IS NULL OR p.setor_id  = p_setor_id)
     AND (p_equipe_id IS NULL OR p.equipe_id = p_equipe_id)
     AND p.ativo
     AND NOT p.arquivado
     -- `NOT EXISTS` e nao `LEFT JOIN ... IS NULL`: o primeiro para na primeira
     -- linha encontrada, e aqui a maioria das pessoas TEM uso — o caminho
     -- rapido e o de descartar.
     AND NOT EXISTS (
       SELECT 1 FROM public.uso_telas u
        WHERE u.usuario_id = p.id AND u.dia BETWEEN p_desde AND p_ate
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.uso_sessoes ss
        WHERE ss.usuario_id = p.id AND ss.dia BETWEEN p_desde AND p_ate
     )
   -- Nunca acessou primeiro: e o caso que exige acao imediata. Depois, quem
   -- esta parado ha mais tempo.
   ORDER BY ul.ultimo_em ASC NULLS FIRST,
            COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario);
$function$;

COMMENT ON FUNCTION public.fn_uso_sem_acesso(uuid, date, date, text, uuid, uuid) IS
  'Pessoas ativas SEM acesso no periodo — nem tela nem sessao. ultimo_em nulo = '
  'nunca acessou; preenchido = acessou antes e parou. Ver 20260824180000.';

COMMIT;
