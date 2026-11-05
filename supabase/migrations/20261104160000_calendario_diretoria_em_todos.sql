-- ═══════════════════════════════════════════════════════════════════════════
-- Calendário: o aniversário da diretoria aparece no calendário de todo setor
-- (04/11/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O pedido
--
-- A diretoria não mora em setor (20261104120000 a pôs na lista de
-- aniversariantes de todos). Lançado o aniversário de um diretor em UM setor,
-- ele tem que aparecer no calendário de TODOS — e em destaque, que a tela faz.
--
-- ## Como: na leitura, não copiando
--
-- `fn_calendario_mes` passa a trazer, além dos eventos do setor, os
-- aniversários de diretoria lançados nos OUTROS setores da empresa no mesmo
-- mês. Não se copia o evento para cada setor: cópia diverge (corrigir o dia
-- num setor não corrigiria nos outros) e apagar deixaria sobras. Assim, lançar,
-- corrigir e apagar continuam num lugar só — o setor que lançou.
--
-- - Só entra o que o setor de origem já LANÇOU (`publicado_em`): rascunho de
--   outro setor não vaza.
-- - O mesmo diretor no mesmo dia, lançado em dois setores, chega uma vez só; e
--   se o próprio setor também lançou, vale o dele.
-- - Cada evento diz se é de diretoria (`pessoa_diretoria`) e, quando vem de
--   fora, de onde (`de_outro_setor`, `setor_origem`). A tela não oferece editar
--   o que é de outro setor — e `fn_calendario_evento_excluir` já recusaria,
--   porque confere a permissão no setor do próprio evento.
--
-- Mesma assinatura e mesmo retorno (JSONB com campos a mais): CREATE OR
-- REPLACE basta. Aba antiga ignora os campos novos.
--
-- ## Para desfazer
--
-- Rodar de novo o `fn_calendario_mes` de 20261006190000 (seção 2).

CREATE OR REPLACE FUNCTION public.fn_calendario_mes(p_empresa_id UUID, p_setor_id UUID, p_mes DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mes       DATE := date_trunc('month', p_mes)::DATE;
  v_fim       DATE := (date_trunc('month', p_mes) + INTERVAL '1 month')::DATE;
  v_edita     BOOLEAN;
  v_publicado TIMESTAMPTZ;
BEGIN
  IF NOT public.fn_calendario_alcanca(p_empresa_id, p_setor_id) THEN
    RAISE EXCEPTION 'Sem permissao para ver o Calendario deste setor.' USING ERRCODE = '42501';
  END IF;

  v_edita := public.fn_calendario_edita(p_empresa_id, p_setor_id);

  SELECT m.publicado_em INTO v_publicado
    FROM public.calendario_meses m
   WHERE m.empresa_id = p_empresa_id AND m.setor_id = p_setor_id AND m.mes = v_mes;

  -- Rascunho, e quem pergunta não monta o calendário: o mês chega vazio.
  IF v_publicado IS NULL AND NOT v_edita THEN
    RETURN jsonb_build_object('publicado', false, 'publicado_em', NULL, 'capa', NULL, 'eventos', '[]'::JSONB);
  END IF;

  RETURN jsonb_build_object(
    'publicado',    v_publicado IS NOT NULL,
    'publicado_em', v_publicado,
    'capa', (
      SELECT jsonb_build_object(
               'tema', m.tema, 'titulo', m.titulo, 'frase', m.frase,
               'expediente_semana', m.expediente_semana, 'expediente_sabado', m.expediente_sabado,
               'atualizado_em', m.atualizado_em)
        FROM public.calendario_meses m
       WHERE m.empresa_id = p_empresa_id AND m.setor_id = p_setor_id AND m.mes = v_mes
    ),
    'eventos', COALESCE((
      SELECT jsonb_agg(x.j ORDER BY x.dia, x.criado_em)
        FROM (
          -- Os eventos do próprio setor, como sempre.
          SELECT e.dia, e.criado_em, jsonb_build_object(
                   'id', e.id, 'dia', e.dia, 'tipo', e.tipo, 'titulo', e.titulo,
                   'detalhe', e.detalhe, 'destaque', e.destaque,
                   'pessoa_id', e.pessoa_id, 'pessoa_nome', p.nome, 'pessoa_foto', p.foto_url,
                   'pessoa_diretoria', COALESCE(p.perfil::TEXT = 'diretoria', FALSE),
                   'de_outro_setor', FALSE) AS j
            FROM public.calendario_eventos e
            LEFT JOIN public.perfis p ON p.id = e.pessoa_id
           WHERE e.empresa_id = p_empresa_id
             AND e.setor_id = p_setor_id
             AND e.dia >= v_mes AND e.dia < v_fim

          UNION ALL

          -- O aniversário da diretoria lançado (e publicado) em outro setor.
          SELECT d.dia, d.criado_em, jsonb_build_object(
                   'id', d.id, 'dia', d.dia, 'tipo', d.tipo, 'titulo', d.titulo,
                   'detalhe', d.detalhe, 'destaque', d.destaque,
                   'pessoa_id', d.pessoa_id, 'pessoa_nome', d.pessoa_nome, 'pessoa_foto', d.pessoa_foto,
                   'pessoa_diretoria', TRUE,
                   'de_outro_setor', TRUE, 'setor_origem', d.setor_nome)
            FROM (
              SELECT DISTINCT ON (e.pessoa_id, e.dia)
                     e.id, e.dia, e.tipo, e.titulo, e.detalhe, e.destaque, e.pessoa_id, e.criado_em,
                     p.nome AS pessoa_nome, p.foto_url AS pessoa_foto, s.nome AS setor_nome
                FROM public.calendario_eventos e
                JOIN public.perfis p ON p.id = e.pessoa_id AND p.perfil::TEXT = 'diretoria'
                JOIN public.calendario_meses m
                  ON m.empresa_id = e.empresa_id AND m.setor_id = e.setor_id
                 AND m.mes = v_mes AND m.publicado_em IS NOT NULL
                LEFT JOIN public.setores s ON s.id = e.setor_id
               WHERE e.empresa_id = p_empresa_id
                 AND e.setor_id <> p_setor_id
                 AND e.tipo = 'aniversario'
                 AND e.dia >= v_mes AND e.dia < v_fim
                 AND NOT EXISTS (
                   SELECT 1 FROM public.calendario_eventos o
                    WHERE o.empresa_id = p_empresa_id AND o.setor_id = p_setor_id
                      AND o.tipo = 'aniversario' AND o.pessoa_id = e.pessoa_id AND o.dia = e.dia)
               ORDER BY e.pessoa_id, e.dia, e.criado_em
            ) d
        ) x
    ), '[]'::JSONB)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_calendario_mes(UUID, UUID, DATE) IS
  'A capa e os eventos do Calendario do setor no mes, mais o aniversario de diretoria '
  'lancado (publicado) em outro setor. Rascunho chega vazio para quem nao edita. '
  '20261006170000 + 20261006190000 + 20261104160000.';
