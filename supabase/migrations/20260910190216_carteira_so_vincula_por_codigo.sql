-- ─────────────────────────────────────────────────────────────────────────────
-- A carteira do 59 passa a ter UM caminho para o setor: o código
--
-- ── Por que tirar o vínculo manual ───────────────────────────────────────────
-- Porque dois caminhos para o mesmo fato não se sincronizam — eles divergem. Um
-- setor com código `25` e uma carteira ligada à mão a outro setor são duas
-- verdades sobre o mesmo dinheiro, e nada no sistema diz qual vale. Foi a
-- pergunta de quem pediu: «como seria sincronizado se eu vou conseguir vincular
-- em 2 lugares, por código e manualmente».
--
-- A resposta é não vincular em dois lugares. O código passa a ser a única via.
--
-- ── O que some ───────────────────────────────────────────────────────────────
-- `fn_mestre_vincular_grupo` é removida. Era só ela que escrevia
-- `mestre_grupos.setor_id` a partir da tela, e nenhuma outra função do banco a
-- chamava — conferido antes de remover.
--
-- O vínculo manual de EQUIPE (`fn_mestre_vincular_equipe`, `mestre_equipes`)
-- NÃO é tocado. Ali o problema é outro: equipe não tem código no relatório, e a
-- decisão de para onde ela vai continua sendo de gente.
--
-- ── O que é desfeito, e por que sem dó ───────────────────────────────────────
-- Os vínculos feitos à mão são apagados. Conferido antes: as 16 carteiras
-- estavam em dois estados apenas — 10 `vinculado` e 6 `novo` —, nenhuma
-- `ignorado`, nenhuma com observação. Ou seja, não havia julgamento guardado
-- ali além do próprio par carteira↔setor, e esse par volta em segundos pela aba
-- Códigos.
--
-- ⚠️ Enquanto os códigos não forem preenchidos, o Painel Diretoria mostra as
-- carteiras sem setor. Não é perda de dado: `mestre_recebimentos` está intacto,
-- e o vínculo é uma leitura por cima dele. É um intervalo, e ele foi aceito por
-- quem pediu.
--
-- O UPDATE poupa o que o código JÁ justifica: se alguém preencheu um código
-- antes desta migration rodar, aquele vínculo não é desfeito — ele já é do
-- mundo novo.
--
-- ── Como voltar atrás ────────────────────────────────────────────────────────
-- A definição de `fn_mestre_vincular_grupo` está em
-- `20260904900000_mestre_59_carteira_nao_e_equipe.sql` e vizinhas. Os pares
-- desfeitos estão registrados no corpo desta migration, abaixo, para quem
-- precisar reconstruir sem o relatório em mãos:
--
--     63 → Receptivo            25 → Play 1             2 → Play 3
--     28 → Play 2               38 → Play 4             3 → Play 5
--     56 → Playmix              79 → Play Mix Marília  76 → Jornada Play
--     78 → Manutenção
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 1. Desfaz o que foi ligado à mão ═══════════════════════════════════════

UPDATE public.mestre_grupos g
   SET setor_id         = NULL,
       estado           = 'novo',
       vinculado_por_id = NULL,
       vinculado_em     = NULL,
       observacao       = NULL,
       atualizado_em    = now()
 WHERE g.setor_id IS NOT NULL
   -- Poupa o que o código já justifica.
   AND NOT EXISTS (
     SELECT 1 FROM public.setores s
      WHERE s.empresa_id = g.empresa_id
        AND s.codigo_erp = g.cod_grupo_filtro);

-- ═══ 2. Fecha a segunda porta ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.fn_mestre_vincular_grupo(uuid, text, uuid, text, text);

-- ═══ 3. O gatilho passa a valer também na reimportação ══════════════════════
--
-- Enquanto existia vínculo manual, o gatilho agia SÓ no INSERT: no `on conflict`
-- da reimportação a linha já existia, e sobrescrever ali apagaria em silêncio um
-- vínculo que alguém fez de propósito.
--
-- Sem vínculo manual, esse cuidado perde o objeto — e a limitação vira defeito:
-- carteira que já existia antes de o código ser criado nunca se ligaria sozinha
-- numa nova carga. Agora vale no INSERT e no UPDATE.

DROP TRIGGER IF EXISTS trg_mestre_grupo_herda_setor ON public.mestre_grupos;
CREATE TRIGGER trg_mestre_grupo_herda_setor
  BEFORE INSERT OR UPDATE ON public.mestre_grupos
  FOR EACH ROW EXECUTE FUNCTION public.fn_mestre_grupo_herda_setor();

COMMENT ON FUNCTION public.fn_mestre_grupo_herda_setor() IS
  'A carteira do 59 encontra o setor pelo codigo (setores.codigo_erp). E a '
  'UNICA via: o vinculo manual de carteira foi removido em 20260910210000, '
  'porque dois caminhos para o mesmo fato divergem em vez de sincronizar.';
