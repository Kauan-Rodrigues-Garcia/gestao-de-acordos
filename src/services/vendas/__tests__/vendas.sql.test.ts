/**
 * vendas.sql.test.ts — as garantias das três migrations do Comercial, no SQL.
 *
 * Quem cumpre «a régua é confirmada E assinada», «o NR não dobra entre meses» e
 * «retrato velho não desfaz retrato novo» é o Postgres. O que dá para provar
 * aqui é que as regras **estão escritas** — e que ninguém as tirou sem querer
 * ao mexer noutra coisa. Mesmo recurso de `numerosSituacoesPrazo.sql.test.ts`.
 *
 * Cada asserção aponta para um número medido no relatório real. Se uma delas
 * cair, o comentário diz quanto dinheiro está em jogo.
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

/** Espaço em branco não é significativo no SQL — compare sem ele. */
function compacto(sql: string): string {
  return semComentarios(sql).replace(/\s+/g, ' ');
}

const FASE1 = migration('_vendas_fase1.sql');
const FASE2 = migration('_vendas_fase2_lote_e_depara.sql');
const FASE3 = migration('_vendas_fase3_projecao_do_geral.sql');
const FASE4 = migration('_vendas_fase4_previa_do_setor.sql');
const FASE5 = migration('_vendas_fase5_meta_com_duas_reguas.sql');

const C1 = compacto(FASE1);
const C2 = compacto(FASE2);
const C3 = compacto(FASE3);
const C4 = compacto(FASE4);
const C5 = compacto(FASE5);

describe('a régua mora no banco, não numa consulta', () => {
  it('`conta_na_meta` é coluna GERADA em vendas', () => {
    expect(C1).toContain(
      "conta_na_meta BOOLEAN GENERATED ALWAYS AS ( situacao = 'confirmada' AND contrato_assinado ) STORED",
    );
  });

  it('`valor_na_meta` é zero fora da régua — somar a coluna acerta sem filtrar', () => {
    expect(C1).toContain(
      "valor_na_meta NUMERIC(14,2) GENERATED ALWAYS AS ( CASE WHEN situacao = 'confirmada' "
      + 'AND contrato_assinado THEN valor_total ELSE 0 END ) STORED',
    );
  });

  it('a mesma régua vale para a linha crua do relatório', () => {
    expect(C2).toContain(
      "conta_na_meta BOOLEAN GENERATED ALWAYS AS ( situacao = 'confirmada' AND contrato_assinado ) STORED",
    );
  });
});

describe('o NR não dobra', () => {
  /*
   * 99 NRs aparecem em agosto E setembro; 16 confirmados nos dois. Sem a chave
   * única, projetar os dois meses conta R$ 432.714,40 duas vezes — tudo para o
   * mesmo vendedor, porque o vendedor é o mesmo em 99 de 99 casos.
   */
  it('vendas tem UNIQUE (empresa_id, nr_documento)', () => {
    expect(C1).toContain('CONSTRAINT vendas_nr_unico UNIQUE (empresa_id, nr_documento)');
  });

  it('a Fase 3 recusa aplicar se a chave única não estiver de pé', () => {
    expect(C3).toContain("conname = 'vendas_nr_unico'");
    expect(semComentarios(FASE3)).toMatch(/RAISE EXCEPTION 'vendas_nr_unico nao existe/);
  });

  it('o mesmo NR não entra duas vezes no mesmo lote', () => {
    expect(C2).toContain(
      'CONSTRAINT vendas_relatorio_nr_unico_no_lote UNIQUE (lote_id, nr_documento)',
    );
  });
});

describe('um lote é um retrato, e retratos se substituem', () => {
  it('só existe um vigente por (empresa, mês, origem)', () => {
    expect(C2).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_lotes_vigente '
      + "ON public.vendas_lotes(empresa_id, mes, origem) WHERE estado = 'vigente'",
    );
  });

  it('promover aposenta o anterior E apaga as linhas dele', () => {
    const corpo = compacto(corpoDaFuncao(FASE2, 'fn_vendas_lote_promover'));
    expect(corpo).toContain("UPDATE public.vendas_lotes SET estado = 'substituido' WHERE id = v_anterior");
    expect(corpo).toContain('DELETE FROM public.vendas_relatorio WHERE lote_id = v_anterior');
  });

  it('promover um lote vazio é recusado — trocaria o mês por um retrato em branco', () => {
    const corpo = semComentarios(corpoDaFuncao(FASE2, 'fn_vendas_lote_promover'));
    expect(corpo).toMatch(/IF v_linhas = 0 THEN[\s\S]*?RAISE EXCEPTION/);
  });

  it('o lote vigente não pode ser descartado', () => {
    const corpo = semComentarios(corpoDaFuncao(FASE2, 'fn_vendas_lote_descartar'));
    expect(corpo).toMatch(/v_lote\.estado = 'vigente' THEN[\s\S]*?RAISE EXCEPTION/);
  });

  it('o vínculo de setor sobrevive a uma importação nova', () => {
    // O `DO UPDATE` só toca rótulo e datas. Estado, setor e quem vinculou são
    // decisão de gente, e uma carga não as desfaz.
    const corpo = compacto(corpoDaFuncao(FASE2, 'fn_vendas_lote_promover'));
    expect(corpo).toContain('ON CONFLICT ON CONSTRAINT vendas_franquias_codigo_unico DO UPDATE SET');
    const doUpdate = corpo.slice(corpo.indexOf('DO UPDATE SET'), corpo.indexOf('RETURNING (xmax'));
    expect(doUpdate, 'o DO UPDATE não pode mexer em setor_id').not.toContain('setor_id');
    expect(doUpdate, 'o DO UPDATE não pode mexer em estado').not.toContain('estado =');
  });
});

describe('retrato velho não desfaz retrato novo', () => {
  /*
   * O arquivo de agosto foi exportado em 31/08 e traz ZERO devolução datada de
   * setembro. Projetá-lo depois de setembro puxaria a venda de volta ao mês
   * errado, com a situação velha.
   */
  it('vendas guarda de qual lote veio', () => {
    expect(C3).toContain('ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS lote_id UUID');
  });

  it('a projeção pula a linha que um lote mais recente já escreveu', () => {
    const corpo = compacto(corpoDaFuncao(FASE3, 'fn_vendas_projetar'));
    expect(corpo).toContain('lb.importado_em > v_lote.importado_em');
    expect(corpo).toContain('v_preservadas := v_preservadas + 1');
  });

  it('a prévia conta as mesmas linhas como preservadas', () => {
    const corpo = compacto(corpoDaFuncao(FASE3, 'fn_vendas_projecao_previa'));
    expect(corpo).toContain('c.antes_importado_em > (SELECT importado_em FROM lote)');
  });
});

describe('a projeção só escreve o que tem dono', () => {
  it('a franquia precisa estar vinculada', () => {
    const corpo = compacto(corpoDaFuncao(FASE3, 'fn_vendas_projetar'));
    expect(corpo).toContain("AND f.estado = 'vinculado'");
  });

  it('login sem pessoa vira contagem, não vira venda no nome de ninguém', () => {
    const corpo = semComentarios(corpoDaFuncao(FASE3, 'fn_vendas_projetar'));
    expect(corpo).toMatch(/IF r\.perfil_id IS NULL THEN[\s\S]*?v_sem_dono := v_sem_dono \+ 1;[\s\S]*?CONTINUE;/);
  });

  it('login ambíguo devolve NULL em vez de escolher por sorte', () => {
    const corpo = compacto(corpoDaFuncao(FASE3, 'fn_vendas_perfil_do_login'));
    // `MIN(uuid)` nao existe no Postgres — a funcao falhava ao ser criada.
    // `(ARRAY_AGG(id))[1]` faz o mesmo papel: com uma linha so, devolve o id dela.
    expect(corpo).toContain('CASE WHEN COUNT(*) = 1 THEN (ARRAY_AGG(p.id))[1] ELSE NULL END');
  });

  it('só o relatório GERAL vira venda — o do setor é prévia', () => {
    const corpo = semComentarios(corpoDaFuncao(FASE3, 'fn_vendas_projetar'));
    expect(corpo).toMatch(/v_lote\.origem <> 'geral' THEN[\s\S]*?RAISE EXCEPTION/);
  });

  it('só o lote vigente é projetado', () => {
    const corpo = semComentarios(corpoDaFuncao(FASE3, 'fn_vendas_projetar'));
    expect(corpo).toMatch(/v_lote\.estado <> 'vigente' THEN[\s\S]*?RAISE EXCEPTION/);
  });
});

describe('a reversão deixa rastro', () => {
  /*
   * Regra 5 do plano: venda confirmada que volta devolvida ou cancelada sai do
   * recebimento, «porém fica a informação em algum lugar para acompanhar».
   */
  it('a projeção grava evento `revertida` com o valor de antes', () => {
    const corpo = compacto(corpoDaFuncao(FASE3, 'fn_vendas_projetar'));
    expect(corpo).toContain('v_antes.conta_na_meta AND NOT (r.situacao = ');
    expect(corpo).toContain("'revertida'");
    expect(corpo).toContain('v_antes.valor_na_meta');
  });

  it('a confirmação manual também gera `revertida`', () => {
    const corpo = compacto(corpoDaFuncao(FASE1, 'fn_venda_confirmar'));
    expect(corpo).toContain(
      "v_revertida := v_antes.conta_na_meta AND p_situacao IN ('cancelada', 'devolvida')",
    );
  });

  it('o que sumiu do retrato é listado, nunca apagado sozinho', () => {
    const corpo = compacto(corpoDaFuncao(FASE3, 'fn_vendas_sumidas_do_retrato'));
    expect(corpo).not.toContain('DELETE');
    expect(corpo).not.toContain('UPDATE');
    expect(corpo).toContain('NOT EXISTS ( SELECT 1 FROM public.vendas_relatorio r');
  });
});

describe('quem pode o quê', () => {
  it('confirmar é chave própria, separada de editar', () => {
    const salvar = semComentarios(corpoDaFuncao(FASE1, 'fn_venda_salvar'));
    expect(salvar).toContain("fn_user_tem('criar_vendas')");
    expect(salvar).toContain("fn_user_tem('editar_vendas')");
    expect(salvar, 'salvar não pode confirmar').not.toContain("fn_user_tem('confirmar_vendas')");

    const confirmar = semComentarios(corpoDaFuncao(FASE1, 'fn_venda_confirmar'));
    expect(confirmar).toContain("fn_user_tem('confirmar_vendas')");
  });

  it('projetar é chave própria, separada de importar', () => {
    const projetar = semComentarios(corpoDaFuncao(FASE3, 'fn_vendas_projetar'));
    expect(projetar).toContain("fn_user_tem('projetar_vendas')");

    const promover = semComentarios(corpoDaFuncao(FASE2, 'fn_vendas_lote_promover'));
    expect(promover).toContain("fn_user_tem('importar_vendas')");
    expect(promover, 'importar não pode projetar').not.toContain("fn_user_tem('projetar_vendas')");
  });

  it('nenhuma das três tabelas de venda aceita escrita por policy', () => {
    for (const [nome, sql] of [['fase1', C1], ['fase2', C2]] as const) {
      expect(sql, `${nome} não pode ter policy de INSERT`).not.toContain('FOR INSERT');
      expect(sql, `${nome} não pode ter policy de UPDATE`).not.toContain('FOR UPDATE TO');
      expect(sql, `${nome} não pode ter policy de DELETE`).not.toContain('FOR DELETE');
    }
  });

  it('as funções de escrita são SECURITY DEFINER com search_path preso', () => {
    for (const nome of ['fn_venda_salvar', 'fn_venda_confirmar', 'fn_venda_excluir']) {
      const corpo = compacto(corpoDaFuncao(FASE1, nome));
      expect(corpo, nome).toContain('SECURITY DEFINER');
      expect(corpo, nome).toContain("SET search_path TO 'public'");
    }
    for (const nome of ['fn_vendas_lote_promover', 'fn_vendas_franquia_vincular']) {
      const corpo = compacto(corpoDaFuncao(FASE2, nome));
      expect(corpo, nome).toContain('SECURITY DEFINER');
    }
  });
});

describe('o que o relatório NÃO guarda', () => {
  /*
   * A busca é dentro da DEFINIÇÃO da tabela, e não na migration inteira: o
   * `COMMENT ON TABLE` cita CPF justamente para dizer que ele não entra, e
   * comentário de SQL é string — `semComentarios` não o remove.
   */
  const definicao = C2.slice(
    C2.indexOf('CREATE TABLE IF NOT EXISTS public.vendas_relatorio'),
    C2.indexOf('CREATE INDEX IF NOT EXISTS idx_vendas_relatorio_lote'),
  );

  it('a definição foi encontrada — sem isso os dois testes abaixo passam vazios', () => {
    expect(definicao.length).toBeGreaterThan(500);
    expect(definicao).toContain('nr_documento');
  });

  it('CPF não entra — o sistema o expurgou em 20260728b', () => {
    expect(definicao, 'vendas_relatorio não pode ter coluna de CPF').not.toMatch(/\bcpf\b/i);
  });

  it('contato não entra — telefone e e-mail são dado de pessoa que ninguém pediu', () => {
    expect(definicao).not.toMatch(/telefone|email|e_mail|celular/i);
  });

  it('a decomposição de pagamento não entra — ela não fecha com o total', () => {
    expect(definicao).not.toMatch(/cartao_padrao|cartao_recorrente/i);
    // O par que a regra 4 definiu fica.
    expect(definicao).toContain('valor_recebido');
    expect(definicao).toContain('tipo_recebimento');
  });
});

describe('a prévia do setor cabe na tabela, e não afrouxa a venda', () => {
  /*
   * Medido no `prospecção.xlsx` real: 203 linhas, 23 em aberto, 44 sem data de
   * confirmação, e franquia SÓ com nome — o arquivo do setor não traz código.
   */
  it('as duas colunas que o setor não tem passam a aceitar nulo', () => {
    expect(C4).toContain('ALTER COLUMN data_confirmacao DROP NOT NULL');
    expect(C4).toContain('ALTER COLUMN codigo_franquia DROP NOT NULL');
  });

  it('mas a linha continua precisando de código OU nome', () => {
    expect(C4).toContain(
      'CONSTRAINT vendas_relatorio_tem_franquia '
      + "CHECK (codigo_franquia IS NOT NULL OR BTRIM(COALESCE(franquia, '')) <> '')",
    );
  });

  it('`vendas` NÃO afrouxa: venda confirmada continua exigindo mês', () => {
    // Afrouxar aqui abriria a porta para a prévia virar venda sem data de
    // confirmação — e o mês é o eixo oficial.
    expect(C4).not.toContain('vendas_confirmada_tem_data DROP');
    const prova = semComentarios(FASE4);
    expect(prova).toMatch(/vendas_confirmada_tem_data[\s\S]*?RAISE EXCEPTION/);
  });

  it('só o lote GERAL cadastra franquia — o do setor casa por nome', () => {
    const corpo = compacto(corpoDaFuncao(FASE4, 'fn_vendas_lote_promover'));
    expect(corpo).toContain("IF v_lote.origem = 'geral' THEN");
    expect(corpo).toContain('INSERT INTO public.vendas_franquias');
    // O ramo do setor não insere: ele conta quem não casou.
    const ramoSetor = corpo.slice(corpo.indexOf('ELSE'), corpo.indexOf('RETURN QUERY'));
    expect(ramoSetor).not.toContain('INSERT INTO public.vendas_franquias');
    expect(ramoSetor).toContain('fn_vendas_franquia_resolver');
  });

  it('o de-para casa por código primeiro e por nome depois', () => {
    const corpo = compacto(corpoDaFuncao(FASE4, 'fn_vendas_franquia_resolver'));
    expect(corpo).toContain('f.codigo = BTRIM(p_codigo)');
    expect(corpo).toContain('LOWER(BTRIM(f.nome)) = LOWER(BTRIM(p_nome))');
    // Nome ambíguo não escolhe por sorte.
    expect(corpo).toContain('CASE WHEN COUNT(*) = 1 THEN (ARRAY_AGG(f.id))[1] ELSE NULL END');
  });
});

describe('a conciliação não escreve nada', () => {
  it('as duas funções são STABLE e só leem', () => {
    for (const nome of ['fn_vendas_conciliacao', 'fn_vendas_conciliacao_resumo']) {
      const corpo = compacto(corpoDaFuncao(FASE4, nome));
      expect(corpo, nome).toContain('LANGUAGE sql STABLE');
      expect(corpo, nome).not.toContain('INSERT INTO');
      expect(corpo, nome).not.toContain('UPDATE public.');
      expect(corpo, nome).not.toContain('DELETE FROM');
    }
  });

  it('compara as três camadas pelos lotes VIGENTES de cada origem', () => {
    const corpo = compacto(corpoDaFuncao(FASE4, 'fn_vendas_conciliacao'));
    expect(corpo).toContain("l.origem = 'setor' AND l.estado = 'vigente'");
    expect(corpo).toContain("l.origem = 'geral' AND l.estado = 'vigente'");
  });

  it('a venda registrada entra pelos DOIS eixos de data', () => {
    // Pelo eixo de confirmação (o mês oficial) e pelo da venda (o recorte da
    // prévia). Sem os dois, a venda lançada à mão e ainda não confirmada
    // ficaria fora justamente da linha que a procura.
    const corpo = compacto(corpoDaFuncao(FASE4, 'fn_vendas_conciliacao'));
    expect(corpo).toContain('date_trunc(\'month\', v.data_confirmacao) = mes.m');
    expect(corpo).toContain('date_trunc(\'month\', v.data_venda) = mes.m');
  });

  it('divergente é discordância entre prévia e geral, não com o lançamento', () => {
    const corpo = compacto(corpoDaFuncao(FASE4, 'fn_vendas_conciliacao'));
    expect(corpo).toContain('g.situacao IS DISTINCT FROM pr.situacao');
    expect(corpo).toContain('g.contrato_assinado IS DISTINCT FROM pr.contrato_assinado');
    expect(corpo).toContain('g.valor_total IS DISTINCT FROM pr.valor_total');
  });
});

describe('a verificação não tropeça no cargo rh', () => {
  /*
   * `fn_permissoes_semear_empresa` percorre NOVE cargos e não inclui `rh`,
   * então a linha dele nunca recebe chave nova. Conferi-la fazia a migration
   * falhar por um buraco anterior a ela — aconteceu de verdade em 15/09/2026,
   * na primeira tentativa de aplicar a Fase 1.
   */
  it('as três migrations que semeiam excluem o cargo rh da conferência', () => {
    for (const [nome, sql] of [['fase1', C1], ['fase2', C2], ['fase3', C3]] as const) {
      expect(sql, nome).toContain("AND cp.cargo <> 'rh'");
    }
  });
});

describe('a meta tem duas réguas, e só uma decide', () => {
  it('a régua é coluna em `metas`, e só aceita os dois valores', () => {
    expect(C5).toContain('ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS regua TEXT');
    expect(C5).toContain("CHECK (regua IS NULL OR regua IN ('quantidade', 'valor'))");
  });

  it('não cria tabela nova — a linha de `metas` já tinha as duas metas', () => {
    expect(C5).not.toContain('CREATE TABLE');
  });

  /*
   * Escolher «quantidade» e deixar o campo vazio gravaria meta 0, que «bate»
   * sozinha no primeiro dia do mês.
   */
  it('régua sem a meta dela é recusada', () => {
    const corpo = semComentarios(corpoDaFuncao(FASE5, 'fn_vendas_meta_salvar'));
    expect(corpo).toMatch(/v_regua = 'quantidade' AND v_qtd <= 0 THEN[\s\S]*?RAISE EXCEPTION/);
    expect(corpo).toMatch(/v_regua = 'valor' AND v_val <= 0 THEN[\s\S]*?RAISE EXCEPTION/);
  });

  it('tudo zerado apaga a linha — meta vazia não informa nada', () => {
    const corpo = compacto(corpoDaFuncao(FASE5, 'fn_vendas_meta_salvar'));
    expect(corpo).toContain('v_regua IS NULL AND v_qtd = 0 AND v_val = 0');
    expect(corpo).toContain('DELETE FROM public.metas');
  });

  it('editar a meta é chave separada de ver', () => {
    const corpo = semComentarios(corpoDaFuncao(FASE5, 'fn_vendas_meta_salvar'));
    expect(corpo).toContain("fn_user_tem('editar_metas_vendas')");
    const leitura = semComentarios(corpoDaFuncao(FASE5, 'fn_vendas_metas_do_mes'));
    expect(leitura).toContain("fn_user_tem('ver_metas_vendas')");
    expect(leitura, 'ler não pode exigir editar').not.toContain("fn_user_tem('editar_metas_vendas')");
  });

  it('a leitura traz quem NÃO tem meta — senão esconde quem falta configurar', () => {
    const corpo = compacto(corpoDaFuncao(FASE5, 'fn_vendas_metas_do_mes'));
    expect(corpo).toContain('LEFT JOIN public.metas m');
    expect(corpo).toContain('COALESCE(m.meta_acordos, 0)');
  });

  it('a coluna meta_acordos ganhou comentário: no Comercial é quantidade de vendas', () => {
    expect(C5).toContain('COMMENT ON COLUMN public.metas.meta_acordos');
    expect(FASE5).toContain('no Comercial, de vendas');
  });
});

describe('todo join da API tem a FOREIGN KEY que o sustenta', () => {
  /*
   * O PostgREST monta os joins a partir das FKs. Um `select` que pede
   * `perfis:coluna ( ... )` sobre coluna SEM foreign key falha com «Could not
   * find a relationship ... in the schema cache» — e essa frase derrubou a tela
   * de Importar Vendas em 15/09/2026, porque a deteccao de erro a confundiu com
   * «tabela nao existe».
   *
   * Este teste varre os `select` dos servicos de Vendas, junta as colunas
   * embutidas e cobra a FK de cada uma nas migrations.
   */
  const SERVICOS = [
    'src/services/vendas/vendas.service.ts',
    'src/services/vendas/importacaoVendas.service.ts',
  ] as const;

  /** `perfis:importado_por ( id, nome )` -> { tabela, coluna }. */
  function embutidosDe(arquivo: string): Array<{ alvo: string; coluna: string }> {
    const codigo = fs.readFileSync(path.resolve(arquivo), 'utf8');
    const achados: Array<{ alvo: string; coluna: string }> = [];
    for (const m of codigo.matchAll(/([a-z_]+):([a-z_]+)\s*\(/g)) {
      achados.push({ alvo: m[1], coluna: m[2] });
    }
    return achados;
  }

  const TODAS = [C1, C2, C3, C4, C5, compacto(migration('_vendas_lote_importado_por_tem_fk.sql'))].join(' ');

  it('encontra os joins nos servicos — senao o teste passa vazio', () => {
    const todos = SERVICOS.flatMap(embutidosDe);
    expect(todos.length).toBeGreaterThan(2);
    expect(todos.map(e => e.coluna)).toContain('importado_por');
  });

  it('cada coluna embutida tem FOREIGN KEY em alguma migration', () => {
    const semFk: string[] = [];
    for (const arquivo of SERVICOS) {
      for (const { alvo, coluna } of embutidosDe(arquivo)) {
        const temInline = new RegExp(`${coluna}\\s+UUID[^,]*REFERENCES`, 'i').test(TODAS);
        const temAlter  = new RegExp(`FOREIGN KEY \\(${coluna}\\)`, 'i').test(TODAS);
        if (!temInline && !temAlter) semFk.push(alvo + ':' + coluna + '  (' + arquivo.split('/').pop() + ')');
      }
    }
    expect(
      semFk,
      'Estes joins da API nao tem FOREIGN KEY. O PostgREST responde "could not find a '
      + 'relationship" e a tela mostra um erro que aponta para o lugar errado: '
      + semFk.join(', '),
    ).toEqual([]);
  });
});
describe('a cadeia do catálogo não se parte', () => {
  it('cada fase congela a anterior antes de estender', () => {
    expect(C1).toContain('fn_permissoes_catalogo_antes_vendas_20260915');
    expect(C2).toContain('SELECT * FROM public.fn_permissoes_catalogo_antes_vendas_20260915()');
    expect(C2).toContain('fn_permissoes_catalogo_antes_vendas_lote_20260915');
    expect(C3).toContain('SELECT * FROM public.fn_permissoes_catalogo_antes_vendas_lote_20260915()');
    expect(C3).toContain('fn_permissoes_catalogo_antes_projecao_20260915');
  });

  it('a aba vendas está no registro de escopo, com o prefixo certo', () => {
    expect(C1).toContain("('vendas', 'ver_vendas')");
    for (const nivel of ['individual', 'equipe', 'setor', 'todos_setores']) {
      expect(C1, `falta vendas_escopo_${nivel}`).toContain(`'vendas_escopo_${nivel}'`);
    }
  });
});
