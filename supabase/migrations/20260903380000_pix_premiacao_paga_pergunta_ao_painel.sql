-- ═══════════════════════════════════════════════════════════════════════════
-- Pix: marcar a premiação como paga passa a perguntar ao painel
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `fn_pix_premiacao_marcar_pagamento` decidia por CARGO:
--
--   fn_user_has_any_role(array['gerencia','diretoria','administrador','super_admin'])
--
-- e a tela repetia a mesma decisão do seu lado
-- (`PERFIL_NIVEL[cargo] >= PERFIL_NIVEL.gerencia`, em `PixAutomatico.tsx`).
-- Duas listas de cargo escritas em código para a mesma pergunta, nenhuma
-- configurável: promover alguém a «paga a premiação» exigia um deploy.
--
-- É exatamente o que a regra de 23/08/2026 proíbe — o painel é a autoridade
-- única — e o que a guarda `painel-manda.test.ts` acusava desde 31/08.
--
-- ## Por que os dois lados na mesma migration
--
-- Converter só a tela produziria o defeito completo, e não meio defeito: a
-- chave ligada mostraria o botão, e a RPC recusaria com
-- «somente a gerência ou cargo superior pode alterar». Ligar e não acontecer
-- nada é a queixa original, não a correção dela.
--
-- ## O que NÃO muda
--
-- Quem podia antes continua podendo. `padrao` é gerência + diretoria, que é o
-- mesmo conjunto de `>= PERFIL_NIVEL.gerencia` entre os cargos configuráveis, e
-- administrador/super_admin seguem passando por `fn_user_tem`, que lhes concede
-- tudo que não exige concessão nominal.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A chave entra no catálogo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Por acumulação, como as anteriores: a função nova soma um `VALUES` ao
-- resultado da atual, que é renomeada. Reescrever o catálogo inteiro seria
-- copiar quarenta linhas para acrescentar uma.

ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_premiacao_20260903;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_premiacao_20260903()
  UNION ALL
  SELECT * FROM (VALUES
    -- `padrao` = gerência e diretoria: o mesmo alcance de
    -- `>= PERFIL_NIVEL.gerencia` entre os cargos que o painel configura.
    ('pix_marcar_premiacao_paga', ARRAY['bookplay']::TEXT[],
     ARRAY['gerencia','diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

REVOKE ALL ON FUNCTION public.fn_permissoes_catalogo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_permissoes_catalogo() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao de 20260903 acrescenta '
  'pix_marcar_premiacao_paga sem reescrever o catalogo anterior.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Semeadura: as empresas de hoje recebem o estado de hoje
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `fn_user_tem` trata chave AUSENTE como negada. Sem este passo, a migration
-- tiraria da gerência uma coisa que ela já fazia — e o sintoma seria idêntico
-- ao defeito que ela veio corrigir.
--
-- Escrito por extenso nos dois sentidos, e não só onde é `TRUE`: cartão em
-- branco no painel («ausente») não distingue «é não» de «ninguém decidiu
-- ainda», e essa dúvida sobra para quem for configurar depois.

UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('pix_marcar_premiacao_paga', TRUE)
 WHERE cargo IN ('gerencia', 'diretoria')
   AND NOT (permissoes ? 'pix_marcar_premiacao_paga');

UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('pix_marcar_premiacao_paga', FALSE)
 WHERE cargo NOT IN ('gerencia', 'diretoria')
   AND NOT (permissoes ? 'pix_marcar_premiacao_paga');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A RPC troca o cargo pela chave
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só o bloco de autorização muda. O resto do corpo — validação de mês, de
-- valor, o `on conflict` e a trilha de quem marcou — fica letra por letra como
-- está, porque não é o que esta migration veio discutir.
--
-- A arity de 4 argumentos continua delegando para esta e não é tocada.

CREATE OR REPLACE FUNCTION public.fn_pix_premiacao_marcar_pagamento(
  p_empresa_id uuid,
  p_operador_id uuid,
  p_mes date,
  p_pago boolean,
  p_valor_pago numeric
)
RETURNS public.pix_automatico_premiacoes_pagamento
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_autor uuid := auth.uid();
  v_autor_nome text;
  v_operador_nome text;
  v_valor numeric(12,2);
  v_resultado public.pix_automatico_premiacoes_pagamento;
begin
  if v_autor is null then
    raise exception 'PIX_PREMIACAO_SEM_SESSAO: entre novamente no sistema.'
      using errcode = '42501';
  end if;

  if not public.fn_can_access_empresa(p_empresa_id) then
    raise exception 'PIX_PREMIACAO_EMPRESA: esta empresa não está no seu acesso.'
      using errcode = '42501';
  end if;

  -- Era fn_user_has_any_role(['gerencia','diretoria','administrador','super_admin']).
  -- O par com o escopo repete o que a tela pede, e pelo mesmo motivo: a
  -- premiação marcada é de OUTRA pessoa. `fn_user_escopo('pix') >= 2` é
  -- «enxergo o setor», a mesma régua da policy de SELECT desta tabela.
  if not (public.fn_user_tem('pix_marcar_premiacao_paga')
          and public.fn_user_escopo('pix') >= 2) then
    raise exception 'PIX_PREMIACAO_SEM_PERMISSAO: seu cargo não tem a permissão de marcar premiação como paga.'
      using errcode = '42501';
  end if;

  if p_mes is null or p_mes <> date_trunc('month', p_mes)::date then
    raise exception 'PIX_PREMIACAO_MES: informe o primeiro dia do mês.'
      using errcode = 'check_violation';
  end if;

  -- Valor negativo é sempre erro de quem chamou: "já saiu mais do que era
  -- devido" é caso do saldo de divergência, não de um pagamento negativo.
  if p_valor_pago is not null and p_valor_pago < 0 then
    raise exception 'PIX_PREMIACAO_VALOR: o valor pago não pode ser negativo.'
      using errcode = 'check_violation';
  end if;

  v_valor := case when p_pago then round(p_valor_pago, 2) else null end;

  select nullif(trim(p.nome), '')
    into v_operador_nome
    from public.perfis p
   where p.id = p_operador_id
     and p.empresa_id = p_empresa_id;

  if v_operador_nome is null then
    raise exception 'PIX_PREMIACAO_OPERADOR: pessoa não encontrada nesta empresa.'
      using errcode = 'check_violation';
  end if;

  select coalesce(nullif(trim(p.nome), ''), p.email, 'Gerência')
    into v_autor_nome
    from public.perfis p
   where p.id = v_autor;

  insert into public.pix_automatico_premiacoes_pagamento (
    empresa_id, operador_id, operador_nome, mes, pago, valor_pago,
    pago_em, pago_por, pago_por_nome,
    atualizado_em, atualizado_por, atualizado_por_nome
  ) values (
    p_empresa_id, p_operador_id, v_operador_nome, p_mes, p_pago, v_valor,
    case when p_pago then now() else null end,
    case when p_pago then v_autor else null end,
    case when p_pago then v_autor_nome else null end,
    now(), v_autor, v_autor_nome
  )
  on conflict (empresa_id, operador_id, mes) do update set
    operador_nome = excluded.operador_nome,
    pago = excluded.pago,
    valor_pago = excluded.valor_pago,
    pago_em = excluded.pago_em,
    pago_por = excluded.pago_por,
    pago_por_nome = excluded.pago_por_nome,
    atualizado_em = excluded.atualizado_em,
    atualizado_por = excluded.atualizado_por,
    atualizado_por_nome = excluded.atualizado_por_nome
  returning * into v_resultado;

  return v_resultado;
end
$function$;

COMMENT ON FUNCTION public.fn_pix_premiacao_marcar_pagamento(uuid, uuid, date, boolean, numeric) IS
  'Marca a premiacao do mes como paga e grava quanto saiu. Autorizacao pelo '
  'painel (pix_marcar_premiacao_paga) mais alcance de setor no Pix — nao mais '
  'por cargo.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Conferência
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O catálogo é encadeado: se o rename ou o UNION saírem errados, ele devolve
-- uma lista curta e as empresas novas nascem sem metade das chaves. Falhar
-- aqui é melhor do que descobrir isso no cadastro da próxima empresa.

DO $$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.fn_permissoes_catalogo();
  IF v_total < 30 THEN
    RAISE EXCEPTION 'catalogo voltou so % chaves — o encadeamento quebrou', v_total;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo()
                  WHERE chave = 'pix_marcar_premiacao_paga') THEN
    RAISE EXCEPTION 'pix_marcar_premiacao_paga nao entrou no catalogo';
  END IF;

  IF EXISTS (SELECT 1 FROM public.cargos_permissoes
              WHERE NOT (permissoes ? 'pix_marcar_premiacao_paga')) THEN
    RAISE EXCEPTION 'sobrou cargo sem a chave semeada — fn_user_tem leria ausente como negado';
  END IF;
END $$;
