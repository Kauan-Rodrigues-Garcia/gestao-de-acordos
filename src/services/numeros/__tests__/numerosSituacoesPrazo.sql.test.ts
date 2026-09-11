/**
 * Situações com tempo — as garantias da migration 20260911170000, conferidas no SQL.
 *
 * Quem cumpre «o prazo nasce no banco», «o aviso sai uma vez» e «a restrição exige
 * o tempo» é o Postgres. O que dá para provar aqui é que as regras ESTÃO ESCRITAS.
 * Mesmo recurso de `numerosLixeira.sql.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');

function migration(sufixo: string): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith(sufixo));
  expect(arquivo, `migration *${sufixo} não encontrada`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

function corpoDaFuncao(sql: string, nome: string): string {
  const i = sql.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = sql.indexOf('$function$;', i);
  expect(fim, `função ${nome} sem fechamento`).toBeGreaterThan(i);
  return sql.slice(i, fim);
}

function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const SQL    = migration('_numeros_situacoes_com_prazo.sql');
const CODIGO = semComentarios(SQL);
const corpo  = (nome: string) => semComentarios(corpoDaFuncao(SQL, nome));

describe('as situações', () => {
  it('o CHECK tem as três de antes e as quatro novas', () => {
    const inicio = CODIGO.indexOf('ADD CONSTRAINT numeros_whatsapp_situacao_check');
    expect(inicio).toBeGreaterThan(-1);
    const check = CODIGO.slice(inicio, CODIGO.indexOf(';', inicio));
    for (const s of [
      'em_aquecimento', 'ativo', 'banido',
      'aguardando_12h', 'aguardando_24h', 'movimentando_proxy', 'em_restricao',
    ]) {
      expect(check, s).toContain(`'${s}'`);
    }
  });

  it('o CHECK antigo, sem nome, é achado pela definição e derrubado', () => {
    expect(CODIGO).toMatch(/pg_get_constraintdef\(oid\) LIKE '%em_aquecimento%'[\s\S]*?DROP CONSTRAINT %I/);
  });

  it('prazo existe exatamente nas situações com prazo', () => {
    expect(CODIGO).toMatch(
      /numeros_whatsapp_prazo_coerente CHECK \(\s*\(situacao IN \('aguardando_12h', 'aguardando_24h', 'em_restricao'\)\)\s*=\s*\(prazo_ate IS NOT NULL\)\)/);
  });

  it('a trilha sabe dizer o nome de cada uma', () => {
    const rotulo = corpo('fn_numeros_rotulo_situacao');
    for (const r of ['Aguardando 12 horas', 'Aguardando 24 horas', 'Movimentando no Proxy', 'Em restricao']) {
      expect(rotulo, r).toContain(r);
    }
  });
});

describe('o tempo mora no banco', () => {
  const gatilho = () => corpo('fn_numeros_situacao_prazo');

  it('dispara em todo cadastro e em toda troca de situação ou de prazo', () => {
    expect(CODIGO).toContain(
      'BEFORE INSERT OR UPDATE OF situacao, prazo_ate ON public.numeros_whatsapp');
  });

  it('as esperas têm prazo fixo, calculado na hora', () => {
    expect(gatilho()).toContain("NOW() + INTERVAL '12 hours'");
    expect(gatilho()).toContain("NOW() + INTERVAL '24 hours'");
  });

  it('trocar a situação grava desde quando, quem marcou, e zera o aviso', () => {
    expect(gatilho()).toMatch(
      /NEW\.situacao IS DISTINCT FROM OLD\.situacao THEN[\s\S]*?NEW\.situacao_desde\s*:= NOW\(\)[\s\S]*?NEW\.situacao_por\s*:= \(SELECT auth\.uid\(\)\)[\s\S]*?NEW\.prazo_notificado_em := NULL/);
  });

  it('a restauração da lixeira mantém o prazo que o número tinha', () => {
    expect(gatilho()).toContain('COALESCE(NEW.prazo_ate, NOW() + INTERVAL');
    expect(gatilho()).toContain('COALESCE(NEW.situacao_desde, NOW())');
  });

  it('restrição sem tempo é recusada pelo banco', () => {
    expect(gatilho()).toMatch(
      /NEW\.situacao = 'em_restricao' AND NEW\.prazo_ate IS NULL THEN[\s\S]*?RAISE EXCEPTION/);
  });

  it('corrigir o tempo da restrição vale como prazo novo para o aviso', () => {
    expect(gatilho()).toMatch(
      /NEW\.prazo_ate IS DISTINCT FROM OLD\.prazo_ate THEN[\s\S]*?NEW\.prazo_notificado_em := NULL/);
  });

  it('a função do gatilho não é chamável pela API', () => {
    expect(CODIGO).toContain(
      'REVOKE ALL ON FUNCTION public.fn_numeros_situacao_prazo() FROM PUBLIC, anon, authenticated;');
  });
});

describe('alterar a situação', () => {
  const rpc = () => corpo('fn_numeros_alterar_situacao');

  it('a assinatura antiga sai antes de a nova entrar — sem sobrecarga ambígua', () => {
    const drop = CODIGO.indexOf('DROP FUNCTION IF EXISTS public.fn_numeros_alterar_situacao(UUID, TEXT);');
    expect(drop).toBeGreaterThan(-1);
    expect(CODIGO.indexOf('FUNCTION public.fn_numeros_alterar_situacao(\n  p_numero_id UUID'))
      .toBeGreaterThan(drop);
  });

  it('continua sendo do Núcleo, com a linha travada', () => {
    expect(rpc()).toContain('NOT public.fn_numeros_nucleo_administra(n.empresa_id)');
    expect(rpc()).toContain('FOR UPDATE');
  });

  it('o tempo da restrição é obrigatório e tem teto de 90 dias', () => {
    expect(rpc()).toMatch(
      /p_prazo_minutos IS NULL OR p_prazo_minutos < 1 OR p_prazo_minutos > 129600 THEN[\s\S]*?RAISE EXCEPTION/);
    expect(rpc()).toContain('make_interval(mins => p_prazo_minutos)');
  });

  it('marcar a mesma situação não mexe em nada — menos a restrição, que corrige o tempo', () => {
    expect(rpc()).toMatch(/ELSIF n\.situacao = p_situacao THEN\s+RETURN;/);
  });

  it('só authenticated chama', () => {
    expect(CODIGO).toContain(
      'REVOKE ALL ON FUNCTION public.fn_numeros_alterar_situacao(UUID, TEXT, INTEGER) FROM PUBLIC, anon;');
    expect(CODIGO).toContain(
      'GRANT EXECUTE ON FUNCTION public.fn_numeros_alterar_situacao(UUID, TEXT, INTEGER) TO authenticated;');
  });
});

describe('o aviso de «Pronto»', () => {
  const avisar = () => corpo('fn_numeros_avisar_prazos');

  it('olha só o que venceu e ainda não foi avisado', () => {
    expect(avisar()).toMatch(
      /n\.prazo_ate <= NOW\(\)[\s\S]*?n\.prazo_notificado_em IS NULL/);
    expect(avisar()).toContain('FOR UPDATE OF n SKIP LOCKED');
  });

  it('só as esperas notificam — a restrição é só visual', () => {
    expect(avisar()).toMatch(
      /IF r\.situacao IN \('aguardando_12h', 'aguardando_24h'\) THEN[\s\S]*?INSERT INTO public\.notificacoes/);
  });

  it('avisa quem marcou e quem é do setor do Núcleo, sem repetir', () => {
    expect(avisar()).toMatch(/SELECT r\.situacao_por AS usuario_id\s+UNION\s+SELECT p\.id/);
    expect(avisar()).toContain('p.setor_id = r.setor_nucleo_id');
  });

  it('marca o aviso como dado, para não repetir na volta seguinte', () => {
    expect(avisar()).toContain('SET prazo_notificado_em = NOW()');
  });

  it('o título casa com a categoria «Números» das notificações', () => {
    expect(avisar()).toContain("'Número pronto — ('");
    expect(avisar()).toContain("'/meus-chips'");
  });

  it('só o agendamento chama, a cada minuto, e sem duplicar o trabalho', () => {
    expect(CODIGO).toContain(
      'REVOKE ALL ON FUNCTION public.fn_numeros_avisar_prazos() FROM PUBLIC, anon, authenticated;');
    expect(CODIGO).toMatch(/cron\.unschedule\('numeros-avisar-prazos'\)[\s\S]*?cron\.schedule\(\s*'numeros-avisar-prazos', '\* \* \* \* \*'/);
  });

  it('sem pg_cron a migration segue, e diz o que ficou sem agendamento', () => {
    expect(CODIGO).toMatch(/NOT EXISTS \(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'\)[\s\S]*?RAISE NOTICE/);
  });
});

describe('a etiqueta da retirada do banimento', () => {
  it('entra no CHECK, na validação e no rótulo', () => {
    expect(CODIGO).toContain(
      "CHECK (etiquetas <@ ARRAY['nao_chegou_sms', 'retirada_banimento_solicitada']::TEXT[])");
    expect(corpo('fn_numeros_etiquetas_validas')).toContain("'retirada_banimento_solicitada'");
    expect(corpo('fn_numeros_rotulo_etiqueta')).toContain('Retirada do banimento solicitada');
  });

  it('o CHECK continua expressão pura — função em CHECK quebra o restore do pg_dump', () => {
    const i = CODIGO.lastIndexOf('ADD CONSTRAINT numeros_whatsapp_etiquetas_conhecidas');
    const declaracao = CODIGO.slice(i, CODIGO.indexOf(';', i));
    expect(declaracao).not.toContain('fn_numeros_');
  });
});
