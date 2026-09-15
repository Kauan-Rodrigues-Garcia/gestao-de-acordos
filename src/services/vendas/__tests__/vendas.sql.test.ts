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
/*
 * A Fase 6 SUBSTITUI `fn_vendas_projetar` (a assinatura mudou: cinco colunas de
 * descarte novas). Por isso as asserções sobre a projeção leem daqui, e não da
 * Fase 3 — ler da Fase 3 seria provar uma função que o banco não tem mais.
 */
const FASE6 = migration('_vendas_fase6_a_conta_do_setor_fecha.sql');

const C1 = compacto(FASE1);
const C2 = compacto(FASE2);
const C3 = compacto(FASE3);
const C4 = compacto(FASE4);
const C5 = compacto(FASE5);
const C6 = compacto(FASE6);

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
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_projetar'));
    expect(corpo).toContain('lb.importado_em > v_lote.importado_em');
    expect(corpo).toContain('v_preservadas := v_preservadas + 1');
  });

  it('a prévia conta as mesmas linhas como preservadas', () => {
    const corpo = compacto(corpoDaFuncao(FASE3, 'fn_vendas_projecao_previa'));
    expect(corpo).toContain('c.antes_importado_em > (SELECT importado_em FROM lote)');
  });
});

describe('a projeção só escreve o que tem dono', () => {
  it('franquia não vinculada não vira venda — mas é CONTADA, não descartada em silêncio', () => {
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_projetar'));
    // Até a Fase 5 isto era `JOIN ... AND f.estado = 'vinculado'`, e a linha
    // sumia sem deixar número. Medido em 15/09: 2.834 das 2.973 linhas do lote
    // caem aqui, R$ 13.424.041,59 — some-las em silêncio era o buraco.
    expect(corpo).toContain('LEFT JOIN public.vendas_franquias f');
    expect(corpo).toMatch(
      /franquia_estado IS NULL[\s\S]*?= 'novo' THEN[\s\S]*?v_sem_fr := v_sem_fr \+ 1;[\s\S]*?CONTINUE;/,
    );
    expect(corpo).toMatch(
      /franquia_estado = 'ignorado' THEN[\s\S]*?v_ignorada := v_ignorada \+ 1;[\s\S]*?CONTINUE;/,
    );
  });

  it('login sem pessoa vira contagem, não vira venda no nome de ninguém', () => {
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_projetar'));
    expect(corpo).toMatch(/IF r\.perfil_id IS NULL THEN[\s\S]*?v_sem_dono := v_sem_dono \+ 1;[\s\S]*?CONTINUE;/);
  });

  it('login ambíguo devolve NULL em vez de escolher por sorte', () => {
    const corpo = compacto(corpoDaFuncao(FASE3, 'fn_vendas_perfil_do_login'));
    // `MIN(uuid)` nao existe no Postgres — a funcao falhava ao ser criada.
    // `(ARRAY_AGG(id))[1]` faz o mesmo papel: com uma linha so, devolve o id dela.
    expect(corpo).toContain('CASE WHEN COUNT(*) = 1 THEN (ARRAY_AGG(p.id))[1] ELSE NULL END');
  });

  it('só o relatório GERAL vira venda — o do setor é prévia', () => {
    const corpo = semComentarios(corpoDaFuncao(FASE6, 'fn_vendas_projetar'));
    expect(corpo).toMatch(/v_lote\.origem <> 'geral' THEN[\s\S]*?RAISE EXCEPTION/);
  });

  it('só o lote vigente é projetado', () => {
    const corpo = semComentarios(corpoDaFuncao(FASE6, 'fn_vendas_projetar'));
    expect(corpo).toMatch(/v_lote\.estado <> 'vigente' THEN[\s\S]*?RAISE EXCEPTION/);
  });
});

describe('a reversão deixa rastro', () => {
  /*
   * Regra 5 do plano: venda confirmada que volta devolvida ou cancelada sai do
   * recebimento, «porém fica a informação em algum lugar para acompanhar».
   */
  it('a projeção grava evento `revertida` com o valor de antes', () => {
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_projetar'));
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
    const projetar = semComentarios(corpoDaFuncao(FASE6, 'fn_vendas_projetar'));
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

/* ────────────────────────────────────────────────────────────────────────────
 * Fase 6 — a conta do setor fecha, e o robô tem lugar próprio
 * ──────────────────────────────────────────────────────────────────────────── */

describe('a projeção devolve o que descartou', () => {
  it('as cinco colunas de descarte estão na assinatura', () => {
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_projetar'));
    for (const coluna of [
      'sem_franquia INTEGER', 'sem_franquia_valor NUMERIC',
      'franquia_ignorada INTEGER', 'ignorada_valor NUMERIC',
      'sem_dono_valor NUMERIC',
    ]) {
      expect(corpo, `falta ${coluna} no RETURNS TABLE`).toContain(coluna);
    }
  });

  it('cada descarte soma o VALOR, não só a contagem', () => {
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_projetar'));
    // Contagem sem valor responde «quantas linhas sumiram» e não «quanto
    // dinheiro» — que é a pergunta que a liderança faz.
    expect(corpo).toContain('v_sem_fr_v := v_sem_fr_v + COALESCE(r.valor_total, 0)');
    expect(corpo).toContain('v_ignorada_v := v_ignorada_v + COALESCE(r.valor_total, 0)');
    expect(corpo).toContain('v_sem_dono_v := v_sem_dono_v + COALESCE(r.valor_total, 0)');
  });

  it('o DROP vem antes, e os privilégios voltam depois', () => {
    // Trocar o tipo de retorno exige DROP, e o DROP zera os GRANTs. Sem as duas
    // linhas seguintes a função que ESCREVE em `vendas` fica aberta a PUBLIC.
    expect(C6).toContain('DROP FUNCTION IF EXISTS public.fn_vendas_projetar(UUID);');
    expect(C6).toContain('REVOKE ALL ON FUNCTION public.fn_vendas_projetar(UUID) FROM PUBLIC;');
    expect(C6).toContain('GRANT EXECUTE ON FUNCTION public.fn_vendas_projetar(UUID) TO authenticated;');
  });
});

describe('líder credita a equipe que lidera', () => {
  it('a projeção usa a função, e não `perfis.equipe_id` cru', () => {
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_projetar'));
    expect(corpo).toContain('v_equipe := public.fn_vendas_equipe_que_credita(r.perfil_id)');
    // Os 11 líderes do Comercial têm `equipe_id` nulo por desenho. Ler o campo
    // direto punha as vendas deles fora de equipe nenhuma.
    expect(corpo).not.toMatch(/SELECT equipe_id, setor_id INTO v_equipe/);
  });

  it('liderança só credita quando é ÚNICA', () => {
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_equipe_que_credita'));
    // Quem lidera três equipes não tem «a sua equipe»: creditar nas três
    // contaria o mesmo dinheiro três vezes. Mesma decisão de
    // fn_desafio_contexto_equipe.
    expect(corpo).toContain('HAVING COUNT(DISTINCT el.equipe_id) = 1');
    expect(corpo).toContain('FROM public.equipe_lideres el');
  });

  it('o cadastro é reserva, para quem não lidera nada', () => {
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_equipe_que_credita'));
    expect(corpo).toMatch(/COALESCE\([\s\S]*equipe_lideres[\s\S]*SELECT p\.equipe_id FROM public\.perfis p/);
  });
});

describe('o robô conta no setor e fica fora do placar de gente', () => {
  it('a marcação é coluna, não palpite pelo prefixo do login', () => {
    expect(C6).toContain('ADD COLUMN IF NOT EXISTS robo BOOLEAN NOT NULL DEFAULT FALSE');
  });

  it('nenhuma régua olha para `robo` — a venda do robô conta igual', () => {
    const projetar = compacto(corpoDaFuncao(FASE6, 'fn_vendas_projetar'));
    // Se a projeção passasse a filtrar por robô, o dinheiro dele sairia do
    // setor — e ele entrou no caixa como qualquer venda confirmada e assinada.
    expect(projetar).not.toContain('robo');
  });

  it('o fechamento separa por natureza sem tirar ninguém da soma', () => {
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_fechamento_do_setor'));
    expect(corpo).toContain("CASE WHEN e.e_robo THEN 'robo' ELSE 'humano' END");
    // `deste` é o recorte do setor; natureza agrupa DENTRO dele, então as duas
    // linhas somam a parcela do setor por construção.
    expect(corpo).toMatch(/FROM deste e GROUP BY e\.e_robo/);
  });
});

describe('o fechamento não pode mentir nem vazar', () => {
  it('os cinco destinos são exclusivos: cada linha para no primeiro CASE', () => {
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_fechamento_do_setor'));
    const ordem = ['sem_franquia', 'ignorada', 'sem_operador', 'deste_setor', 'outro_setor'];
    let anterior = -1;
    for (const destino of ordem) {
      const pos = corpo.indexOf(`'${destino}'`);
      expect(pos, `destino ${destino} sumiu do CASE`).toBeGreaterThan(anterior);
      anterior = pos;
    }
  });

  it('exige escopo de setor — a resposta é a conta do setor inteiro', () => {
    const corpo = semComentarios(corpoDaFuncao(FASE6, 'fn_vendas_fechamento_do_setor'));
    expect(corpo).toContain("public.fn_user_escopo('vendas')");
    expect(corpo).toMatch(/v_escopo < 2 THEN[\s\S]*?RAISE EXCEPTION/);
    // Escopo 2 alcança o PRÓPRIO setor, não qualquer um.
    expect(corpo).toMatch(/v_escopo = 2 AND p_setor_id NOT IN[\s\S]*?fn_setores_do_operador/);
  });

  it('é plpgsql de propósito: função SQL não sabe recusar', () => {
    const corpo = corpoDaFuncao(FASE6, 'fn_vendas_fechamento_do_setor');
    expect(corpo).toContain('LANGUAGE plpgsql');
    // Devolver zero linhas para quem não alcança seria pior: «conta vazia» é
    // indistinguível de «mês sem venda».
    expect(corpo).toContain("USING ERRCODE = '42501'");
  });

  it('lê o lote VIGENTE do mês, e só o geral', () => {
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_fechamento_do_setor'));
    expect(corpo).toContain("l.origem = 'geral'");
    expect(corpo).toContain("l.estado = 'vigente'");
  });

  it('a conferência compara com `vendas` pelo eixo de CONFIRMAÇÃO', () => {
    const corpo = compacto(corpoDaFuncao(FASE6, 'fn_vendas_fechamento_do_setor'));
    // Pelo eixo da venda o número nunca bateria: o geral recorta por
    // confirmação, e comparar eixos diferentes produziria alarme todo dia.
    expect(corpo).toContain('v.data_confirmacao >=');
    expect(corpo).toContain('v.data_confirmacao <');
  });
});

describe('a Fase 6 não mexe no catálogo de permissões', () => {
  it('não redefine fn_permissoes_catalogo', () => {
    // A cadeia já se partiu uma vez neste projeto, quando duas migrations
    // disputaram o topo e `tickets_excluir` sumiu em silêncio. Não havendo
    // chave nova a pedir, o jeito mais seguro de não partir a cadeia é não
    // tocá-la.
    expect(C6).not.toContain('CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()');
  });

  it('reusa `ver_vendas` e o escopo que já existem', () => {
    expect(C6).toContain("fn_user_escopo('vendas')");
  });
});

describe('a equipe que credita vale nos DOIS caminhos', () => {
  /*
   * A Fase 6 consertou só a projeção. O lançamento manual continuou lendo
   * `perfis.equipe_id`, e meio conserto é pior que defeito conhecido: o número
   * do relatório ficaria certo e o do lançamento errado, na mesma equipe, no
   * mesmo mês — sem como saber em qual acreditar.
   */
  const MANUAL = migration('_venda_manual_credita_a_equipe_que_lidera.sql');

  it('o lançamento manual usa a mesma função da projeção', () => {
    const corpo = compacto(corpoDaFuncao(MANUAL, 'fn_venda_salvar'));
    expect(corpo).toContain('v_equipe := public.fn_vendas_equipe_que_credita(p_operador_id)');
  });

  it('e parou de ler `perfis.equipe_id` direto', () => {
    const corpo = compacto(corpoDaFuncao(MANUAL, 'fn_venda_salvar'));
    expect(corpo).not.toContain('p.setor_id, p.equipe_id INTO');
    expect(corpo).toContain('SELECT p.setor_id INTO v_setor');
  });

  it('a equipe decide ALCANCE, não só crédito — por isso importava', () => {
    const corpo = compacto(corpoDaFuncao(MANUAL, 'fn_venda_salvar'));
    // Com `v_equipe` nulo, quem tem `vendas_escopo_equipe` era recusado ao
    // lançar a própria venda, com uma mensagem que manda procurar permissão
    // onde o problema era cadastro.
    expect(corpo).toContain(
      'public.fn_vendas_alcanca(p_empresa_id, p_operador_id, v_setor, v_equipe)',
    );
  });

  it('editar continua sem mexer em situação nem assinatura', () => {
    const corpo = compacto(corpoDaFuncao(MANUAL, 'fn_venda_salvar'));
    const update = corpo.slice(corpo.indexOf('UPDATE public.vendas SET'));
    expect(update).not.toContain('situacao =');
    expect(update).not.toContain('contrato_assinado =');
  });

  it('nenhuma RPC de vendas lê `perfis.equipe_id` cru', () => {
    // A varredura é a garantia de que o próximo caminho novo não repita o erro.
    for (const [rotulo, sql, nomes] of [
      ['fase1',  FASE1,  ['fn_venda_confirmar', 'fn_venda_excluir', 'fn_venda_restaurar']],
      ['fase6',  FASE6,  ['fn_vendas_projetar']],
      ['manual', MANUAL, ['fn_venda_salvar']],
    ] as const) {
      for (const nome of nomes) {
        const corpo = compacto(corpoDaFuncao(sql, nome));
        expect(corpo, `${rotulo}/${nome} lê perfis.equipe_id direto`)
          .not.toMatch(/p\.equipe_id INTO/);
      }
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Fase 7 — indicações
 * ──────────────────────────────────────────────────────────────────────────── */

describe('indicações', () => {
  const FASE7 = migration('_vendas_fase7_indicacoes.sql');
  const C7 = compacto(FASE7);

  it('a cadeia do catálogo parte do topo de VERDADE, que é a Fase 5', () => {
    // A Fase 6 não tocou o catálogo, então o topo continua sendo a 5. Chegar
    // pela 6 criaria um elo que não existe e derrubaria as chaves de meta.
    expect(C7).toContain('fn_permissoes_catalogo_antes_indicacoes_20260915');
    expect(C7).toContain(
      'SELECT * FROM public.fn_permissoes_catalogo_antes_meta_vendas_20260915()',
    );
    // E o congelamento REPETE as chaves da Fase 5 — é o que o torna retrato.
    const congelada = C7.slice(
      C7.indexOf('fn_permissoes_catalogo_antes_indicacoes_20260915'),
      C7.indexOf('CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()'),
    );
    expect(congelada).toContain("'ver_metas_vendas'");
    expect(congelada).toContain("'editar_metas_vendas'");
  });

  it('a migration recusa aplicar se a cadeia tiver perdido alguma chave', () => {
    expect(C7).toContain("chave = 'tickets_excluir'");
    expect(C7).toContain("chave = 'editar_metas_vendas'");
  });

  it('a instituição é única por empresa — é o que faz o ranking valer', () => {
    // Sem isto, dois operadores que visitam a mesma escola somam dois pontos
    // por um contato, e o ranking premia quem cadastrou mais rápido.
    expect(C7).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_indicacoes_instituicao '
      + 'ON public.indicacoes(empresa_id, LOWER(BTRIM(instituicao)))',
    );
  });

  it('o lote não aborta no repetido — devolve quem já indicou e quando', () => {
    const corpo = compacto(corpoDaFuncao(FASE7, 'fn_indicacoes_salvar_lote'));
    // Quem volta com oito nomes e tem o terceiro repetido quer os outros sete.
    expect(corpo).toContain("'ja_indicada_por'");
    expect(corpo).toContain("'em', v_dona.data_indicacao");
    expect(corpo).toMatch(/IF FOUND THEN[\s\S]*?v_repetidas := v_repetidas \|\|[\s\S]*?CONTINUE;/);
  });

  it('cadastrar EM NOME DE OUTRO exige `editar_indicacoes`', () => {
    const corpo = compacto(corpoDaFuncao(FASE7, 'fn_indicacoes_salvar_lote'));
    // Sem isto, um operador enche o ranking de um colega — ou esvazia o próprio.
    expect(corpo).toMatch(
      /p_operador_id <> \(SELECT auth\.uid\(\)\)[\s\S]*?NOT public\.fn_user_tem\('editar_indicacoes'\)[\s\S]*?RAISE EXCEPTION/,
    );
  });

  it('a equipe sai da liderança, como em vendas', () => {
    const corpo = compacto(corpoDaFuncao(FASE7, 'fn_indicacoes_salvar_lote'));
    expect(corpo).toContain('public.fn_vendas_equipe_que_credita(p_operador_id)');
    expect(corpo).not.toMatch(/p\.equipe_id INTO/);
  });

  it('o ranking é INVOKER: o recorte de quem olha é a resposta certa', () => {
    const corpo = corpoDaFuncao(FASE7, 'fn_indicacoes_ranking');
    // DEFINER obrigaria a repetir a regra de escopo dentro da função, e duas
    // cópias da mesma regra é como as telas passam a discordar.
    expect(corpo).not.toContain('SECURITY DEFINER');
    expect(compacto(corpo)).toContain('FROM public.indicacoes i');
  });

  it('escopo PRÓPRIO, com os quatro níveis, e nenhuma aba antiga se perdeu', () => {
    expect(C7).toContain("('indicacoes', 'ver_indicacoes')");
    for (const aba of ['vendas', 'fechamento', 'chips', 'rh', 'usuarios', 'analitico']) {
      expect(C7, `a aba ${aba} sumiu de fn_abas_escopo`).toContain(`('${aba}',`);
    }
    for (const nivel of ['individual', 'equipe', 'setor', 'todos_setores']) {
      expect(C7, `falta indicacoes_escopo_${nivel}`).toContain(`'indicacoes_escopo_${nivel}'`);
    }
    // E a verificação exige as 13 — acrescentar sem contar é como se perde uma.
    expect(C7).toContain('IF n <> 13 THEN');
  });

  it('a policy espelha os quatro níveis, com a função em subconsulta', () => {
    const policy = C7.slice(C7.indexOf('CREATE POLICY indicacoes_select'), C7.indexOf('CREATE OR REPLACE FUNCTION public.fn_indicacoes_salvar_lote'));
    // `(SELECT fn(...))` e não `fn(...)`: chamada por LINHA custa caro aqui —
    // ver a memória «Como escrever policy aqui».
    expect(policy).toContain("(SELECT public.fn_user_escopo('indicacoes')) >= 3");
    expect(policy).toContain("(SELECT public.fn_user_escopo('indicacoes')) = 2");
    expect(policy).toContain("(SELECT public.fn_user_escopo('indicacoes')) = 1");
    expect(policy).toContain('TO authenticated');
  });
});
