-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 2, regra 4: o que o 58 trouxe e o 59 ainda não confirmou
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fase 2 do `docs/PLANO-SINCRONIZACAO-59.md`, regra 4.
--
-- ## Uma pendência é uma linha do 58 que o 59 não tem
--
-- Enquanto o 59 não for a fonte horária, o 58 chega antes em alguns momentos do
-- dia. A linha que ele traz e que o 59 ainda não tem é uma **pendência**: conta
-- normalmente, mas está esperando confirmação da fonte oficial.
--
-- O recorte é o mesmo da conferência: setor + cobradora + NR, com a carteira
-- mandando. Ver `20260914005101`.
--
-- ## A escalada sai do número de promoções, não de um contador
--
-- «1ª importação pendente, 2ª crítica» precisa saber quantas vezes o 59 rodou
-- sem ver aquela linha. Isso é contável: `mestre_lotes` promovidos depois do
-- `importado_em` da linha.
--
--   0 promoções → `aguardando`  o 59 não rodou desde que o 58 trouxe. Não é
--                               cobrança de ninguém ainda.
--   1 promoção  → `pendente`    o 59 rodou uma vez e não viu.
--   2 ou mais   → `critico`     o 59 rodou duas vezes e continua sem ver.
--
-- Contador guardado em coluna sairia do lugar: lote revertido, reimportação,
-- correção manual. Contagem não sai.
--
-- ## Por que isto é derivado, e não carimbado
--
-- O desenho inicial era carimbar `confirmado_em` na linha quando o 59 a visse,
-- por trigger na promoção do lote. A medição desfez o plano:
--
--   carimbar (semi join, o update da promoção) ..... 289 ms
--   derivar  (anti join, esta função) ...............  92 ms
--
-- A versão derivada é mais barata E mais correta. Se um lote novo do 59 deixar
-- de trazer um pagamento que o anterior trazia — estorno no ERP —, o carimbo
-- continuaria dizendo «confirmado» para sempre; a derivação volta a apontar a
-- pendência, que é a verdade daquele momento.
--
-- Medido em setembro/2026: 8.400 linhas do 58, **18 pendências**, todas
-- `aguardando` (o 58 do Receptivo foi importado depois do último lote do 59).
--
-- ## Escrita: nenhuma
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_analitico_pendencias(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid    default null,
  p_limite     integer default 300
)
returns table(
  id                   uuid,
  setor_id             uuid,
  setor_nome           text,
  operador_usuario     text,
  operador_nome        text,
  codigo               text,
  data_pagamento       date,
  forma_pagamento      text,
  valor_recebido       numeric,
  importado_em         timestamptz,
  promocoes_desde      bigint,
  severidade           text,
  no_59_em_outro_setor boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  -- A linha do 58 que o 59 NAO tem no mesmo setor/cobradora/NR.
  --
  -- `not exists` e nao `left join ... is null` de proposito: o planejador
  -- escolhe Hash Right Anti Join e o mes inteiro sai em 92 ms.
  pendentes as (
    select a.id, a.empresa_id, a.setor_id, a.operador_usuario, a.operador_id,
           a.codigo, a.data_pagamento, a.forma_pagamento, a.valor_recebido,
           a.importado_em, a.mes_referencia
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = (select d from ref)
       and a.setor_id is not null
       and a.procedencia = 'relatorio_58'
       and coalesce(a.codigo, '') <> ''
       and (p_setor_id is null or a.setor_id = p_setor_id)
       and not exists (
             select 1
               from mestre_recebimentos r
               join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
               join mestre_grupos g
                 on g.empresa_id = r.empresa_id
                and g.cod_grupo_filtro = r.cod_grupo_filtro
                and g.estado = 'vinculado'
              where r.empresa_id = a.empresa_id
                and r.mes = a.mes_referencia
                and g.setor_id = a.setor_id
                and upper(btrim(r.cobradora)) = upper(btrim(a.operador_usuario))
                and r.nr_documento = a.codigo)
  )
  select p.id, p.setor_id,
         coalesce(cms.nome, s.nome),
         p.operador_usuario,
         coalesce(cm.nome, p.operador_usuario),
         p.codigo, p.data_pagamento, p.forma_pagamento,
         round(p.valor_recebido, 2),
         p.importado_em,
         promo.n,
         case when promo.n = 0 then 'aguardando'
              when promo.n = 1 then 'pendente'
              else 'critico' end,
         exists (
           select 1
             from mestre_recebimentos r2
             join mestre_lotes l2 on l2.id = r2.lote_id and l2.estado = 'vigente'
            where r2.empresa_id = p.empresa_id
              and r2.mes = p.mes_referencia
              and r2.nr_documento = p.codigo)
    from pendentes p
    cross join lateral (
      -- Quantas vezes o 59 rodou DEPOIS de o 58 trazer esta linha.
      select count(*) as n
        from mestre_lotes ml
       where ml.empresa_id = p.empresa_id
         and ml.mes = p.mes_referencia
         and ml.estado in ('vigente', 'substituido')
         and ml.promovido_em > p.importado_em
    ) promo
    left join setores s on s.id = p.setor_id
    left join composicao_mes_setor cms
      on cms.empresa_id = p_empresa_id and cms.mes = p_mes and cms.setor_id = p.setor_id
    left join composicao_mes cm
      on cm.empresa_id = p_empresa_id and cm.mes = p_mes and cm.operador_id = p.operador_id
   where (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
   -- Critico primeiro: e o que o 59 ja teve duas chances de ver.
   order by case when promo.n >= 2 then 0 when promo.n = 1 then 1 else 2 end,
            p.valor_recebido desc
   limit greatest(coalesce(p_limite, 300), 1);
$function$;

comment on function public.fn_analitico_pendencias(uuid, text, uuid, integer) is
  'Linhas que o 58 trouxe e o 59 ainda nao tem (regra 4 do plano), com a '
  'escalada derivada do numero de lotes do 59 promovidos desde o importado_em '
  'da linha: 0 = aguardando, 1 = pendente, 2+ = critico. Derivada e nao '
  'carimbada — mais barata (92 ms contra 289) e mais correta, porque estorno no '
  'ERP volta a aparecer. So leitura.';

grant execute on function public.fn_analitico_pendencias(uuid, text, uuid, integer) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- O resumo por setor
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.fn_analitico_pendencias_resumo(
  p_empresa_id uuid,
  p_mes        text
)
returns table(
  setor_id   uuid,
  setor_nome text,
  severidade text,
  linhas     bigint,
  valor      numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.setor_id, max(p.setor_nome), p.severidade,
         count(*)::bigint, round(sum(p.valor_recebido), 2)
    from fn_analitico_pendencias(p_empresa_id, p_mes, null, 1000000) p
   group by p.setor_id, p.severidade
   order by max(p.setor_nome),
            case p.severidade when 'critico' then 0 when 'pendente' then 1 else 2 end;
$function$;

comment on function public.fn_analitico_pendencias_resumo(uuid, text) is
  'Resumo de fn_analitico_pendencias por setor e severidade. So leitura.';

grant execute on function public.fn_analitico_pendencias_resumo(uuid, text) to authenticated;

commit;
