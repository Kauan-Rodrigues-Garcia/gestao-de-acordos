-- ============================================================================
-- Relatórios PaguePlay: Id.Baixa que volta diferente é ATUALIZADO, não recusado
-- ============================================================================
--
-- ## O bloqueio
--
-- A etapa `concluir` recusava o lote inteiro quando um Id.Baixa já salvo
-- voltava no arquivo com qualquer campo diferente:
--
--   Id.Baixa N já salvo com dados diferentes. Confira o arquivo; para
--   corrigir, exclua o mês correspondente e reimporte. Nada foi gravado.
--
-- O relatório é reexportado inteiro (janeiro até hoje) e importado todo dia, e
-- a PaguePlay reajusta linhas antigas depois — competência, valores, IA. Uma
-- linha reajustada bastava para travar a importação do dia e obrigar a limpar
-- um mês inteiro.
--
-- ## O que NÃO era o problema
--
-- O mesmo cliente pagando em meses diferentes nunca foi bloqueado: cada
-- pagamento tem o próprio Id.Baixa. Conferido em 28/09/2026 nos dados salvos —
-- 7.363 acordos (pagamento) e 11.754 (conciliação) aparecem em mais de um mês,
-- e nenhum par acordo+parcela se repete entre meses.
--
-- ## O que passa a acontecer
--
-- O arquivo mais novo prevalece: a linha salva é atualizada com o conteúdo do
-- arquivo (`ON CONFLICT ... DO UPDATE`, só quando algo mudou). O retorno
-- ganha `atualizados` ao lado de `inseridos` e `ignorados`.
--
-- Continua valendo tudo o que protege o arquivo em si: quantidade e totais
-- conferidos contra o rodapé, período declarado, centavos inteiros, e o
-- mesmo Id.Baixa divergente DENTRO do mesmo arquivo.
--
-- Só troca a função `private.pp_relatorio_operar`; tabelas e permissões ficam
-- como estão. Reexecutável.
-- ============================================================================

CREATE OR REPLACE FUNCTION private.pp_relatorio_operar(p_acao text, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e uuid; m text; t text; l private.pp_relatorio_lotes%ROWTYPE;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  inicio date; fim date; n integer; inseridos integer; atualizados integer; escritos integer; soma jsonb; v_resultado jsonb;
  conflito text; grupos jsonb; dias jsonb; ultima timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária.'; END IF;
  IF p_acao IN ('adicionar', 'concluir', 'cancelar') THEN
    SELECT * INTO l FROM private.pp_relatorio_lotes WHERE id = (p->>'lote')::uuid;
    IF NOT FOUND OR l.criado_por <> auth.uid() THEN RAISE EXCEPTION 'Lote indisponível.'; END IF;
    e := l.empresa_id; m := l.modalidade;
  ELSE
    e := (p->>'empresa')::uuid; m := p->>'modalidade';
  END IF;
  IF NOT coalesce(public.fn_pp_relatorio_acesso(e), false) THEN RAISE EXCEPTION 'Sem acesso ao relatório da diretoria desta empresa.'; END IF;
  IF m IS NULL OR m NOT IN ('pagamento', 'conciliacao') THEN RAISE EXCEPTION 'Modalidade inválida.'; END IF;
  t := CASE m WHEN 'pagamento' THEN 'pp_relatorio_pagamentos' ELSE 'pp_relatorio_conciliacoes' END;
  -- Ordem única de locks: empresa/modalidade, depois lote. Evita corrida entre
  -- exclusão e confirmação e mantém o resumo coerente durante importações.
  PERFORM pg_advisory_xact_lock(hashtextextended(e::text || ':' || m,0));
  IF p_acao IN ('adicionar', 'concluir', 'cancelar') THEN
    SELECT * INTO l FROM private.pp_relatorio_lotes WHERE id = (p->>'lote')::uuid FOR UPDATE;
    IF NOT FOUND OR l.criado_por <> auth.uid() THEN RAISE EXCEPTION 'Lote indisponível.'; END IF;
  END IF;

  IF p_acao = 'abrir' THEN
    inicio := (p->>'inicio')::date; fim := (p->>'fim')::date;
    IF inicio IS NULL OR fim IS NULL OR inicio < '2000-01-01' OR inicio > fim OR fim > hoje THEN RAISE EXCEPTION 'Período inválido.'; END IF;
    IF fim = hoje AND inicio > hoje - 1 AND NOT EXISTS (
      SELECT 1 FROM private.pp_relatorio_controle_diario WHERE empresa_id=e AND modalidade=m AND dia=hoje
    ) THEN RAISE EXCEPTION 'A primeira importação do dia deve incluir ontem e hoje.'; END IF;
    -- Lotes interrompidos nunca entram nos totais. Remover staging abandonado.
    DELETE FROM private.pp_relatorio_lotes WHERE empresa_id=e AND modalidade=m AND concluido_em IS NULL AND criado_em < now() - interval '2 days';
    INSERT INTO private.pp_relatorio_lotes (empresa_id,modalidade,inicio,fim,arquivo,quantidade,totais,criado_por)
      VALUES (e,m,inicio,fim,p->>'arquivo',(p->>'quantidade')::integer,p->'totais',auth.uid()) RETURNING id INTO l.id;
    RETURN to_jsonb(l.id);

  ELSIF p_acao = 'adicionar' THEN
    IF l.concluido_em IS NOT NULL THEN RAISE EXCEPTION 'Lote já concluído.'; END IF;
    IF jsonb_typeof(p->'linhas') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'linhas') NOT BETWEEN 1 AND 1500 THEN RAISE EXCEPTION 'Bloco de importação inválido.'; END IF;
    -- Repetir o mesmo bloco após falha de rede é seguro, alterar um bloco não.
    SELECT s.id_baixa INTO conflito FROM private.pp_relatorio_linhas s
      JOIN jsonb_array_elements(p->'linhas') r ON s.id_baixa = r->>'id_baixa'
      WHERE s.lote_id=l.id AND s.dados IS DISTINCT FROM r LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Pagamento % divergente dentro do lote.', conflito; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p->'linhas') r GROUP BY r->>'id_baixa' HAVING count(DISTINCT r) > 1) THEN RAISE EXCEPTION 'Identificador duplicado divergente.'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p->'linhas') r, unnest(ARRAY['total','coren','cofen','pp']) k
      WHERE coalesce(r->>k,'') !~ '^-?[0-9]+$' OR abs((r->>k)::numeric) > 9007199254740991) THEN RAISE EXCEPTION 'Valores devem ser centavos inteiros.'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p->'linhas') r WHERE
      jsonb_typeof(r) <> 'object' OR (r->>'data')::date NOT BETWEEN l.inicio AND l.fim
      OR (r->>'data_pagamento')::date NOT BETWEEN '2000-01-01' AND hoje OR coalesce(r->>'id_baixa','') !~ '^[0-9]+$'
      OR NOT r ?& ARRAY['id_baixa','data','data_pagamento','uf','acordo','parcela','forma','ia','total','coren','cofen','pp']
      OR EXISTS (SELECT 1 FROM jsonb_each(r) v WHERE v.value = 'null'::jsonb)
      OR (SELECT count(*) FROM jsonb_object_keys(r)) <> 12
    ) THEN RAISE EXCEPTION 'Pagamento inválido ou fora do período declarado.'; END IF;
    INSERT INTO private.pp_relatorio_linhas SELECT l.id, r->>'id_baixa', r FROM jsonb_array_elements(p->'linhas') r
      ON CONFLICT (lote_id,id_baixa) DO NOTHING;
    RETURN 'null'::jsonb;

  ELSIF p_acao = 'concluir' THEN
    IF l.concluido_em IS NOT NULL THEN RETURN l.resultado; END IF;
    IF (l.criado_em AT TIME ZONE 'America/Sao_Paulo')::date <> hoje THEN RAISE EXCEPTION 'O dia mudou durante a importação. Selecione o arquivo novamente.'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(e::text || ':' || m,0));
    IF l.fim=hoje AND l.inicio>hoje-1 AND NOT EXISTS (
      SELECT 1 FROM private.pp_relatorio_controle_diario WHERE empresa_id=e AND modalidade=m AND dia=hoje
    ) THEN RAISE EXCEPTION 'A primeira importação do dia deve incluir ontem e hoje.'; END IF;
    SELECT count(*), jsonb_build_object('total',sum((dados->>'total')::numeric),'coren',sum((dados->>'coren')::numeric),
      'cofen',sum((dados->>'cofen')::numeric),'pp',sum((dados->>'pp')::numeric)) INTO n,soma
      FROM private.pp_relatorio_linhas WHERE lote_id=l.id;
    IF n <> l.quantidade OR soma IS DISTINCT FROM l.totais THEN RAISE EXCEPTION 'A quantidade ou os totais recebidos não conferem com o arquivo. Nada foi gravado.'; END IF;
    -- Id.Baixa que já estava salvo e volta com outro conteúdo: vale o arquivo
    -- mais novo. A PaguePlay reajusta a linha depois (data de competência,
    -- valores, IA), e o relatório é reexportado inteiro todo dia — recusar
    -- aqui travava a importação do dia e mandava limpar um mês inteiro.
    -- Contado ANTES de gravar para o retorno separar novos de atualizados.
    EXECUTE format('SELECT count(*) FROM public.%I a JOIN private.pp_relatorio_linhas s ON s.id_baixa=a.id_baixa
      CROSS JOIN LATERAL jsonb_to_record(s.dados) r(data date,data_pagamento date,uf text,acordo text,parcela text,forma text,ia text,total bigint,coren bigint,cofen bigint,pp bigint)
      WHERE a.empresa_id=$1 AND s.lote_id=$2
        AND (a.data,a.data_pagamento,a.uf,a.acordo,a.parcela,a.forma,a.ia,a.total,a.coren,a.cofen,a.pp)
            IS DISTINCT FROM (r.data,r.data_pagamento,r.uf,r.acordo,r.parcela,r.forma,r.ia,r.total,r.coren,r.cofen,r.pp)',t)
      INTO atualizados USING e,l.id;
    EXECUTE format('INSERT INTO public.%I AS a SELECT $1,r.* FROM private.pp_relatorio_linhas s
      CROSS JOIN LATERAL jsonb_to_record(s.dados) r(id_baixa text,data date,data_pagamento date,uf text,acordo text,parcela text,forma text,ia text,total bigint,coren bigint,cofen bigint,pp bigint)
      WHERE s.lote_id=$2
      ON CONFLICT (empresa_id,id_baixa) DO UPDATE SET
        data=excluded.data, data_pagamento=excluded.data_pagamento, uf=excluded.uf, acordo=excluded.acordo,
        parcela=excluded.parcela, forma=excluded.forma, ia=excluded.ia,
        total=excluded.total, coren=excluded.coren, cofen=excluded.cofen, pp=excluded.pp
      WHERE (a.data,a.data_pagamento,a.uf,a.acordo,a.parcela,a.forma,a.ia,a.total,a.coren,a.cofen,a.pp)
            IS DISTINCT FROM (excluded.data,excluded.data_pagamento,excluded.uf,excluded.acordo,excluded.parcela,
                              excluded.forma,excluded.ia,excluded.total,excluded.coren,excluded.cofen,excluded.pp)',t)
      USING e,l.id;
    GET DIAGNOSTICS escritos = ROW_COUNT;
    inseridos := escritos - atualizados;
    -- Conferência do acumulado após inclusão: abortar em vez de perder precisão no JS.
    EXECUTE format('SELECT jsonb_build_object(''total'',sum(total),''coren'',sum(coren),''cofen'',sum(cofen),''pp'',sum(pp)) FROM public.%I WHERE empresa_id=$1',t) INTO soma USING e;
    IF EXISTS (SELECT 1 FROM jsonb_each_text(soma) v WHERE abs(v.value::numeric)>9007199254740991) THEN RAISE EXCEPTION 'Acumulado excede o limite de precisão.'; END IF;
    INSERT INTO private.pp_relatorio_dias
      SELECT e,m,d::date,now(),d::date<hoje FROM generate_series(l.inicio::timestamp,l.fim::timestamp,interval '1 day') d
      ON CONFLICT (empresa_id,modalidade,data) DO UPDATE SET importado_em=excluded.importado_em, completo=excluded.completo;
    IF l.fim=hoje AND l.inicio<=hoje-1 THEN
      INSERT INTO private.pp_relatorio_controle_diario VALUES(e,m,hoje) ON CONFLICT DO NOTHING;
    END IF;
    v_resultado := jsonb_build_object('inseridos',inseridos,'atualizados',atualizados,'ignorados',n-escritos);
    UPDATE private.pp_relatorio_lotes SET concluido_em=now(),resultado=v_resultado WHERE id=l.id;
    DELETE FROM private.pp_relatorio_linhas WHERE lote_id=l.id;
    RETURN v_resultado;

  ELSIF p_acao = 'cancelar' THEN
    IF l.concluido_em IS NULL THEN DELETE FROM private.pp_relatorio_lotes WHERE id=l.id; END IF;
    RETURN 'null'::jsonb;

  ELSIF p_acao = 'excluir' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(e::text || ':' || m,0));
    IF p->>'mes' IS NOT NULL THEN
      IF p->>'mes' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Mês inválido.'; END IF;
      inicio := ((p->>'mes') || '-01')::date; fim := (inicio + interval '1 month')::date - 1;
    END IF;
    -- Um lote aberto antes da exclusão não pode devolver os dados apagados.
    DELETE FROM private.pp_relatorio_lotes WHERE empresa_id=e AND modalidade=m AND concluido_em IS NULL;
    EXECUTE format('DELETE FROM public.%I WHERE empresa_id=$1 AND ($2 IS NULL OR data BETWEEN $2 AND $3)',t) USING e,inicio,fim;
    GET DIAGNOSTICS n = ROW_COUNT;
    DELETE FROM private.pp_relatorio_dias WHERE empresa_id=e AND modalidade=m AND (inicio IS NULL OR data BETWEEN inicio AND fim);
    DELETE FROM private.pp_relatorio_controle_diario WHERE empresa_id=e AND modalidade=m;
    RETURN to_jsonb(n);

  ELSIF p_acao = 'resumo' THEN
    -- Um JSON agregado evita o corte de 1000 linhas da Data API. A granularidade
    -- preserva Data (competência), Dt.Pagamento (diário), UF, forma e IA do HTML.
    EXECUTE format('SELECT coalesce(jsonb_agg(g ORDER BY data,data_pagamento,uf,forma,ia),''[]''::jsonb) FROM
      (SELECT data,data_pagamento,uf,forma,ia,sum(total) total,sum(coren) coren,sum(cofen) cofen,sum(pp) pp
       FROM public.%I WHERE empresa_id=$1 GROUP BY data,data_pagamento,uf,forma,ia) g',t) INTO grupos USING e;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE empresa_id=$1',t) INTO n USING e;
    EXECUTE format('SELECT coalesce(jsonb_agg(d ORDER BY data),''[]''::jsonb) FROM
      (SELECT c.data,c.importado_em,c.completo,(SELECT count(*) FROM public.%I a WHERE a.empresa_id=$1 AND a.data=c.data) quantidade
       FROM private.pp_relatorio_dias c WHERE c.empresa_id=$1 AND c.modalidade=$2) d',t) INTO dias USING e,m;
    SELECT max(importado_em) INTO ultima FROM private.pp_relatorio_dias WHERE empresa_id=e AND modalidade=m;
    RETURN jsonb_build_object('hoje',hoje,'quantidade',n,'grupos',grupos,'dias',dias,'ultimaImportacao',ultima,
      'primeiraImportacaoPendente',NOT EXISTS (SELECT 1 FROM private.pp_relatorio_controle_diario WHERE empresa_id=e AND modalidade=m AND dia=hoje));
  END IF;
  RAISE EXCEPTION 'Operação desconhecida.';
END;
$$;

-- Conferência (só leitura):
--   select pg_get_functiondef('private.pp_relatorio_operar(text,jsonb)'::regprocedure) ~ 'atualizados';
--   -- true
