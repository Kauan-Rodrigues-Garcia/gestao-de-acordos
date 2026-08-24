-- ============================================================================
-- Desativar RH Gestao para TODOS os cargos, menos super_admin
-- ============================================================================
--
-- Rodar no SQL Editor do Supabase. Nao e migration: e uma decisao operacional,
-- reversivel, e o repositorio nao deve reaplica-la sozinho num banco novo.
--
-- ── O estado de HOJE (por que este script existe) ───────────────────────────
--
-- Sim, a aba esta liberada. O catalogo (migration 20260823200000) semeou
-- `ver_rh_gestao` como verdadeiro para:
--
--     lider · elite · gerencia · diretoria · rh
--
-- e `administrador` / `super_admin` recebem verdadeiro por ACESSO TOTAL, sem
-- depender do que esta gravado. As chaves de acao acompanham: `rh_preencher`
-- em lider/elite/gerencia, `rh_validar` e `rh_enviar` em gerencia,
-- `rh_aprovar` e `rh_devolver` em gerencia e rh, e os tres niveis de escopo
-- distribuidos entre lider/elite (equipe), gerencia (setor) e diretoria/rh
-- (todos os setores).
--
-- ⚠️  LEIA ANTES DE RODAR — administrador
--
--     `administrador` continuara enxergando a aba depois deste script.
--
--     Nao e falha do UPDATE: administrador e super_admin tem acesso total por
--     construcao, no codigo (`useCargoPermissoes.temPermissao`) e no banco
--     (`fn_user_tem`), e os dois respondem SIM antes de olhar qualquer tabela.
--     A linha dele fica com `false` gravado — o que importa se um dia o acesso
--     total for revisto —, mas o efeito pratico e nenhum enquanto a regra do
--     acesso total valer.
--
--     Para excluir tambem o administrador e preciso mudar CODIGO, e nao dado:
--     colocar `ver_rh_gestao` na lista de permissoes EXPLICITAS (as que o
--     acesso total nao concede sozinho, como `rh_reabrir_fechamento`) nos dois
--     catalogos, e fazer o menu e a rota consultarem a versao explicita da
--     pergunta. Ai o super_admin continua entrando pela linha dele, que este
--     script preserva.
--
-- ── O que o script faz ─────────────────────────────────────────────────────
--
--   1. desliga `ver_rh_gestao` e todas as chaves `rh_*` em TODA linha de
--      `cargos_permissoes` cujo cargo nao seja `super_admin`;
--   2. apaga essas mesmas chaves das excecoes por pessoa
--      (`perfis_permissoes`) — chave ausente ali volta a herdar do cargo, que
--      acabou de virar `false`. Sem este passo, quem tivesse concessao nominal
--      continuaria entrando.
--
-- As chaves nao sao escritas a mao: saem de `fn_permissoes_catalogo()`, entao
-- uma chave `rh_*` criada depois tambem e alcancada por este script.
--
-- ── Efeito ─────────────────────────────────────────────────────────────────
--
-- Desligar `ver_rh_gestao` fecha o modulo inteiro, e nao so o item do menu:
-- `fn_user_escopo('rh')` devolve -1 quando a chave da aba esta desligada, e e
-- ela que a RLS de `rh_lancamentos` consulta. A pessoa nao ve a aba, a rota
-- recusa, e o banco nao entrega linha nenhuma.
--
-- ── Como desfazer ──────────────────────────────────────────────────────────
--
-- Ligue de volta pelo painel (Configuracoes › Permissoes › por cargo), chave a
-- chave. Nao ha script de rollback de proposito: reativar folha de pagamento
-- merece ser uma escolha consciente, cargo a cargo, e nao um `git revert`.
-- ============================================================================

-- ── 1. ANTES: quem enxerga a aba hoje ──────────────────────────────────────
-- Rode sozinho primeiro, guarde o resultado. E o unico registro de como estava.
SELECT
  e.slug                                  AS empresa,
  cp.cargo,
  (cp.permissoes->>'ver_rh_gestao')::BOOLEAN AS ve_a_aba,
  (cp.permissoes->>'rh_aprovar')::BOOLEAN    AS aprova,
  (cp.permissoes->>'rh_preencher')::BOOLEAN  AS preenche
FROM public.cargos_permissoes cp
JOIN public.empresas e ON e.id = cp.empresa_id
ORDER BY e.slug, cp.cargo;


-- ── 2. A MUDANCA ───────────────────────────────────────────────────────────
--
-- As duas instrucoes sao independentes e cada uma e atomica por si. Escritas
-- sem BEGIN/COMMIT de proposito: o SQL Editor do Supabase ja envolve a
-- execucao numa transacao, e um BEGIN a mais so produz um aviso confuso.
-- Rodando por psql, envolva as duas a mao se quiser tudo ou nada.

-- 2a. Todo cargo, menos super_admin.
UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || (
         SELECT jsonb_object_agg(c.chave, FALSE)
           FROM public.fn_permissoes_catalogo() c
          WHERE c.chave = 'ver_rh_gestao' OR c.chave LIKE 'rh\_%'
       ),
       atualizado_em = NOW()
 WHERE cp.cargo <> 'super_admin';

-- 2b. As excecoes por pessoa. Apagar a chave devolve a pessoa ao cargo (que
--     agora nega); gravar `false` aqui tambem funcionaria, mas deixaria um
--     "nao" nominal que atrapalharia a reativacao futura por cargo.
UPDATE public.perfis_permissoes pp
   SET permissoes = pp.permissoes - ARRAY(
         SELECT c.chave FROM public.fn_permissoes_catalogo() c
          WHERE c.chave = 'ver_rh_gestao' OR c.chave LIKE 'rh\_%'
       ),
       atualizado_em = NOW()
 WHERE pp.permissoes ?| ARRAY(
         SELECT c.chave FROM public.fn_permissoes_catalogo() c
          WHERE c.chave = 'ver_rh_gestao' OR c.chave LIKE 'rh\_%'
       );


-- ── 3. DEPOIS: a conferencia ───────────────────────────────────────────────
--
-- Esperado: `ve_a_aba` verdadeiro somente na linha `super_admin`.
-- A linha `administrador` aparece como falso e, ainda assim, o administrador
-- logado continua enxergando a aba — ver o aviso no topo.
SELECT
  e.slug     AS empresa,
  cp.cargo,
  (cp.permissoes->>'ver_rh_gestao')::BOOLEAN AS ve_a_aba,
  (SELECT COUNT(*) FILTER (WHERE (cp.permissoes->>c.chave)::BOOLEAN)
     FROM public.fn_permissoes_catalogo() c
    WHERE c.chave LIKE 'rh\_%')             AS chaves_rh_ainda_ligadas
FROM public.cargos_permissoes cp
JOIN public.empresas e ON e.id = cp.empresa_id
ORDER BY e.slug, cp.cargo;

-- Excecoes por pessoa que ainda mencionem o modulo. Esperado: nenhuma linha.
SELECT p.nome, p.perfil, pp.permissoes
  FROM public.perfis_permissoes pp
  JOIN public.perfis p ON p.id = pp.usuario_id
 WHERE pp.permissoes ?| ARRAY(
         SELECT c.chave FROM public.fn_permissoes_catalogo() c
          WHERE c.chave = 'ver_rh_gestao' OR c.chave LIKE 'rh\_%');
