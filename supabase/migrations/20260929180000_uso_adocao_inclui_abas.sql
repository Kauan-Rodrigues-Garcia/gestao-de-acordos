-- ============================================================================
-- Adoção de tela: a tela conta junto com as abas de dentro dela
-- ============================================================================
--
-- ## Por que
--
-- Desde 29/09/2026 o app grava cada aba interna no identificador da tela
-- (`src/lib/telas-catalogo.ts`): quem abre o Analítico grava
-- `analitico:analitico/mes/ranking`, e não mais `analitico`. A adoção comparava
-- por IGUALDADE (`u.tela = p_tela`), então perguntar «quem abriu o Analítico»
-- passaria a responder «ninguém» — com todo mundo usando.
--
-- ## A regra
--
-- Conta a própria tela OU qualquer aba dentro dela:
--
--   p_tela sem `:`   analitico          vale `analitico` e `analitico:*`
--   p_tela com `:`   lider:desempenho   vale `lider:desempenho` e `lider:desempenho/*`
--
-- `acordos` NÃO vale por `acordos/novo`: é outra tela do menu, com rota
-- própria. A mesma regra de `telaTeveUso` em `src/pages/AdminLogs/agruparTelas.ts`.
--
-- `starts_with` e não `LIKE`: `_` é curinga no LIKE, e ele aparece nos nomes
-- (`nao_pagos`, `direto_extra`).
--
-- ## O que NÃO muda
--
-- Assinatura, colunas, filtros e permissões: é `CREATE OR REPLACE` da versão
-- de `20260824150000_uso_filtros_e_sem_acesso.sql`, com só a condição da tela
-- trocada. O `GRANT`/`REVOKE` de `20260818240000` continua valendo — o
-- `CREATE OR REPLACE` não mexe em privilégio.
--
-- Nenhuma linha de dado é escrita.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_uso_adocao_tela(
  p_empresa_id uuid,
  p_desde      date,
  p_ate        date,
  p_cargo      text DEFAULT NULL,
  p_tela       text DEFAULT NULL,
  p_setor_id   uuid DEFAULT NULL,
  p_equipe_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  usuario_id   uuid,
  nome         text,
  cargo        text,
  empresa_id   uuid,
  empresa_nome text,
  setor_nome   text,
  equipe_nome  text,
  aberturas    bigint,
  segundos     bigint,
  ultimo_em    timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  -- Parte de `perfis`, e nao de `uso_telas`: quem nunca abriu a tela nao tem
  -- linha de uso, e e exatamente essa pessoa que a consulta existe para achar.
  SELECT p.id                                     AS usuario_id,
         COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario, '—')::TEXT AS nome,
         p.perfil::TEXT                           AS cargo,
         p.empresa_id,
         e.nome::TEXT                             AS empresa_nome,
         s.nome::TEXT                             AS setor_nome,
         eq.nome::TEXT                            AS equipe_nome,
         COALESCE(SUM(u.aberturas), 0)::BIGINT    AS aberturas,
         COALESCE(SUM(u.segundos), 0)::BIGINT     AS segundos,
         MAX(u.ultimo_em)                         AS ultimo_em
    FROM public.perfis p
    JOIN public.empresas e ON e.id = p.empresa_id
    LEFT JOIN public.setores s  ON s.id  = p.setor_id
    LEFT JOIN public.equipes eq ON eq.id = p.equipe_id
    LEFT JOIN public.uso_telas u
           ON u.usuario_id = p.id
          AND (u.tela = p_tela
               OR starts_with(
                    u.tela,
                    p_tela || CASE WHEN strpos(p_tela, ':') > 0 THEN '/' ELSE ':' END))
          AND u.dia BETWEEN p_desde AND p_ate
   WHERE (p_empresa_id IS NULL OR p.empresa_id = p_empresa_id)
     AND (p_cargo     IS NULL OR p.perfil    = p_cargo)
     AND (p_setor_id  IS NULL OR p.setor_id  = p_setor_id)
     AND (p_equipe_id IS NULL OR p.equipe_id = p_equipe_id)
     AND p.ativo
     AND NOT p.arquivado
   GROUP BY p.id, p.nome, p.usuario, p.perfil, p.empresa_id, e.nome, s.nome, eq.nome
   ORDER BY COALESCE(SUM(u.segundos), 0) DESC,
            COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario);
$function$;
