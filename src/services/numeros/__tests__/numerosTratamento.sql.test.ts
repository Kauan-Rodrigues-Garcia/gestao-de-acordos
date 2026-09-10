/**
 * As garantias que a migration 20260910210000 acrescentou, conferidas no SQL.
 *
 * ## Por que um teste que lê migration
 *
 * As regras centrais deste módulo não são testáveis no navegador: quem cumpre
 * «um número em tratamento não volta ao setor», «só se corrige o que está no
 * Núcleo» e «apagar leva a trilha junto, então só apaga o que nunca circulou» é
 * o Postgres, e não a tela. Um teste de integração com Postgres provaria mais, e
 * não existe neste projeto.
 *
 * O que dá para provar aqui é que as garantias ESTÃO ESCRITAS, e que nenhuma
 * refatoração as removeu em silêncio. Mesmo recurso de `numerosBanco.sql.test.ts`
 * e de `rhSeguranca.sql.test.ts`.
 *
 * Cada asserção procura a REGRA, não a formatação.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');

/**
 * Acha a migration pelo NOME, ignorando o carimbo de versão.
 *
 * O prefixo muda: o arquivo nasce com um carimbo escolhido à mão e depois é
 * renomeado para o que o banco registrou em
 * `supabase_migrations.schema_migrations` — sem isso, `supabase db push`
 * reaplicaria migration que já rodou. Casar pelo sufixo deixa a reconciliação
 * ser o que ela é (renomear arquivo) sem levar o teste junto.
 */
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

const SQL    = migration('_numeros_tratamento_etiquetas_correcao.sql');
const CODIGO = semComentarios(SQL);

describe('as colunas nascem com as travas certas', () => {
  it('`etiquetas` é NOT NULL e começa vazia', () => {
    expect(CODIGO).toMatch(
      /ADD COLUMN IF NOT EXISTS etiquetas\s+TEXT\[\]\s+NOT NULL\s+DEFAULT/i);
  });

  it('`tratamento` só aceita os dois valores previstos, ou nada', () => {
    expect(CODIGO).toMatch(
      /CHECK \(tratamento IS NULL OR tratamento IN \('pendente', 'em_andamento'\)\)/);
  });

  it('tratamento só existe no Núcleo — quem trata é o Núcleo', () => {
    expect(CODIGO).toMatch(/CHECK \(tratamento IS NULL OR posse = 'nucleo'\)/);
  });

  it('a etiqueta desconhecida é recusada pelo BANCO, não só pela tela', () => {
    expect(CODIGO).toContain(
      "CHECK (etiquetas <@ ARRAY['nao_chegou_sms']::TEXT[])");
  });

  it('o CHECK é expressão pura — função em CHECK quebra o restore de pg_dump', () => {
    // No restore, a constraint pode ser recriada ANTES de a função existir, e a
    // restauração falha — inclusive a cópia de schema de uma branch do Supabase.
    const i = CODIGO.lastIndexOf('ADD CONSTRAINT numeros_whatsapp_etiquetas_conhecidas');
    expect(i, 'constraint das etiquetas nao encontrada').toBeGreaterThan(-1);
    const declaracao = CODIGO.slice(i, CODIGO.indexOf(';', i));
    expect(declaracao).toContain('CHECK');
    expect(declaracao).not.toContain('fn_numeros_');
  });

  it('a mesma etiqueta não entra duas vezes — a RPC normaliza e confere', () => {
    expect(corpoDaFuncao(SQL, 'fn_numeros_etiquetas_validas'))
      .toContain('COUNT(DISTINCT e)');
    const etiquetar = semComentarios(corpoDaFuncao(SQL, 'fn_numeros_etiquetar'));
    expect(etiquetar).toContain('array_agg(DISTINCT e ORDER BY e)');
    expect(etiquetar).toContain('public.fn_numeros_etiquetas_validas(v_novas)');
  });
});

describe('tratar e liberar são passos SEPARADOS', () => {
  const liberar = semComentarios(corpoDaFuncao(SQL, 'fn_numeros_liberar_ao_setor'));

  it('liberar RECUSA enquanto houver tratamento em aberto', () => {
    // A regra central do pedido. Sem ela, um número devolvido como banido
    // continuava `ativo` e podia ser remandado no mesmo minuto.
    expect(liberar).toMatch(/IF n\.tratamento IS NOT NULL THEN[\s\S]*?RAISE EXCEPTION/);
  });

  it('liberar continua exigindo situação ativa', () => {
    expect(liberar).toContain("n.situacao <> 'ativo'");
  });

  it('quem encerra o tratamento é uma função PRÓPRIA, e ela não move o número', () => {
    const concluir = semComentarios(corpoDaFuncao(SQL, 'fn_numeros_concluir_tratamento'));
    expect(concluir).toContain('tratamento = NULL');
    expect(concluir).toContain('motivo_retorno = NULL');
    // Encerrar o tratamento NÃO devolve ao setor: é o ponto da separação.
    expect(concluir).not.toMatch(/SET[\s\S]*?posse\s*=/);
  });

  it('alterar situação não exige tratamento nem posse — o Núcleo mexe quando quiser', () => {
    // `fn_numeros_alterar_situacao` vive na migration do fluxo e NÃO é
    // reescrita aqui. Se algum dia for, e ganhar uma trava de posse, o Núcleo
    // volta a ser obrigado a lançar o número para mudar o estado dele.
    expect(CODIGO).not.toContain('FUNCTION public.fn_numeros_alterar_situacao(');
  });
});

describe('o retorno não deixa duas colunas discordando', () => {
  it('relançar como banido grava a situação banido', () => {
    const relancar = semComentarios(corpoDaFuncao(SQL, 'fn_numeros_relancar_ao_nucleo'));
    expect(relancar).toContain("CASE WHEN p_motivo = 'banido' THEN 'banido'");
    expect(relancar).toContain('situacao = v_situacao');
  });

  it('relançar abre o tratamento como pendente', () => {
    expect(semComentarios(corpoDaFuncao(SQL, 'fn_numeros_relancar_ao_nucleo')))
      .toContain("tratamento = 'pendente'");
  });

  it('devolver à liderança como banido também grava banido', () => {
    // Mesma incoerência um degrau antes: sem isto, a liderança entregava o
    // número morto para a próxima pessoa.
    expect(semComentarios(corpoDaFuncao(SQL, 'fn_numeros_devolver_a_lideranca')))
      .toContain("CASE WHEN p_motivo = 'banido' THEN 'banido'");
  });

  it('só `banido` mexe na situação — os outros motivos não inventam fato', () => {
    for (const fn of ['fn_numeros_relancar_ao_nucleo', 'fn_numeros_devolver_a_lideranca']) {
      const corpo = semComentarios(corpoDaFuncao(SQL, fn));
      expect(corpo, fn).toContain('ELSE n.situacao END');
    }
  });

  it('devolver à liderança NÃO tira o número do setor', () => {
    const devolver = semComentarios(corpoDaFuncao(SQL, 'fn_numeros_devolver_a_lideranca'));
    expect(devolver).not.toContain("posse = 'nucleo'");
    expect(devolver).not.toContain("tratamento = 'pendente'");
  });

  it('a mudança de situação entra na trilha, e não acontece calada', () => {
    for (const fn of ['fn_numeros_relancar_ao_nucleo', 'fn_numeros_devolver_a_lideranca']) {
      expect(semComentarios(corpoDaFuncao(SQL, fn)), fn)
        .toContain("p_tipo              => 'situacao_alterada'");
    }
  });
});

describe('corrigir a digitação', () => {
  const valida = semComentarios(corpoDaFuncao(SQL, 'fn_numeros_whatsapp_valida'));

  it('trocar o número só vale no Núcleo e sem operador', () => {
    expect(valida).toMatch(
      /NEW\.numero IS DISTINCT FROM OLD\.numero[\s\S]*?OLD\.posse <> 'nucleo' OR OLD\.operador_id IS NOT NULL[\s\S]*?RAISE EXCEPTION/);
  });

  it('as travas anteriores continuam de pé', () => {
    // A função foi reescrita por inteiro para caber o bloco novo. Se o limite
    // de 6 ou a herança de setor tivessem caído no caminho, ninguém notaria até
    // o sétimo número entrar.
    expect(valida).toContain('FOR UPDATE');
    expect(valida).toContain('NEW.setor_id := v_cel_setor');
    expect(valida).toContain('v_quantos >= 6');
  });

  it('a correção entra na trilha por GATILHO', () => {
    expect(CODIGO).toContain('AFTER UPDATE OF numero ON public.numeros_whatsapp');
    expect(semComentarios(corpoDaFuncao(SQL, 'fn_numeros_registra_correcao')))
      .toContain("'numero_corrigido'");
  });

  it('salvar sem mudar nada não gera linha de histórico', () => {
    expect(semComentarios(corpoDaFuncao(SQL, 'fn_numeros_registra_correcao')))
      .toContain('NEW.numero IS DISTINCT FROM OLD.numero');
  });
});

describe('apagar um cadastro errado', () => {
  const podeExcluir = semComentarios(corpoDaFuncao(SQL, 'fn_numeros_pode_excluir'));

  it('recusa apagar o que está com um setor', () => {
    expect(podeExcluir).toContain("OLD.posse <> 'nucleo' OR OLD.operador_id IS NOT NULL");
  });

  it('recusa apagar o que já circulou — a trilha morreria junto', () => {
    expect(podeExcluir).toContain('numeros_movimentacoes');
    expect(podeExcluir).toMatch(
      /tipo NOT IN \('cadastro', 'numero_corrigido', 'etiquetas_alteradas'\)/);
  });

  it('a trava é BEFORE DELETE — o cliente não a contorna', () => {
    expect(CODIGO).toContain('BEFORE DELETE ON public.numeros_whatsapp');
  });
});

describe('as RPCs novas são do Núcleo, e não de qualquer um', () => {
  it.each([
    'fn_numeros_etiquetar',
    'fn_numeros_iniciar_tratamento',
    'fn_numeros_concluir_tratamento',
  ])('%s confere fn_numeros_nucleo_administra', nome => {
    expect(semComentarios(corpoDaFuncao(SQL, nome)))
      .toContain('public.fn_numeros_nucleo_administra(n.empresa_id)');
  });

  it.each([
    'fn_numeros_etiquetar',
    'fn_numeros_iniciar_tratamento',
    'fn_numeros_concluir_tratamento',
  ])('%s trava a linha antes de decidir', nome => {
    // Sem `FOR UPDATE`, duas pessoas encerrando o mesmo tratamento leriam o
    // estado antigo e as duas gravariam movimentação.
    expect(semComentarios(corpoDaFuncao(SQL, nome))).toContain('FOR UPDATE');
  });

  it('nenhuma delas é executável por PUBLIC', () => {
    for (const assinatura of [
      'fn_numeros_etiquetar(UUID, TEXT[])',
      'fn_numeros_iniciar_tratamento(UUID)',
      'fn_numeros_concluir_tratamento(UUID, TEXT)',
    ]) {
      expect(CODIGO, assinatura)
        .toContain(`REVOKE ALL ON FUNCTION public.${assinatura} FROM PUBLIC;`);
      expect(CODIGO, assinatura)
        .toContain(`GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated;`);
    }
  });
});

describe('a trilha continua sendo trilha', () => {
  it('os quatro tipos novos entraram no CHECK', () => {
    for (const tipo of [
      'numero_corrigido', 'etiquetas_alteradas',
      'tratamento_iniciado', 'tratamento_concluido',
    ]) {
      expect(CODIGO, tipo).toContain(`'${tipo}'`);
    }
  });

  it('os seis tipos antigos sobreviveram à reescrita do CHECK', () => {
    const check = CODIGO.slice(CODIGO.indexOf('numeros_movimentacoes_tipo_check CHECK'));
    for (const tipo of [
      'cadastro', 'situacao_alterada', 'liberado_ao_setor',
      'lancado_ao_operador', 'devolvido_a_lideranca', 'relancado_ao_nucleo',
    ]) {
      expect(check.slice(0, 700), tipo).toContain(`'${tipo}'`);
    }
  });

  it('a versão antiga de fn_numeros_movimentacao é DERRUBADA, e não deixada ao lado', () => {
    // `CREATE OR REPLACE` com parâmetros a mais cria uma SOBRECARGA. As duas
    // convivendo fariam as chamadas nomeadas cair na versão que não conhece as
    // frases novas — e o histórico sairia com «Movimentacao etiquetas_alteradas».
    expect(CODIGO).toMatch(
      /DROP FUNCTION IF EXISTS public\.fn_numeros_movimentacao\(\s*UUID, TEXT, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT\)/);
  });

  it('as frases novas são montadas no banco — a tela não interpreta código', () => {
    const mov = corpoDaFuncao(SQL, 'fn_numeros_movimentacao');
    expect(mov).toContain('Numero corrigido de %s para %s.');
    expect(mov).toContain('Tratamento concluido');
    expect(mov).toContain('fn_numeros_rotulo_etiquetas');
  });

  it('continua não havendo policy de INSERT, UPDATE ou DELETE na trilha', () => {
    expect(CODIGO).not.toMatch(/CREATE POLICY[^;]*ON public\.numeros_movimentacoes/i);
  });
});

describe('o que já tinha voltado antes da migration não some do painel', () => {
  it('o UPDATE de partida marca a fila existente como pendente', () => {
    expect(CODIGO).toMatch(
      /UPDATE public\.numeros_whatsapp[\s\S]*?SET tratamento = 'pendente'[\s\S]*?WHERE posse = 'nucleo'[\s\S]*?AND motivo_retorno IS NOT NULL/);
  });

  it('e não toca no que já tem tratamento — a migration é reaplicável', () => {
    expect(CODIGO).toContain('AND tratamento IS NULL');
  });
});
