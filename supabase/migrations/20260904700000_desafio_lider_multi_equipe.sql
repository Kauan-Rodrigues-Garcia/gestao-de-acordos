-- ============================================================================
-- Desafios: o líder de VÁRIAS equipes
-- ============================================================================
--
-- `fn_desafio_pessoas_multi` resolvia `equipe_lideres` só para quem lidera uma
-- equipe (`HAVING COUNT(*) = 1`). Quem lidera duas ou mais chegava sem equipe,
-- e `somaDoParticipante` devolvia zero — o líder entrava no ranking em último,
-- com R$ 0,00, disputando contra times que ele mesmo lidera.
--
-- ## O caso, e por que ele não é exceção
--
-- Setor montado por CLONES tem a equipe duas vezes. O Play 5 tem `Digital -
-- Brunno` com 8 membros próprios; o setor do Brunno, `Marília Digital`, tem a
-- equipe `Play 5` com os MESMOS 8, ali como clones, e a mesma meta. Ele lidera
-- as duas. Vale igual para Play 4 e Play Mix: seis equipes lideradas, três
-- pares espelhados. O mesmo padrão existe no `Treinamento Marília`.
--
-- Somar as seis contaria o dinheiro duas vezes. Somar as três "reais" tiraria o
-- líder do setor dele. A regra que resolve os dois: **as equipes que ele lidera
-- E que ficam no setor DELE**.
--
-- Para quem lidera uma equipe só, ela está no próprio setor e nada muda — é o
-- mesmo resultado de hoje. Para o líder de setor-clone, sobram exatamente as
-- três do setor dele.
--
-- `equipes_lideradas` vazio cai para TODAS as equipes lideradas: um líder cuja
-- única equipe fica em outro setor continuaria funcionando como antes, em vez
-- de sumir do ranking por causa de uma regra que não foi feita para ele.
--
-- A campanha decide se usa isso, em `regra.agregacaoLider`. O padrão
-- (`equipe_unica`) é o comportamento de sempre: nenhuma campanha existente muda
-- de número por causa desta migration.
-- ============================================================================

create or replace function public.fn_desafio_pessoas_multi(
  p_empresas   uuid[],
  p_convidados uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  v_out        JSONB;
  v_convidados UUID[] := COALESCE(p_convidados, '{}'::UUID[]);
BEGIN
  WITH lider_unico AS (
    SELECT el.lider_id, MIN(el.equipe_id::TEXT)::UUID AS equipe_id
      FROM public.equipe_lideres el
     WHERE el.empresa_id = ANY (p_empresas)
     GROUP BY el.lider_id
    HAVING COUNT(*) = 1
  ),
  -- Todas as equipes que a pessoa lidera, com o setor de cada uma.
  lideradas AS (
    SELECT el.lider_id, el.equipe_id, e.setor_id
      FROM public.equipe_lideres el
      JOIN public.equipes e ON e.id = el.equipe_id
     WHERE el.empresa_id = ANY (p_empresas)
  ),
  clones AS (
    SELECT c.operador_id, c.equipe_id, e.setor_id
      FROM public.equipe_operadores_clones c
      JOIN public.equipes e ON e.id = c.equipe_id
     WHERE c.empresa_id = ANY (p_empresas)
       AND c.conta_recebimento IS TRUE
  ),
  com_equipe AS (
    SELECT
      p.id,
      p.nome,
      p.usuario,
      p.foto_url,
      p.empresa_id,
      p.setor_id                          AS setor_do_perfil,
      COALESCE(p.perfil, 'operador')      AS perfil,
      COALESCE(p.situacao, 'ativo')       AS situacao,
      COALESCE(p.equipe_id, lu.equipe_id) AS equipe_id,
      e.nome                              AS equipe_nome,
      COALESCE(e.setor_id, p.setor_id)    AS setor_id
    FROM public.perfis p
    LEFT JOIN lider_unico lu   ON lu.lider_id = p.id
    LEFT JOIN public.equipes e ON e.id = COALESCE(p.equipe_id, lu.equipe_id)
    WHERE p.arquivado IS NOT TRUE
      AND NOT (p.ativo IS FALSE AND COALESCE(p.situacao, 'ativo') <> 'desligado')
      AND (
        (
          p.empresa_id = ANY (p_empresas)
          AND COALESCE(p.perfil, '') <> 'super_admin'
        )
        OR p.id = ANY (v_convidados)
      )
  ),
  -- As equipes que a pessoa lidera DENTRO do setor dela. Reserva: todas as que
  -- ela lidera, para o líder cuja equipe fica em outro setor não sumir.
  lideranca AS (
    SELECT ce.id AS pessoa_id,
           COALESCE(
             NULLIF(array(
               SELECT l.equipe_id FROM lideradas l
                WHERE l.lider_id = ce.id
                  AND ce.setor_do_perfil IS NOT NULL
                  AND l.setor_id = ce.setor_do_perfil
                ORDER BY l.equipe_id
             ), ARRAY[]::UUID[]),
             array(
               SELECT l.equipe_id FROM lideradas l
                WHERE l.lider_id = ce.id
                ORDER BY l.equipe_id
             )
           ) AS equipes_lideradas
      FROM com_equipe ce
  ),
  vinculos AS (
    SELECT ce.id AS pessoa_id, ce.setor_id, ce.equipe_id FROM com_equipe ce
    UNION
    SELECT cl.operador_id,     cl.setor_id, cl.equipe_id FROM clones cl
  ),
  agregados AS (
    SELECT
      v.pessoa_id,
      COALESCE(array_agg(DISTINCT v.setor_id)  FILTER (WHERE v.setor_id  IS NOT NULL),
               ARRAY[]::UUID[]) AS setores,
      COALESCE(array_agg(DISTINCT v.equipe_id) FILTER (WHERE v.equipe_id IS NOT NULL),
               ARRAY[]::UUID[]) AS equipes
    FROM vinculos v
    GROUP BY v.pessoa_id
  )
  SELECT COALESCE(jsonb_agg(t ORDER BY t.nome), '[]'::JSONB)
    INTO v_out
    FROM (
      SELECT
        ce.id,
        ce.nome,
        ce.usuario,
        ce.foto_url,
        ce.empresa_id,
        ce.perfil,
        ce.equipe_id,
        COALESCE(ce.equipe_nome, 'Sem equipe') AS equipe_nome,
        ce.setor_id,
        ce.situacao,
        COALESCE(ag.setores, ARRAY[]::UUID[]) AS setores,
        COALESCE(ag.equipes, ARRAY[]::UUID[]) AS equipes,
        COALESCE(li.equipes_lideradas, ARRAY[]::UUID[]) AS equipes_lideradas,
        (ce.id = ANY (v_convidados))          AS convidado
      FROM com_equipe ce
      LEFT JOIN agregados ag ON ag.pessoa_id = ce.id
      LEFT JOIN lideranca li ON li.pessoa_id = ce.id
    ) t;

  RETURN v_out;
END;
$function$;

comment on function public.fn_desafio_pessoas_multi(uuid[], uuid[]) is
  'O elenco de uma campanha. `equipes_lideradas` traz as equipes que a pessoa lidera DENTRO do setor dela — é o que desempata o setor montado por clones, onde a mesma equipe existe duas vezes.';
