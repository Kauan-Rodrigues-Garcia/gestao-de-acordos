-- =============================================================================
-- NR 12792564 (Sirlei Stephanie): a 2ª parcela vira PIX Automático e entra no Pix
-- 08/10/2026
-- =============================================================================
--
-- O caso: entrada de R$ 60,00 paga hoje no Pix (parcela 1/2) e o resto,
-- R$ 2.806,38, no PIX Automático em 24/10 (parcela 2/2). A tela ainda recusava
-- forma recorrente como parcela, e ela salvou a 2ª como «Pix» comum — fora da
-- comissão do Pix Automático. A tela passou a aceitar (commit desta data); este
-- script acerta o que já foi gravado.
--
-- O que grava (2 linhas):
--   1. acordos: a parcela 2/2 (id d3c1e8d5-…) muda de tipo 'pix' para
--      'pix_automatico'. Valor, data e status ficam como estão.
--   2. pix_automatico_acordos: registra o NR 12792564 no nome da Sirlei, com o
--      valor TOTAL R$ 2.806,38, status 'pendente' (o líder confere, como
--      qualquer registro da aba). Mês do registro: outubro (agora).
--
-- Tudo num bloco só: se o acordo não estiver como foi lido em 08/10 (tipo, valor,
-- data, dona) ou o NR já estiver no Pix, nada é gravado e a mensagem diz o quê.
-- =============================================================================

do $$
declare
  v_parcela uuid := 'd3c1e8d5-3f2c-4761-8c8f-306e0d59882b';
  a         record;
  v_nome    text;
  v_n       integer;
begin
  select * into a from public.acordos where id = v_parcela for update;
  if not found then
    raise exception 'Parcela % não existe. Nada foi gravado.', v_parcela;
  end if;
  if a.nr_cliente <> '12792564' or a.numero_parcela <> 2 or a.valor <> 2806.38
     or a.vencimento <> date '2026-10-24' or a.tipo not in ('pix', 'pix_automatico') then
    raise exception 'A parcela mudou desde a leitura (NR %, parcela %, valor %, venc. %, tipo %). Nada foi gravado.',
      a.nr_cliente, a.numero_parcela, a.valor, a.vencimento, a.tipo;
  end if;

  select p.nome into v_nome from public.perfis p where p.id = a.operador_id;
  if v_nome is distinct from 'Sirlei Stephanie' then
    raise exception 'A parcela não é mais da Sirlei (dona: %). Nada foi gravado.', coalesce(v_nome, '?');
  end if;

  -- 1. A forma da 2ª parcela.
  update public.acordos set tipo = 'pix_automatico'
   where id = v_parcela and tipo = 'pix';
  get diagnostics v_n = row_count;
  raise notice 'acordos: % linha(s) mudada(s) para pix_automatico.', v_n;

  -- 2. O registro na aba Pix Automático (o trigger de duplicidade decide se o
  --    NR já é de alguém; se for, a exceção desfaz o passo 1 também).
  if exists (select 1 from public.pix_automatico_acordos where nr_cliente = '12792564') then
    raise exception 'O NR 12792564 já está na aba Pix Automático. Nada foi gravado.';
  end if;
  insert into public.pix_automatico_acordos
    (empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, status)
  values
    (a.empresa_id, a.operador_id, v_nome, a.setor_id, '12792564', 2806.38, 'pendente');
  raise notice 'pix_automatico_acordos: NR 12792564 registrado (R$ 2.806,38, pendente).';
end
$$;

-- ── Conferência ───────────────────────────────────────────────────────────────
select 'acordo' as onde, a.numero_parcela::text as parcela, a.tipo, a.status, a.valor, a.vencimento::text as data
  from public.acordos a where a.nr_cliente = '12792564'
union all
select 'pix automático', null, null, x.status, x.valor, x.criado_em::date::text
  from public.pix_automatico_acordos x where x.nr_cliente = '12792564'
order by 1, 2;
