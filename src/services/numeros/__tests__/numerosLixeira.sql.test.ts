/**
 * A Lixeira de Números — as garantias da migration 20260911150000, conferidas
 * no SQL.
 *
 * Mesmo recurso de `numerosTratamento.sql.test.ts`: quem cumpre «excluir guarda
 * a cópia antes de apagar» e «restaurar devolve o que era» é o Postgres, e um
 * teste de integração com banco não existe neste projeto. O que dá para provar
 * aqui é que as regras ESTÃO ESCRITAS, e que nenhuma refatoração as tirou.
 *
 * Cada asserção procura a REGRA, não a formatação.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');

/** Acha a migration pelo NOME, ignorando o carimbo — ver `numerosTratamento.sql.test.ts`. */
function migration(sufixo: string): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith(sufixo));
  expect(arquivo, `migration *${sufixo} não encontrada`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

/** Corpo de uma função, do CREATE até o `$function$;` que a fecha. */
function corpoDaFuncao(sql: string, nome: string): string {
  const i = sql.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = sql.indexOf('$function$;', i);
  expect(fim, `função ${nome} sem fechamento`).toBeGreaterThan(i);
  return sql.slice(i, fim);
}

/** O SQL sem os comentários — para não confundir explicação com regra. */
function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const SQL    = migration('_numeros_lixeira.sql');
const CODIGO = semComentarios(SQL);
const corpo  = (nome: string) => semComentarios(corpoDaFuncao(SQL, nome));

describe('excluir guarda a cópia antes de apagar', () => {
  it('a cópia leva a linha e a trilha inteiras', () => {
    const mover = corpo('fn_numeros_lixeira_mover_numero');
    expect(mover).toContain('to_jsonb(n)');
    expect(mover).toMatch(/jsonb_agg\(to_jsonb\(m\) ORDER BY m\.criado_em, m\.id\)/);
  });

  it('o INSERT na lixeira vem ANTES do DELETE', () => {
    // Na ordem inversa, a trilha morreria no CASCADE antes de ser copiada.
    const mover = corpo('fn_numeros_lixeira_mover_numero');
    const copia = mover.indexOf('INSERT INTO public.numeros_lixeira');
    expect(copia).toBeGreaterThan(-1);
    expect(mover.indexOf('DELETE FROM public.numeros_whatsapp')).toBeGreaterThan(copia);
  });

  it('a exclusão entra na trilha antes da cópia — o restaurado mostra quem excluiu', () => {
    const mover = corpo('fn_numeros_lixeira_mover_numero');
    const registro = mover.indexOf("'excluido_para_lixeira'");
    expect(registro).toBeGreaterThan(-1);
    expect(registro).toBeLessThan(mover.indexOf('INSERT INTO public.numeros_lixeira'));
  });

  it('o celular vai com os números no mesmo lote, e sai depois deles', () => {
    // Os números apontam para o aparelho com RESTRICT: ele só sai vazio.
    const cel = corpo('fn_numeros_excluir_celular');
    expect(cel).toContain('r.id, v_lote');
    expect(cel.indexOf('DELETE FROM public.numeros_celulares'))
      .toBeGreaterThan(cel.indexOf('fn_numeros_lixeira_mover_numero('));
  });
});

describe('quem exclui o quê', () => {
  it.each(['fn_numeros_excluir', 'fn_numeros_excluir_celular'])('%s é do Núcleo', nome => {
    expect(corpo(nome)).toMatch(/NOT public\.fn_numeros_nucleo_administra\([a-z]\.empresa_id\)/);
  });

  it('o Núcleo só exclui o que está em casa; o super_admin atravessa', () => {
    expect(corpo('fn_numeros_excluir')).toMatch(
      /NOT public\.fn_user_is_super_admin\(\)\s+AND \(n\.posse <> 'nucleo' OR n\.operador_id IS NOT NULL\)/);
    expect(corpo('fn_numeros_excluir_celular')).toMatch(
      /IF NOT public\.fn_user_is_super_admin\(\) THEN[\s\S]*?posse <> 'nucleo' OR operador_id IS NOT NULL/);
  });

  it('«já circulou» não segura mais a exclusão — a trilha vai junto', () => {
    expect(corpo('fn_numeros_excluir')).not.toContain('numeros_movimentacoes');
  });

  it.each([
    'fn_numeros_excluir',
    'fn_numeros_excluir_celular',
    'fn_numeros_restaurar',
    'fn_numeros_lixeira_excluir_definitivo',
  ])('%s trava a linha antes de decidir', nome => {
    expect(corpo(nome)).toContain('FOR UPDATE');
  });
});

describe('o DELETE direto continua travado', () => {
  const pode = () => corpo('fn_numeros_pode_excluir');

  it('só passa a linha que já tem cópia na lixeira', () => {
    expect(pode()).toMatch(
      /FROM public\.numeros_lixeira l[\s\S]*?l\.registro_id = OLD\.id[\s\S]*?RETURN OLD/);
  });

  it('o salvo-conduto não é variável de sessão, que se forjaria', () => {
    expect(CODIGO).not.toMatch(/current_setting|set_config/i);
  });

  it('sem cópia, as duas travas antigas seguem de pé', () => {
    expect(pode()).toContain("OLD.posse <> 'nucleo' OR OLD.operador_id IS NOT NULL");
    expect(pode()).toMatch(/tipo NOT IN \('cadastro', 'numero_corrigido', 'etiquetas_alteradas'\)/);
  });
});

describe('restaurar devolve o que era', () => {
  const numero = () => corpo('fn_numeros_lixeira_restaurar_numero');

  it('recria a linha e a trilha com os mesmos ids', () => {
    expect(numero()).toContain('jsonb_populate_record(NULL::public.numeros_whatsapp');
    expect(numero()).toContain('jsonb_populate_recordset(NULL::public.numeros_movimentacoes');
  });

  it('o gatilho de cadastro não inventa um segundo cadastro', () => {
    expect(corpo('fn_numeros_registra_cadastro')).toMatch(
      /FROM public\.numeros_lixeira l[\s\S]*?l\.registro_id = NEW\.id[\s\S]*?RETURN NULL/);
  });

  it('número recadastrado depois da exclusão é recusado com frase, antes do UNIQUE', () => {
    expect(numero()).toMatch(/n\.numero = l\.numero[\s\S]*?RAISE EXCEPTION/);
  });

  it('operador que não serve mais é solto, e a trilha diz isso', () => {
    expect(numero()).toContain("jsonb_set(v_registro, '{operador_id}', 'null'::JSONB)");
    expect(numero()).toContain('p.ativo IS TRUE');
    expect(numero()).toContain('voltou sem operador');
  });

  it('a cópia só sai da lixeira depois de o número voltar', () => {
    const n = numero();
    expect(n.indexOf('DELETE FROM public.numeros_lixeira'))
      .toBeGreaterThan(n.indexOf('INSERT INTO public.numeros_whatsapp'));
  });

  it('celular restaurado traz o lote; número sem celular traz só o celular', () => {
    const r = corpo('fn_numeros_restaurar');
    expect(r).toContain('lote_id = l.lote_id');
    expect(r).toContain(
      'NOT EXISTS (SELECT 1 FROM public.numeros_celulares c WHERE c.id = l.celular_id)');
  });
});

describe('excluir de vez exige a chave própria', () => {
  it.each([
    'fn_numeros_lixeira_excluir_definitivo',
    'fn_numeros_lixeira_esvaziar',
  ])('%s confere numeros_lixeira_esvaziar', nome => {
    expect(corpo(nome)).toContain("public.fn_user_tem('numeros_lixeira_esvaziar')");
  });

  it('a chave entra no catálogo nascendo desligada', () => {
    expect(CODIGO).toMatch(
      /\('numeros_lixeira_esvaziar', ARRAY\['bookplay'\]::TEXT\[\], ARRAY\[\]::TEXT\[\], false\)/);
  });
});

describe('a tabela e os privilégios', () => {
  it('RLS ligada, e só uma policy — de leitura', () => {
    expect(CODIGO).toMatch(/ALTER TABLE public\.numeros_lixeira ENABLE ROW LEVEL SECURITY/);
    const policies = CODIGO.match(/CREATE POLICY[^;]*ON public\.numeros_lixeira[^;]*;/g) ?? [];
    expect(policies).toHaveLength(1);
    expect(policies[0]).toContain('FOR SELECT');
  });

  it('a leitura é de quem administra o módulo, com a chamada envolta em SELECT', () => {
    expect(CODIGO).toContain('(SELECT public.fn_numeros_nucleo_administra(empresa_id))');
  });

  it.each([
    'fn_numeros_autor_nome()',
    'fn_numeros_lixeira_registrar(UUID, TEXT, TEXT)',
    'fn_numeros_lixeira_mover_numero(UUID, UUID, TEXT)',
    'fn_numeros_lixeira_restaurar_celular(UUID)',
    'fn_numeros_lixeira_restaurar_numero(UUID)',
  ])('a peça interna %s não é chamável pela API', assinatura => {
    expect(CODIGO).toContain(
      `REVOKE ALL ON FUNCTION public.${assinatura} FROM PUBLIC, anon, authenticated;`);
    expect(CODIGO).not.toContain(`GRANT EXECUTE ON FUNCTION public.${assinatura}`);
  });

  it.each([
    'fn_numeros_excluir(UUID)',
    'fn_numeros_excluir_celular(UUID)',
    'fn_numeros_restaurar(UUID)',
    'fn_numeros_lixeira_excluir_definitivo(UUID)',
    'fn_numeros_lixeira_esvaziar(UUID)',
  ])('a RPC %s é só de authenticated', assinatura => {
    expect(CODIGO).toContain(`REVOKE ALL ON FUNCTION public.${assinatura} FROM PUBLIC, anon;`);
    expect(CODIGO).toContain(`GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated;`);
  });

  it.each([
    'fn_numeros_pode_excluir', 'fn_numeros_registra_cadastro', 'fn_numeros_autor_nome',
    'fn_numeros_lixeira_registrar', 'fn_numeros_lixeira_mover_numero',
    'fn_numeros_lixeira_restaurar_celular', 'fn_numeros_lixeira_restaurar_numero',
    'fn_numeros_excluir', 'fn_numeros_excluir_celular', 'fn_numeros_restaurar',
    'fn_numeros_lixeira_excluir_definitivo', 'fn_numeros_lixeira_esvaziar',
  ])('%s fixa o search_path', nome => {
    expect(corpoDaFuncao(SQL, nome)).toMatch(/SET search_path TO 'public'/);
  });
});

describe('a trilha', () => {
  it('os dez tipos antigos sobreviveram à reescrita do CHECK, e os dois novos entraram', () => {
    const inicio = CODIGO.indexOf('numeros_movimentacoes_tipo_check CHECK');
    expect(inicio).toBeGreaterThan(-1);
    const check = CODIGO.slice(inicio, CODIGO.indexOf(';', inicio));
    for (const tipo of [
      'cadastro', 'situacao_alterada', 'liberado_ao_setor',
      'lancado_ao_operador', 'devolvido_a_lideranca', 'relancado_ao_nucleo',
      'numero_corrigido', 'etiquetas_alteradas',
      'tratamento_iniciado', 'tratamento_concluido',
      'excluido_para_lixeira', 'restaurado_da_lixeira',
    ]) {
      expect(check, tipo).toContain(`'${tipo}'`);
    }
  });
});
