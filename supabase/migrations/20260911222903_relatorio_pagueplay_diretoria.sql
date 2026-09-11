-- Relatórios da diretoria PaguePlay. Aplicação autorizada em 11/09/2026.
-- Valores inteiros em centavos; nenhuma divisão por percentual fixo.
CREATE SCHEMA IF NOT EXISTS private;

CREATE FUNCTION public.fn_pp_relatorio_acesso(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.fn_can_access_empresa(p_empresa)
    AND public.fn_user_tem('ver_painel_diretoria')
    AND public.fn_user_tem('painel_diretoria_escopo_todos_setores')
    AND EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa AND slug = 'pagueplay');
$$;
REVOKE ALL ON FUNCTION public.fn_pp_relatorio_acesso(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pp_relatorio_acesso(uuid) TO authenticated;

CREATE TABLE public.pp_relatorio_pagamentos (
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  id_baixa text NOT NULL CHECK (id_baixa ~ '^[0-9]+$'),
  data date NOT NULL,
  data_pagamento date NOT NULL,
  uf text NOT NULL CHECK (uf = ANY(string_to_array('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO', ' '))),
  acordo text NOT NULL CHECK (length(acordo) BETWEEN 1 AND 100),
  parcela text NOT NULL CHECK (length(parcela) BETWEEN 1 AND 100),
  forma text NOT NULL CHECK (length(forma) BETWEEN 1 AND 100),
  ia text NOT NULL CHECK (length(ia) <= 100),
  total bigint NOT NULL CHECK (abs(total::numeric) <= 9007199254740991),
  coren bigint NOT NULL CHECK (abs(coren::numeric) <= 9007199254740991),
  cofen bigint NOT NULL CHECK (abs(cofen::numeric) <= 9007199254740991),
  pp bigint NOT NULL CHECK (abs(pp::numeric) <= 9007199254740991),
  PRIMARY KEY (empresa_id, id_baixa)
);
CREATE TABLE public.pp_relatorio_conciliacoes (LIKE public.pp_relatorio_pagamentos INCLUDING ALL);
ALTER TABLE public.pp_relatorio_conciliacoes ADD FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);
CREATE INDEX ON public.pp_relatorio_pagamentos (empresa_id, data);
CREATE INDEX ON public.pp_relatorio_conciliacoes (empresa_id, data);
ALTER TABLE public.pp_relatorio_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_relatorio_conciliacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pp_relatorio_pagamentos, public.pp_relatorio_conciliacoes FROM anon, authenticated;
GRANT SELECT ON public.pp_relatorio_pagamentos, public.pp_relatorio_conciliacoes TO authenticated;
CREATE POLICY pp_pagamentos_leitura ON public.pp_relatorio_pagamentos FOR SELECT TO authenticated
  USING (public.fn_pp_relatorio_acesso(empresa_id));
CREATE POLICY pp_conciliacoes_leitura ON public.pp_relatorio_conciliacoes FOR SELECT TO authenticated
  USING (public.fn_pp_relatorio_acesso(empresa_id));

CREATE TABLE private.pp_relatorio_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  modalidade text NOT NULL CHECK (modalidade IN ('pagamento', 'conciliacao')),
  inicio date NOT NULL, fim date NOT NULL CHECK (fim >= inicio),
  arquivo text NOT NULL CHECK (length(arquivo) BETWEEN 1 AND 255),
  quantidade integer NOT NULL CHECK (quantidade > 0),
  totais jsonb NOT NULL,
  criado_por uuid NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz, resultado jsonb
);
CREATE INDEX ON private.pp_relatorio_lotes (empresa_id, modalidade, concluido_em);
CREATE TABLE private.pp_relatorio_linhas (
  lote_id uuid NOT NULL REFERENCES private.pp_relatorio_lotes(id) ON DELETE CASCADE,
  id_baixa text NOT NULL, dados jsonb NOT NULL,
  PRIMARY KEY(lote_id, id_baixa)
);
CREATE TABLE private.pp_relatorio_dias (
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  modalidade text NOT NULL CHECK (modalidade IN ('pagamento', 'conciliacao')),
  data date NOT NULL, importado_em timestamptz NOT NULL,
  completo boolean NOT NULL,
  PRIMARY KEY(empresa_id, modalidade, data)
);
CREATE TABLE private.pp_relatorio_controle_diario (
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  modalidade text NOT NULL CHECK (modalidade IN ('pagamento', 'conciliacao')),
  dia date NOT NULL, PRIMARY KEY(empresa_id, modalidade, dia)
);
REVOKE ALL ON private.pp_relatorio_lotes, private.pp_relatorio_linhas,
  private.pp_relatorio_dias, private.pp_relatorio_controle_diario FROM PUBLIC, anon, authenticated;

-- Único ponto de escrita. SECURITY DEFINER fica no schema não exposto e confere
-- identidade, empresa, permissão, modalidade e dono do lote em cada chamada.
CREATE FUNCTION private.pp_relatorio_operar(p_acao text, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e uuid; m text; t text; l private.pp_relatorio_lotes%ROWTYPE;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  inicio date; fim date; n integer; inseridos integer; soma jsonb; v_resultado jsonb;
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
    EXECUTE format('SELECT a.id_baixa FROM public.%I a JOIN private.pp_relatorio_linhas s ON s.id_baixa=a.id_baixa
      WHERE a.empresa_id=$1 AND s.lote_id=$2 AND (to_jsonb(a)-''empresa_id'') IS DISTINCT FROM s.dados LIMIT 1',t)
      INTO conflito USING e,l.id;
    IF conflito IS NOT NULL THEN RAISE EXCEPTION 'Id.Baixa % já salvo com dados diferentes. Confira o arquivo; para corrigir, exclua o mês correspondente e reimporte. Nada foi gravado.', conflito; END IF;
    EXECUTE format('INSERT INTO public.%I SELECT $1,r.* FROM private.pp_relatorio_linhas s
      CROSS JOIN LATERAL jsonb_to_record(s.dados) r(id_baixa text,data date,data_pagamento date,uf text,acordo text,parcela text,forma text,ia text,total bigint,coren bigint,cofen bigint,pp bigint)
      WHERE s.lote_id=$2 ON CONFLICT (empresa_id,id_baixa) DO NOTHING',t) USING e,l.id;
    GET DIAGNOSTICS inseridos = ROW_COUNT;
    -- Conferência do acumulado após inclusão: abortar em vez de perder precisão no JS.
    EXECUTE format('SELECT jsonb_build_object(''total'',sum(total),''coren'',sum(coren),''cofen'',sum(cofen),''pp'',sum(pp)) FROM public.%I WHERE empresa_id=$1',t) INTO soma USING e;
    IF EXISTS (SELECT 1 FROM jsonb_each_text(soma) v WHERE abs(v.value::numeric)>9007199254740991) THEN RAISE EXCEPTION 'Acumulado excede o limite de precisão.'; END IF;
    INSERT INTO private.pp_relatorio_dias
      SELECT e,m,d::date,now(),d::date<hoje FROM generate_series(l.inicio::timestamp,l.fim::timestamp,interval '1 day') d
      ON CONFLICT (empresa_id,modalidade,data) DO UPDATE SET importado_em=excluded.importado_em, completo=excluded.completo;
    IF l.fim=hoje AND l.inicio<=hoje-1 THEN
      INSERT INTO private.pp_relatorio_controle_diario VALUES(e,m,hoje) ON CONFLICT DO NOTHING;
    END IF;
    v_resultado := jsonb_build_object('inseridos',inseridos,'ignorados',n-inseridos);
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
REVOKE ALL ON FUNCTION private.pp_relatorio_operar(text,jsonb) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.pp_relatorio_operar(text,jsonb) TO authenticated;
CREATE FUNCTION public.fn_pp_relatorio(p_acao text, p_dados jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.pp_relatorio_operar(p_acao,p_dados);
$$;
REVOKE ALL ON FUNCTION public.fn_pp_relatorio(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pp_relatorio(text,jsonb) TO authenticated;
COMMENT ON TABLE public.pp_relatorio_pagamentos IS '945 de pagamento da diretoria: importação incremental por Id.Baixa, valores em centavos das colunas originais.';
COMMENT ON TABLE public.pp_relatorio_conciliacoes IS '945 de conciliação da diretoria: dados independentes de pagamento; o filtro de cartão é feito no ERP.';
