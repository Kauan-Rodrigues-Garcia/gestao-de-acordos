-- Corrige a equipe exibida e usada pelos desafios para cargos de liderança.
-- Usuários > Equipes mantém equipe_lideres; perfis.equipe_id pode ser legado.
-- Sem vínculo atual, o líder fica sem equipe. Membros mantêm seu cadastro.
-- Preserva o recorte de equipes-clone no setor do líder e os portões das RPCs.
-- Não altera perfis, equipes, recebimentos ou permissões dos usuários.
CREATE OR REPLACE FUNCTION public.fn_desafio_pessoas_multi(p_empresas uuid[], p_convidados uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_out        JSONB;
  v_convidados UUID[] := COALESCE(p_convidados, '{}'::UUID[]);
BEGIN
  WITH lider_unico AS (
    SELECT el.lider_id, MIN(el.equipe_id::TEXT)::UUID AS equipe_id
      FROM public.equipe_lideres el
     WHERE el.empresa_id = ANY (p_empresas)
     GROUP BY el.lider_id
    HAVING COUNT(DISTINCT el.equipe_id) = 1
  ),
  lideradas AS (
    SELECT el.lider_id, el.equipe_id, e.setor_id, e.nome
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
      CASE WHEN p.perfil = 'lider' THEN lu.equipe_id
           ELSE COALESCE(p.equipe_id, lu.equipe_id) END AS equipe_id,
      e.nome                              AS equipe_nome,
      COALESCE(e.setor_id, p.setor_id)    AS setor_id
    FROM public.perfis p
    LEFT JOIN lider_unico lu   ON lu.lider_id = p.id
    LEFT JOIN public.equipes e ON e.id = CASE WHEN p.perfil = 'lider' THEN lu.equipe_id
                         ELSE COALESCE(p.equipe_id, lu.equipe_id) END
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
  -- As equipes que a pessoa lidera DENTRO do setor dela, com id E nome. A
  -- reserva (todas as que ela lidera) cobre o líder cuja equipe fica em outro
  -- setor: ele continua funcionando como antes, em vez de sumir do ranking.
  lideranca AS (
    SELECT ce.id AS pessoa_id,
           COALESCE(no_setor.ids,  todas.ids)   AS equipes_lideradas,
           COALESCE(no_setor.nomes, todas.nomes) AS nomes
      FROM com_equipe ce
      LEFT JOIN LATERAL (
        SELECT NULLIF(array_agg(l.equipe_id ORDER BY l.nome), ARRAY[]::UUID[]) AS ids,
               string_agg(l.nome, ' · ' ORDER BY l.nome)                       AS nomes
          FROM lideradas l
         WHERE l.lider_id = ce.id
           AND ce.setor_do_perfil IS NOT NULL
           AND l.setor_id = ce.setor_do_perfil
      ) no_setor ON TRUE
      LEFT JOIN LATERAL (
        SELECT NULLIF(array_agg(l.equipe_id ORDER BY l.nome), ARRAY[]::UUID[]) AS ids,
               string_agg(l.nome, ' · ' ORDER BY l.nome)                       AS nomes
          FROM lideradas l
         WHERE l.lider_id = ce.id
      ) todas ON TRUE
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
        -- Líder usa os vínculos atuais de Usuários > Equipes, nunca o cadastro legado.
        -- Para membros, preserva a equipe do cadastro. O recorte das equipes
        -- lideradas continua no setor do líder para não duplicar equipes-clone.
        CASE WHEN ce.perfil = 'lider' THEN COALESCE(li.nomes, 'Sem equipe')
             ELSE COALESCE(ce.equipe_nome, li.nomes, 'Sem equipe') END AS equipe_nome,
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

REVOKE ALL ON FUNCTION public.fn_desafio_pessoas_multi(UUID[], UUID[]) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.fn_desafio_pessoas_multi(UUID[], UUID[]) IS
  'Elenco interno dos desafios: líder usa equipe_lideres atual, membro usa seu cadastro. Equipes lideradas respeitam o setor para evitar duplicar clones. Acesso somente pelas RPCs que validam alcance.';
