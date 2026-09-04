-- ============================================================================
-- Completar os clones de um mês FECHADO
-- ============================================================================
--
-- `fn_composicao_mes_snapshot` protege o mês fechado com `v_fechado`: ele só
-- ACRESCENTA o que falta, e nunca reescreve o que já está lá. A regra existe
-- para que mudar equipe ou situação hoje não reescreva o passado, e ela está
-- certa.
--
-- Só que ela tem um buraco. A linha de um operador em `composicao_mes` já
-- existe, então o snapshot a pula por inteiro — inclusive o `equipes_clone`.
-- Um clone criado DEPOIS do fechamento nunca entra, e não havia caminho nenhum
-- para corrigir isso.
--
-- E aqui as duas coisas se separam: congelar protege o que foi DECIDIDO no mês.
-- Um clone criado depois não foi decidido diferente — ele não existia quando o
-- retrato foi tirado, e a equipe nem existia. Completar isso não é reescrever
-- história, é registrar o que nunca chegou a ser capturado.
--
-- ## O caso que originou (04/09/2026, BookPlay)
--
-- O setor `Treinamento Marília` é alternativo e vive de clones. As equipes
-- `TreiPlay 4` e `TreiPlay 5` e os 5 clones nasceram em 03/09 — agosto já
-- fechado. Resultado em agosto: `equipes_clone` vazio nos 5, as duas equipes
-- fora de `composicao_mes_equipe`, o setor fora de `composicao_mes_setor`.
--
-- Sem clone no retrato, `setoresDoOperador` não devolve o setor e `comGente`
-- não inclui as equipes: o setor sumia do Desempenho Equipes, dos Quartis, do
-- Gráfico e do Analítico. R$ 4.118,82 que existiam e não apareciam.
--
-- O `Marília Digital`, montado ANTES do fechamento, sempre funcionou — 17
-- pessoas com clone no retrato de agosto. Não era bug de setor alternativo.
--
-- ## O que esta função faz, e o que ela nunca faz
--
--   ACRESCENTA  clone que existe hoje e falta no retrato do mês
--   ACRESCENTA  a equipe e o setor desse clone, se faltarem no retrato
--   NUNCA       remove clone do retrato
--   NUNCA       mexe em equipe, setor ou situação da pessoa
--
-- É explícita de propósito: não roda junto da importação. Mudar número de mês
-- fechado é decisão de quem manda, não efeito colateral de subir um arquivo.
-- O log guarda quem, quando e exatamente quais pessoas mudaram.
-- ============================================================================

create or replace function public.fn_composicao_mes_completar_clones(
  p_empresa_id uuid,
  p_mes        text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pessoas  integer := 0;
  v_equipes  integer := 0;
  v_setores  integer := 0;
  v_detalhe  jsonb;
begin
  -- Mais estreito que o snapshot de propósito: `lider` e `elite` podem gerar o
  -- retrato do mês corrente, mas mexer em mês fechado é outra gravidade.
  if auth.uid() is not null and (
    not fn_can_access_empresa(p_empresa_id)
    or not (fn_user_is_super_admin()
            or fn_user_has_any_role(array['gerencia','diretoria','administrador']))
  ) then
    raise exception 'NAO_AUTORIZADO: usuário não pode completar este retrato'
      using errcode = '42501';
  end if;
  if auth.uid() is null and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'NAO_AUTORIZADO: sessão ausente' using errcode = '42501';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  -- O que vai mudar, guardado ANTES de mudar: é o que a trilha registra, e é
  -- o que permite responder «por que agosto mudou?» meses depois.
  select coalesce(jsonb_agg(x order by x->>'setor', x->>'equipe'), '[]'::jsonb)
    into v_detalhe
    from (
      select jsonb_build_object(
               'setor', coalesce(s.nome, '(sem setor)'),
               'equipe', e.nome,
               'pessoas', count(*),
               'operadores', jsonb_agg(p.nome order by p.nome)
             ) as x
        from composicao_mes cm
        join perfis p on p.id = cm.operador_id
        join equipe_operadores_clones c
          on c.empresa_id = cm.empresa_id and c.operador_id = cm.operador_id
         and coalesce(c.conta_recebimento, true)
        join equipes e on e.id = c.equipe_id
        left join setores s on s.id = e.setor_id
       where cm.empresa_id = p_empresa_id
         and cm.mes = p_mes
         and not (c.equipe_id = any(coalesce(cm.equipes_clone, '{}'::uuid[])))
       group by s.nome, e.nome
    ) t;

  -- O setor do clone precisa existir no retrato, senão a tela não sabe o nome
  -- nem se ele é alternativo.
  insert into composicao_mes_setor (empresa_id, mes, setor_id, nome, ativo, alternativo)
  select distinct p_empresa_id, p_mes, s.id, s.nome,
         coalesce(s.ativo, true), coalesce(s.alternativo, false)
    from equipe_operadores_clones c
    join equipes e on e.id = c.equipe_id
    join setores s on s.id = e.setor_id
   where c.empresa_id = p_empresa_id
     and not exists (select 1 from composicao_mes_setor cs
                      where cs.empresa_id = p_empresa_id and cs.mes = p_mes and cs.setor_id = s.id)
  on conflict do nothing;
  get diagnostics v_setores = row_count;

  insert into composicao_mes_equipe (empresa_id, mes, equipe_id, nome, setor_id)
  select distinct p_empresa_id, p_mes, e.id, e.nome, e.setor_id
    from equipe_operadores_clones c
    join equipes e on e.id = c.equipe_id
   where c.empresa_id = p_empresa_id
     and not exists (select 1 from composicao_mes_equipe ce
                      where ce.empresa_id = p_empresa_id and ce.mes = p_mes and ce.equipe_id = e.id)
  on conflict do nothing;
  get diagnostics v_equipes = row_count;

  -- A união dos dois conjuntos. Só cresce: o que já estava no retrato fica,
  -- mesmo que o clone não exista mais hoje — tirar seria reescrever o mês.
  with novo as (
    select cm.operador_id,
           array(
             select distinct u from (
               select unnest(coalesce(cm.equipes_clone, '{}'::uuid[])) as u
               union
               select c.equipe_id
                 from equipe_operadores_clones c
                where c.empresa_id = p_empresa_id
                  and c.operador_id = cm.operador_id
                  and coalesce(c.conta_recebimento, true)
             ) t where u is not null
           ) as lista
      from composicao_mes cm
     where cm.empresa_id = p_empresa_id and cm.mes = p_mes
  )
  update composicao_mes cm
     set equipes_clone = n.lista
    from novo n
   where cm.empresa_id = p_empresa_id
     and cm.mes = p_mes
     and cm.operador_id = n.operador_id
     -- Só quando CRESCE. Comparar o array inteiro pegaria diferença de ordem e
     -- reescreveria linha que não mudou.
     and coalesce(array_length(n.lista, 1), 0)
       > coalesce(array_length(cm.equipes_clone, 1), 0);
  get diagnostics v_pessoas = row_count;

  perform fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'aviso',
    p_descricao  => format(
      'Completou os clones do mês %s — %s pessoa(s), %s equipe(s) e %s setor(es) que faltavam no retrato',
      p_mes, v_pessoas, v_equipes, v_setores),
    p_empresa_id => p_empresa_id,
    p_tabela     => 'composicao_mes',
    p_alvo_tipo  => 'composicao_mes',
    p_alvo_rotulo=> p_mes,
    p_detalhes   => jsonb_build_object(
      'mes', p_mes, 'apenas_clones', true,
      'pessoas', v_pessoas, 'equipes', v_equipes, 'setores', v_setores,
      'mudancas', v_detalhe),
    p_origem     => 'ui'
  );

  return jsonb_build_object(
    'mes', p_mes, 'pessoas', v_pessoas, 'equipes', v_equipes,
    'setores', v_setores, 'mudancas', v_detalhe);
end;
$$;

comment on function public.fn_composicao_mes_completar_clones(uuid, text) is
  'Acrescenta ao retrato de um mês os clones criados depois do fechamento. Só cresce: nunca remove clone nem mexe em equipe, setor ou situação.';

grant execute on function public.fn_composicao_mes_completar_clones(uuid, text) to authenticated;
