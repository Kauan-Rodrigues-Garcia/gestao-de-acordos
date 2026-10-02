-- ============================================================================
-- Comercial (Vendas Bookplay) — metas de outubro/2026
-- ============================================================================
--
-- Pedido de 02/10/2026:
--   Setor: 168 vendas e R$ 1.003.968,00 — régua QUANTIDADE (decide pelas 168;
--          o faturamento fica gravado como informação).
--   14 operadores: 12 vendas cada, régua quantidade.
--   Sayara: férias de 05/10 a 15/10, meta não definida — fica de fora.
--
-- A meta individual só aparece na tela depois da migration
-- 20261002120000_vendas_meta_individual.sql; sem ela, as linhas ficam gravadas
-- e o painel segue dividindo a meta do time por pessoa (que dá os mesmos 12).
--
-- A planilha traz NOMES, não usuários. Cada um é achado no Comercial, sem
-- diferenciar maiúscula nem acento, pelo começo do nome
-- («FELIPE» = «Felipe …») ou do usuário com «_» lido como espaço
-- («BEATRIZ SANCHEZ» = beatriz_sanchez). Fora: robôs e desligados.
-- Precisa achar UMA pessoa por nome; com zero ou mais de uma, não grava nada e
-- a mensagem lista os candidatos (usuário — nome) para escolher.
--
-- Vínculos dados pelo usuário após a 1ª tentativa (o nome não achou ninguém),
-- casados pelo usuário exato: CARINA RUSSI = carina_pos,
-- MARIA CECILIA = cecilia_martins, KARINA BRITO = karina_bookplay,
-- LUIS FERNANDO = luis_pos.
--
-- Reexecutável: rodar de novo regrava os mesmos valores.
-- ============================================================================

BEGIN;

DO $metas$
DECLARE
  c_empresa CONSTANT UUID    := '9efd4fee-2a26-4049-b146-921a6046e54a';
  c_setor   CONSTANT UUID    := '58b170fc-f579-4727-a917-fa1fde2c3269';
  c_ano     CONSTANT INTEGER := 2026;
  c_mes     CONSTANT INTEGER := 10;
  c_setor_qtd   CONSTANT INTEGER := 168;
  c_setor_valor CONSTANT NUMERIC := 1003968.00;
  c_op_qtd      CONSTANT INTEGER := 12;

  c_nomes CONSTANT TEXT[] := ARRAY[
    'BEATRIZ SANCHEZ', 'CARINA RUSSI', 'MARIA CECILIA', 'CRISTIANE', 'FELIPE',
    'GABRIELLY NASC', 'KARINA BRITO', 'LARISSA AMARAL', 'LUIS FERNANDO',
    'MARY TURCATO', 'OLIVIA', 'POLIANA', 'RAFAELA', 'SARAH'
  ];
  -- nome da planilha → usuário exato (vence a busca pelo nome)
  c_vinculos CONSTANT JSONB := $json${
    "CARINA RUSSI":  "carina_pos",
    "MARIA CECILIA": "cecilia_martins",
    "KARINA BRITO":  "karina_bookplay",
    "LUIS FERNANDO": "luis_pos"
  }$json$;
  c_com_acento CONSTANT TEXT := 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
  c_sem_acento CONSTANT TEXT := 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC';

  v_nome     TEXT;
  v_chave    TEXT;
  v_ids      UUID[];
  v_lista    TEXT;
  v_erros    TEXT[] := '{}';
  v_achados  UUID[] := '{}';
  v_id       UUID;
  v_conferem INTEGER;
BEGIN
  -- 1. Achar cada pessoa pelo começo do nome ou do usuário.
  FOREACH v_nome IN ARRAY c_nomes LOOP
    v_chave := lower(translate(btrim(v_nome), c_com_acento, c_sem_acento));

    IF c_vinculos ? v_nome THEN
      SELECT array_agg(p.id ORDER BY p.nome) INTO v_ids
        FROM public.perfis p
       WHERE p.empresa_id = c_empresa
         AND NOT p.robo
         AND p.situacao <> 'desligado'
         AND lower(btrim(p.usuario)) = lower(c_vinculos->>v_nome);
    ELSE
    SELECT array_agg(p.id ORDER BY p.nome) INTO v_ids
      FROM public.perfis p
     WHERE p.empresa_id = c_empresa
       AND NOT p.robo
       AND p.situacao <> 'desligado'
       AND (
             lower(translate(btrim(p.nome), c_com_acento, c_sem_acento)) || ' '
               LIKE v_chave || ' %'
          OR lower(translate(btrim(p.nome), c_com_acento, c_sem_acento)) || ' '
               LIKE v_chave || '%'
             AND position(' ' IN v_chave) > 0
          OR replace(lower(btrim(coalesce(p.usuario, ''))), '_', ' ') || ' '
               LIKE v_chave || ' %'
       );
    END IF;

    IF v_ids IS NULL THEN
      v_erros := v_erros || format('%s: ninguém no Comercial%s', v_nome,
        CASE WHEN c_vinculos ? v_nome
             THEN format(' com o usuário %s (ativo, não robô)', c_vinculos->>v_nome) ELSE '' END);
    ELSIF cardinality(v_ids) > 1 THEN
      SELECT string_agg(coalesce(p.usuario, '(sem usuário)') || ' — ' || p.nome, ', ' ORDER BY p.nome)
        INTO v_lista FROM public.perfis p WHERE p.id = ANY (v_ids);
      v_erros := v_erros || format('%s: %s candidatos (%s)', v_nome, cardinality(v_ids), v_lista);
    ELSIF v_ids[1] = ANY (v_achados) THEN
      v_erros := v_erros || format('%s: mesma pessoa de outro nome da lista', v_nome);
    ELSE
      v_achados := v_achados || v_ids[1];
    END IF;
  END LOOP;

  IF cardinality(v_erros) > 0 THEN
    RAISE EXCEPTION 'Nada gravado. Corrigir: %', array_to_string(v_erros, '; ');
  END IF;

  -- 2. Setor: 168 vendas decidem; o faturamento vai junto.
  INSERT INTO public.metas
    (tipo, referencia_id, empresa_id, meta_acordos, meta_valor, regua, mes, ano)
  VALUES
    ('setor', c_setor, c_empresa, c_setor_qtd, c_setor_valor, 'quantidade', c_mes, c_ano)
  ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
     SET meta_acordos = EXCLUDED.meta_acordos,
         meta_valor   = EXCLUDED.meta_valor,
         regua        = EXCLUDED.regua,
         updated_at   = NOW();

  -- 3. Operadores: 12 vendas, régua quantidade, sem meta em valor.
  FOREACH v_id IN ARRAY v_achados LOOP
    INSERT INTO public.metas
      (tipo, referencia_id, empresa_id, meta_acordos, meta_valor, regua, mes, ano)
    VALUES
      ('operador', v_id, c_empresa, c_op_qtd, 0, 'quantidade', c_mes, c_ano)
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
       SET meta_acordos = EXCLUDED.meta_acordos,
           meta_valor   = EXCLUDED.meta_valor,
           regua        = EXCLUDED.regua,
           updated_at   = NOW();
  END LOOP;

  -- 4. Prova: setor + 14 operadores com os valores pedidos.
  SELECT count(*) INTO v_conferem
    FROM public.metas m
   WHERE m.empresa_id = c_empresa AND m.ano = c_ano AND m.mes = c_mes
     AND m.regua = 'quantidade'
     AND ((m.tipo = 'setor' AND m.referencia_id = c_setor
           AND m.meta_acordos = c_setor_qtd AND m.meta_valor = c_setor_valor)
       OR (m.tipo = 'operador' AND m.referencia_id = ANY (v_achados)
           AND m.meta_acordos = c_op_qtd));
  IF v_conferem <> cardinality(c_nomes) + 1 THEN
    RAISE EXCEPTION 'Esperadas % linhas, conferem %.', cardinality(c_nomes) + 1, v_conferem;
  END IF;
END
$metas$;

COMMIT;

-- Conferência na tela do SQL Editor: quem ficou com qual meta em outubro.
SELECT m.tipo, coalesce(p.usuario, s.nome) AS usuario, coalesce(p.nome, s.nome) AS nome,
       e.nome AS equipe, m.regua, m.meta_acordos AS vendas, m.meta_valor AS faturamento
  FROM public.metas m
  LEFT JOIN public.perfis  p ON m.tipo = 'operador' AND p.id = m.referencia_id
  LEFT JOIN public.equipes e ON e.id = p.equipe_id
  LEFT JOIN public.setores s ON m.tipo = 'setor' AND s.id = m.referencia_id
 WHERE m.empresa_id = '9efd4fee-2a26-4049-b146-921a6046e54a'
   AND m.tipo IN ('setor', 'operador')
   AND m.ano = 2026 AND m.mes = 10
 ORDER BY m.tipo DESC, p.nome;
