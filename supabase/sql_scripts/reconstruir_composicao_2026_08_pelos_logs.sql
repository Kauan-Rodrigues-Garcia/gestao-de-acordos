-- ═══════════════════════════════════════════════════════════════════════════
-- Reconstrói o retrato de AGOSTO/2026 como as equipes estavam em 31/08
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Rodar UMA vez. Não é migration: é reparo de dado, e o alvo é um mês só.
--
-- ## Por que existe
--
-- `fn_composicao_mes_snapshot` era DELETE + INSERT do mês inteiro a partir das
-- tabelas de HOJE, e a importação do analítico a chamava com o mês do arquivo
-- (ver `20260903330000`, que fechou esse buraco). Resultado: o retrato de
-- 2026-08 foi reescrito ao longo do dia 01/09 e guardou a configuração daquele
-- dia, não a de 31/08.
--
-- Última reescrita: BOOKPLAY 01/09 18:53 UTC, PAGUEPLAY 01/09 12:25 UTC.
--
-- ## De onde sai a verdade
--
-- De `logs_sistema`. Os gatilhos `fn_log_auditoria` gravam `antes`/`depois` em
-- `perfis`, `equipes`, `setores`, `equipe_lideres` e `equipe_operadores_clones`
-- desde 12/08 — antes do alvo, portanto a cobertura é completa. `antes` guarda
-- só os campos que mudaram, o que é exatamente o necessário: o valor de um campo
-- em 31/08 é o `antes` da PRIMEIRA alteração posterior; sem alteração posterior,
-- é o valor de hoje.
--
-- São 237 mudanças a desfazer entre 01/09 03:00 UTC e agora.
--
-- ## O instante alvo
--
-- 2026-09-01 03:00:00+00 = 31/08 às 23:59:59 em São Paulo. É o fim do dia 31,
-- e é dez minutos depois do horário em que o cron tirava a foto boa (23:50).
--
-- ## O que muda (medido antes de escrever)
--
-- PAGUEPLAY: nada. As 42 pessoas e as equipes já estão como estavam.
--
-- BOOKPLAY, 252 pessoas:
--   • 8 em equipe errada — Amauri, Brenda Ferreira, Brunno Piccolo, Elisandra
--     Raquel, João Santos, Luana Nascimento, Marcos Junior, Rafaela Brumati;
--   • 2 com situação errada — Fernanda Paliotta (era `desligado`, está `ferias`)
--     e Maria Mazziero (era `ativo`, está `desligado`);
--   • 9 com a lista de clones errada, o que move recebimento de card;
--   • 16 com o nome da equipe errado;
--   • equipe "Brunno Digital" existia em 31/08 e sumiu do retrato;
--   • "Marília Digital" e "Play Mix Marília" estão no retrato de agosto sem
--     terem existido em 31/08 — nasceram em setembro;
--   • "Digital Amauri - Play 5" está gravada com o nome de setembro.
--
-- ## Segurança
--
-- As linhas atuais são copiadas para `composicao_mes_backup_2026_08` e
-- `composicao_mes_equipe_backup_2026_08` ANTES de qualquer DELETE, e o backup
-- FICA depois que o script termina — é por ele que se desfaz isto.
--
-- A reconstrução vai para duas tabelas de apoio (`recon_2026_08_*`) em vez de
-- direto no destino, de propósito: assim ela pode ser CONFERIDA com o retrato
-- antigo ainda de pé, e o DELETE só acontece depois. As tabelas de apoio são
-- reais, não temporárias, para sobreviverem entre as etapas.
--
-- Antes do DELETE há uma trava de contagem: 252 BookPlay + 42 PaguePlay. Fora
-- disso levanta exceção — melhor não gravar nada que gravar um mês inventado.

-- ── Rede de segurança ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.composicao_mes_backup_2026_08;
DROP TABLE IF EXISTS public.composicao_mes_equipe_backup_2026_08;

CREATE TABLE public.composicao_mes_backup_2026_08 AS
  SELECT * FROM public.composicao_mes WHERE mes = '2026-08';
CREATE TABLE public.composicao_mes_equipe_backup_2026_08 AS
  SELECT * FROM public.composicao_mes_equipe WHERE mes = '2026-08';

-- ── A reconstrução ──────────────────────────────────────────────────────────
CREATE TABLE public.recon_2026_08_pessoas AS
WITH t AS (SELECT TIMESTAMPTZ '2026-09-01 03:00:00+00' AS quando),

-- Valor de cada campo de `perfis` em 31/08: o `antes` da primeira alteração
-- posterior ao alvo; na ausência dela, o valor de hoje.
mud AS (
  SELECT l.registro_id::uuid AS id, l.antes, l.criado_em
    FROM public.logs_sistema l, t
   WHERE l.tabela = 'perfis' AND l.criado_em > t.quando AND l.antes IS NOT NULL
),
val AS (
  SELECT DISTINCT ON (m.id, k) m.id, k AS campo, m.antes->k AS valor
    FROM mud m CROSS JOIN LATERAL jsonb_object_keys(m.antes) k
   ORDER BY m.id, k, m.criado_em
),
-- Quem nasceu depois não existia em 31/08. Ninguém foi excluído depois do
-- alvo (a última exclusão é de 31/08 17:49 SP), então não há quem ressuscitar.
nasc AS (
  SELECT l.registro_id::uuid AS id FROM public.logs_sistema l, t
   WHERE l.tabela = 'perfis' AND l.acao = 'usuario_criado' AND l.criado_em > t.quando
),
perfis31 AS (
  SELECT p.id,
    (COALESCE((SELECT valor FROM val v WHERE v.id=p.id AND v.campo='empresa_id'), to_jsonb(p.empresa_id))#>>'{}')::uuid AS empresa_id,
    (COALESCE((SELECT valor FROM val v WHERE v.id=p.id AND v.campo='equipe_id'),  to_jsonb(p.equipe_id)) #>>'{}')::uuid AS equipe_id,
    (COALESCE((SELECT valor FROM val v WHERE v.id=p.id AND v.campo='setor_id'),   to_jsonb(p.setor_id))  #>>'{}')::uuid AS setor_id,
     COALESCE((SELECT valor FROM val v WHERE v.id=p.id AND v.campo='perfil'),     to_jsonb(p.perfil))    #>>'{}'        AS perfil,
     COALESCE(COALESCE((SELECT valor FROM val v WHERE v.id=p.id AND v.campo='situacao'), to_jsonb(p.situacao))#>>'{}', 'ativo') AS situacao
    FROM public.perfis p
   WHERE p.id NOT IN (SELECT id FROM nasc)
),

-- Equipes: nome e setor revertidos; as criadas depois saem, as apagadas depois
-- voltam (o `antes` do DELETE traz a linha inteira).
mud_eq AS (
  SELECT l.registro_id::uuid AS id, l.antes, l.criado_em FROM public.logs_sistema l, t
   WHERE l.tabela='equipes' AND l.acao='equipe_alterado' AND l.criado_em > t.quando
),
val_eq AS (
  SELECT DISTINCT ON (m.id, k) m.id, k AS campo, m.antes->k AS valor
    FROM mud_eq m CROSS JOIN LATERAL jsonb_object_keys(m.antes) k
   ORDER BY m.id, k, m.criado_em
),
eq_nasc AS (
  SELECT l.registro_id::uuid AS id FROM public.logs_sistema l, t
   WHERE l.tabela='equipes' AND l.acao='equipe_criado' AND l.criado_em > t.quando
),
equipes31 AS (
  SELECT e.id, e.empresa_id,
    COALESCE((SELECT valor FROM val_eq v WHERE v.id=e.id AND v.campo='nome'), to_jsonb(e.nome))#>>'{}' AS nome,
    (COALESCE((SELECT valor FROM val_eq v WHERE v.id=e.id AND v.campo='setor_id'), to_jsonb(e.setor_id))#>>'{}')::uuid AS setor_id
    FROM public.equipes e WHERE e.id NOT IN (SELECT id FROM eq_nasc)
  UNION ALL
  SELECT (l.antes->>'id')::uuid, (l.antes->>'empresa_id')::uuid, l.antes->>'nome', (l.antes->>'setor_id')::uuid
    FROM public.logs_sistema l, t
   WHERE l.tabela='equipes' AND l.acao='equipe_excluido' AND l.criado_em > t.quando
),

-- Liderança: as criadas depois saem, as removidas depois voltam.
lid_nasc AS (
  SELECT l.registro_id::uuid AS id FROM public.logs_sistema l, t
   WHERE l.tabela='equipe_lideres' AND l.acao='equipe_lideranca_criado' AND l.criado_em > t.quando
),
lideres31 AS (
  SELECT el.equipe_id, el.lider_id FROM public.equipe_lideres el
   WHERE el.id NOT IN (SELECT id FROM lid_nasc)
  UNION
  SELECT (l.antes->>'equipe_id')::uuid, (l.antes->>'lider_id')::uuid
    FROM public.logs_sistema l, t
   WHERE l.tabela='equipe_lideres' AND l.acao='equipe_lideranca_excluido' AND l.criado_em > t.quando
),
-- Só quem liderava UMA equipe: quem comandava três não tem "a sua equipe", e
-- creditar as três contaria o mesmo dinheiro três vezes. Mesma regra da
-- `fn_composicao_mes_snapshot`. Em agosto isso vale para Amauri (4 equipes) e
-- Rafaela Brumati (2), que ficam sem equipe e contam só no setor.
lider_unico AS (
  SELECT lider_id, min(equipe_id::text)::uuid AS equipe_id
    FROM lideres31 GROUP BY lider_id HAVING count(DISTINCT equipe_id) = 1
),

-- Clones: idem, com `conta_recebimento` revertido.
cl_nasc AS (
  SELECT l.registro_id::uuid AS id FROM public.logs_sistema l, t
   WHERE l.tabela='equipe_operadores_clones' AND l.acao='equipe_clone_criado' AND l.criado_em > t.quando
),
cl_mud AS (
  SELECT DISTINCT ON (l.registro_id) l.registro_id::uuid AS id, l.antes->'conta_recebimento' AS cr
    FROM public.logs_sistema l, t
   WHERE l.tabela='equipe_operadores_clones' AND l.acao='equipe_clone_alterado' AND l.criado_em > t.quando
   ORDER BY l.registro_id, l.criado_em
),
clones31 AS (
  SELECT c.empresa_id, c.operador_id, c.equipe_id,
         COALESCE(cm.cr, to_jsonb(c.conta_recebimento))#>>'{}' = 'true' AS conta
    FROM public.equipe_operadores_clones c LEFT JOIN cl_mud cm ON cm.id = c.id
   WHERE c.id NOT IN (SELECT id FROM cl_nasc)
  UNION
  SELECT (l.antes->>'empresa_id')::uuid, (l.antes->>'operador_id')::uuid, (l.antes->>'equipe_id')::uuid,
         COALESCE(l.antes->>'conta_recebimento', 'true') = 'true'
    FROM public.logs_sistema l, t
   WHERE l.tabela='equipe_operadores_clones' AND l.acao='equipe_clone_excluido' AND l.criado_em > t.quando
),
clones_por_pessoa AS (
  SELECT empresa_id, operador_id,
         COALESCE(array_agg(equipe_id ORDER BY equipe_id) FILTER (WHERE conta), '{}'::uuid[]) AS equipes
    FROM clones31 GROUP BY empresa_id, operador_id
)
SELECT p.empresa_id,
       p.id AS operador_id,
       -- A mesma precedência de `fn_composicao_mes_snapshot`: cargo `lider`
       -- segue a equipe que lidera, o resto segue o cadastro. Conferido: em
       -- agosto nenhuma das duas leituras dá resultado diferente da outra.
       CASE WHEN p.perfil = 'lider' THEN COALESCE(lu.equipe_id, p.equipe_id)
            ELSE COALESCE(p.equipe_id, lu.equipe_id) END AS equipe_id,
       p.setor_id AS setor_pessoa,
       p.situacao,
       COALESCE(cl.equipes, '{}'::uuid[]) AS equipes_clone
  FROM perfis31 p
  LEFT JOIN lider_unico lu ON lu.lider_id = p.id
  LEFT JOIN clones_por_pessoa cl ON cl.empresa_id = p.empresa_id AND cl.operador_id = p.id;

CREATE TABLE public.recon_2026_08_equipes AS
WITH t AS (SELECT TIMESTAMPTZ '2026-09-01 03:00:00+00' AS quando),
mud_eq AS (
  SELECT l.registro_id::uuid AS id, l.antes, l.criado_em FROM public.logs_sistema l, t
   WHERE l.tabela='equipes' AND l.acao='equipe_alterado' AND l.criado_em > t.quando
),
val_eq AS (
  SELECT DISTINCT ON (m.id, k) m.id, k AS campo, m.antes->k AS valor
    FROM mud_eq m CROSS JOIN LATERAL jsonb_object_keys(m.antes) k
   ORDER BY m.id, k, m.criado_em
),
eq_nasc AS (
  SELECT l.registro_id::uuid AS id FROM public.logs_sistema l, t
   WHERE l.tabela='equipes' AND l.acao='equipe_criado' AND l.criado_em > t.quando
)
SELECT e.id, e.empresa_id,
  COALESCE((SELECT valor FROM val_eq v WHERE v.id=e.id AND v.campo='nome'), to_jsonb(e.nome))#>>'{}' AS nome,
  (COALESCE((SELECT valor FROM val_eq v WHERE v.id=e.id AND v.campo='setor_id'), to_jsonb(e.setor_id))#>>'{}')::uuid AS setor_id
  FROM public.equipes e WHERE e.id NOT IN (SELECT id FROM eq_nasc)
UNION ALL
SELECT (l.antes->>'id')::uuid, (l.antes->>'empresa_id')::uuid, l.antes->>'nome', (l.antes->>'setor_id')::uuid
  FROM public.logs_sistema l, t
 WHERE l.tabela='equipes' AND l.acao='equipe_excluido' AND l.criado_em > t.quando;

-- ── Conferência ANTES de apagar ─────────────────────────────────────────────
DO $$
DECLARE v_book INTEGER; v_pague INTEGER;
BEGIN
  SELECT count(*) INTO v_book  FROM public.recon_2026_08_pessoas r
    JOIN public.empresas e ON e.id = r.empresa_id WHERE e.nome = 'BOOKPLAY';
  SELECT count(*) INTO v_pague FROM public.recon_2026_08_pessoas r
    JOIN public.empresas e ON e.id = r.empresa_id WHERE e.nome = 'PAGUEPLAY';

  -- Os números medidos na análise. Divergência = o replay mudou de resultado,
  -- e nesse caso é melhor não gravar nada do que gravar um mês inventado.
  IF v_book <> 252 OR v_pague <> 42 THEN
    RAISE EXCEPTION 'Reconstrucao inesperada: BOOKPLAY=% (esperado 252), PAGUEPLAY=% (esperado 42)',
      v_book, v_pague;
  END IF;
END $$;

-- ── A troca ─────────────────────────────────────────────────────────────────
DELETE FROM public.composicao_mes        WHERE mes = '2026-08';
DELETE FROM public.composicao_mes_equipe WHERE mes = '2026-08';

-- Só as empresas que TINHAM retrato de agosto. `public.recon_2026_08_equipes` cobre a base
-- inteira, e sem este recorte as empresas sem operação (RH, COMERCIAL) ganhariam
-- linhas de um mês em que nunca tiveram retrato nenhum.
INSERT INTO public.composicao_mes_equipe (empresa_id, mes, equipe_id, nome, setor_id)
SELECT re.empresa_id, '2026-08', re.id, re.nome, re.setor_id
  FROM public.recon_2026_08_equipes re
 WHERE re.empresa_id IN (SELECT DISTINCT empresa_id FROM public.composicao_mes_backup_2026_08);

INSERT INTO public.composicao_mes
  (empresa_id, mes, operador_id, equipe_id, equipe_nome, setor_id, situacao, equipes_clone)
SELECT r.empresa_id, '2026-08', r.operador_id, r.equipe_id,
       COALESCE(re.nome, 'Sem equipe'),
       -- Mesma precedência do snapshot: o setor é o da EQUIPE; quem não tem
       -- equipe usa o setor do próprio perfil.
       COALESCE(re.setor_id, r.setor_pessoa),
       r.situacao, r.equipes_clone
  FROM public.recon_2026_08_pessoas r
  LEFT JOIN public.recon_2026_08_equipes re ON re.id = r.equipe_id
 WHERE r.empresa_id IN (SELECT DISTINCT empresa_id FROM public.composicao_mes_backup_2026_08);

-- ── Auditoria ───────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT empresa_id, count(*) AS n FROM public.composicao_mes
            WHERE mes='2026-08' GROUP BY empresa_id
  LOOP
    PERFORM public.fn_log_registrar(
      p_acao       => 'composicao_mes_reconstruido',
      p_categoria  => 'importacao',
      p_severidade => 'aviso',
      p_descricao  => format(
        'Retrato de 2026-08 reconstruido pelos logs, no estado de 31/08 23:59 — %s pessoa(s)', r.n),
      p_empresa_id => r.empresa_id,
      p_tabela     => 'composicao_mes',
      p_alvo_tipo  => 'composicao_mes',
      p_alvo_rotulo=> '2026-08',
      p_detalhes   => jsonb_build_object(
        'mes', '2026-08',
        'instante_alvo', '2026-09-01T03:00:00+00',
        'fonte', 'logs_sistema (antes/depois)',
        'pessoas', r.n,
        'backup', 'composicao_mes_backup_2026_08'
      ),
      p_origem     => 'manual'
    );
  END LOOP;
END $$;

-- As tabelas de apoio saem no fim; o backup FICA.
DROP TABLE IF EXISTS public.recon_2026_08_pessoas;
DROP TABLE IF EXISTS public.recon_2026_08_equipes;
