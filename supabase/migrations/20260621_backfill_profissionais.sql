-- ============================================================
-- Backfill: preenche campos vazios de acordos existentes com
-- dados da tabela profissionais (PaguePLAY — campo instituicao).
--
-- Só atualiza campos que estão NULL ou '' no acordo.
-- Não toca em acordos que já têm todos os campos preenchidos.
-- ============================================================

UPDATE public.acordos a
SET
  nome_cliente = CASE
    WHEN a.nome_cliente IS NULL OR a.nome_cliente = ''
    THEN p.nome
    ELSE a.nome_cliente
  END,
  whatsapp = CASE
    WHEN a.whatsapp IS NULL OR a.whatsapp = ''
    THEN p.telefone
    ELSE a.whatsapp
  END,
  estado_uf = CASE
    WHEN a.estado_uf IS NULL OR a.estado_uf = ''
    THEN p.estado_uf
    ELSE a.estado_uf
  END
FROM public.profissionais p
WHERE
  a.empresa_id  = p.empresa_id
  AND a.instituicao = p.codigo
  AND a.instituicao IS NOT NULL
  AND (
    a.nome_cliente IS NULL OR a.nome_cliente = '' OR
    a.whatsapp     IS NULL OR a.whatsapp     = '' OR
    a.estado_uf    IS NULL OR a.estado_uf    = ''
  );

-- Verificação: quantos acordos foram atualizados (estimativa por campos preenchidos)
SELECT
  COUNT(*) FILTER (WHERE a.nome_cliente IS NOT NULL AND a.nome_cliente <> '') AS acordos_com_nome,
  COUNT(*) FILTER (WHERE a.whatsapp     IS NOT NULL AND a.whatsapp     <> '') AS acordos_com_whatsapp,
  COUNT(*) FILTER (WHERE a.estado_uf    IS NOT NULL AND a.estado_uf    <> '') AS acordos_com_estado,
  COUNT(*) AS total_acordos_com_instituicao
FROM public.acordos a
INNER JOIN public.profissionais p
  ON a.empresa_id = p.empresa_id AND a.instituicao = p.codigo
WHERE a.instituicao IS NOT NULL;
