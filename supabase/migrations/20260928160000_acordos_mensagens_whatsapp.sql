-- ============================================================================
-- acordos_mensagens_whatsapp — as mensagens de WhatsApp de cada pessoa, por
-- status do acordo
-- ============================================================================
--
-- ## O pedido (28/09/2026)
--
-- «Na aba acordos quero um botão [...] ficando do lado de filtrar data sendo
-- uma caixinha de edição para editar a mensagem do WhatsApp que eles
-- encaminham para os clientes, assim eles conseguindo colocar de acordo com os
-- Status mensagem para Pendente, Pago e Não pago, separado [...] três mensagens
-- para pendente, duas para pago e cinco para não pagos, assim ele colocando de
-- acordo com a fórmula para puxar os dados do cliente.»
--
-- Decisão do usuário: cada PESSOA tem as suas mensagens, e elas valem em
-- qualquer PC — por isso tabela, e não localStorage.
--
-- ## O formato
--
-- Uma linha por mensagem. `status` é o grupo do acordo que a mensagem atende
-- (`pendente` junta tudo que não é pago nem não pago — hoje só
-- `verificar_pendente`). `ordem` decide a padrão: a de menor ordem é a que o
-- envio em lote usa. `conteudo` guarda o texto com as variáveis entre chaves
-- duplas ({{nome_cliente}}, {{valor}}…) — quem as troca é o front
-- (`src/lib/mensagensWhatsapp.ts`), na hora de abrir o WhatsApp.
--
-- Não há limite de quantidade por status: o «3 / 2 / 5» do pedido era exemplo,
-- e cada pessoa guarda quantas mensagens quiser.
--
-- ## Segurança
--
-- RLS fecha por padrão e cada pessoa só enxerga, cria, altera e apaga as
-- próprias linhas. `auth.uid()` vai num SELECT, avaliado uma vez por consulta.
-- Nada aqui vale dinheiro nem permissão: é o texto que a pessoa manda.
--
-- ## Escrita de dados
--
-- Nenhuma: cria a tabela vazia. Sem mensagem própria, a tela continua usando
-- os dois textos de sempre (`buildMensagem`).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.acordos_mensagens_whatsapp (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    UUID        NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL CHECK (status IN ('pendente', 'pago', 'nao_pago')),
  titulo        TEXT        NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 60),
  conteudo      TEXT        NOT NULL CHECK (char_length(btrim(conteudo)) BETWEEN 1 AND 2000),
  ordem         INTEGER     NOT NULL DEFAULT 0,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.acordos_mensagens_whatsapp IS
  'Mensagens de WhatsApp de cada pessoa na aba Acordos, por status do acordo '
  '(pendente, pago, nao_pago). A de menor ordem e a padrao. Ver 20260928160000.';
COMMENT ON COLUMN public.acordos_mensagens_whatsapp.conteudo IS
  'Texto com variaveis {{nome_cliente}}, {{valor}}... trocadas no front '
  '(src/lib/mensagensWhatsapp.ts).';

-- A única consulta da tela: as mensagens de uma pessoa, em ordem.
CREATE INDEX IF NOT EXISTS idx_acordos_mensagens_whatsapp_usuario
  ON public.acordos_mensagens_whatsapp (usuario_id, status, ordem);

ALTER TABLE public.acordos_mensagens_whatsapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS acordos_mensagens_whatsapp_select ON public.acordos_mensagens_whatsapp;
CREATE POLICY acordos_mensagens_whatsapp_select
  ON public.acordos_mensagens_whatsapp FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS acordos_mensagens_whatsapp_insert ON public.acordos_mensagens_whatsapp;
CREATE POLICY acordos_mensagens_whatsapp_insert
  ON public.acordos_mensagens_whatsapp FOR INSERT TO authenticated
  WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS acordos_mensagens_whatsapp_update ON public.acordos_mensagens_whatsapp;
CREATE POLICY acordos_mensagens_whatsapp_update
  ON public.acordos_mensagens_whatsapp FOR UPDATE TO authenticated
  USING      (usuario_id = (SELECT auth.uid()))
  WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS acordos_mensagens_whatsapp_delete ON public.acordos_mensagens_whatsapp;
CREATE POLICY acordos_mensagens_whatsapp_delete
  ON public.acordos_mensagens_whatsapp FOR DELETE TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

REVOKE ALL ON public.acordos_mensagens_whatsapp FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acordos_mensagens_whatsapp TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
DECLARE
  v_rls  BOOLEAN;
  v_pols INTEGER;
BEGIN
  SELECT relrowsecurity INTO v_rls
    FROM pg_class WHERE oid = 'public.acordos_mensagens_whatsapp'::regclass;
  SELECT count(*) INTO v_pols
    FROM pg_policy WHERE polrelid = 'public.acordos_mensagens_whatsapp'::regclass;

  IF NOT v_rls THEN
    RAISE EXCEPTION 'acordos_mensagens_whatsapp ficou SEM row level security';
  END IF;
  IF v_pols <> 4 THEN
    RAISE EXCEPTION 'acordos_mensagens_whatsapp deveria ter 4 politicas, tem %', v_pols;
  END IF;
END
$prova$;

COMMIT;
