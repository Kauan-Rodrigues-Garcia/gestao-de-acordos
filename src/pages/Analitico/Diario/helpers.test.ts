/**
 * helpers.test.ts — consolidação do Recebimento diário.
 *
 * Este arquivo decide QUANTO cada operador recebeu no dia e o que aparece na
 * lista que o líder copia e manda no grupo. Errar aqui não dá erro na tela:
 * dá número errado com cara de certo.
 *
 * As três regras que sustentam o resto:
 *
 *   1. **Cartão consolida por Cód.Acordo.** Quatro parcelas de um cartão são um
 *      acordo só, com o valor somado — contar quatro inflaria o número de
 *      acordos do operador.
 *   2. **Próx. contato ≤ dia do pagamento derruba a linha.** E a referência é o
 *      dia do PAGAMENTO, não o dia em que se olha o relatório: importar o
 *      mensal uma semana depois não pode reclassificar o que já aconteceu.
 *   3. **"Novo" é por acordo, não por linha.** Um acordo que já apareceu numa
 *      importação anterior do dia continua em "anteriores" mesmo que ganhe
 *      parcela nova na última.
 */
import { describe, it, expect } from 'vitest';
import type { DiarioRecebimento } from '@/lib/supabase';
// O texto sai de `formatBRL`, que usa Intl — e o Intl separa "R$" do número com
// espaço NÃO-QUEBRÁVEL. Comparar com um espaço comum digitado aqui falharia por
// um caractere invisível, então o valor esperado vem da mesma função.
import { formatBRL } from '@/lib/money';
import {
  isIgnorado, linhasVivas, acordoKey, fmtDataISO, dataLabel,
  consolidarItens, montarTextoListaDiario, agregarPorOperador, consolidarIgnorados,
} from './helpers';

let seq = 0;
function linha(over: Partial<DiarioRecebimento> = {}): DiarioRecebimento {
  seq += 1;
  return {
    id:               `id-${seq}`,
    empresa_id:       'emp-1',
    operador_id:      'op-1',
    operador_usuario: 'maria',
    cliente_codigo:   '1001',
    nome_cliente:     'Cliente Um',
    acordo_codigo:    'A-1',
    instituicao:      'bookplay',
    forma_pagamento:  'Pix',
    valor_recebido:   100,
    data_pagamento:   '2026-07-15',
    dia_referencia:   '2026-07-15',
    prox_contato:     null,
    tabulacao:        'Acordo Fechado',
    id_baixa:         `b-${seq}`,
    chave_unica:      `k-${seq}`,
    import_index:     1,
    visto:            false,
    importado_por_id: null,
    importado_em:     '2026-07-15T10:00:00Z',
    lote_id:          'lote-1',
    perfis:           null,
    ...over,
  };
}

// ── isIgnorado / linhasVivas ────────────────────────────────────────────────

describe('isIgnorado — o vínculo é medido no dia do pagamento', () => {
  it('sem próximo contato, a linha vale', () => {
    expect(isIgnorado(linha({ prox_contato: null }), '2026-07-20')).toBe(false);
  });

  it('próximo contato ANTES do pagamento derruba', () => {
    expect(isIgnorado(linha({ dia_referencia: '2026-07-15', prox_contato: '2026-07-10' }), '2026-07-31'))
      .toBe(true);
  });

  it('próximo contato no MESMO dia derruba — a regra é "≤"', () => {
    expect(isIgnorado(linha({ dia_referencia: '2026-07-15', prox_contato: '2026-07-15' }), '2026-07-31'))
      .toBe(true);
  });

  it('próximo contato DEPOIS do pagamento mantém, mesmo olhando o relatório semanas depois', () => {
    // O caso que motivou a regra: pagamento dia 01 com próx. contato dia 15
    // estava dentro do vínculo quando aconteceu. Importar dia 31 não muda isso.
    expect(isIgnorado(linha({ dia_referencia: '2026-07-01', prox_contato: '2026-07-15' }), '2026-07-31'))
      .toBe(false);
  });

  it('sem dia_referencia cai no "hoje" recebido por parâmetro', () => {
    expect(isIgnorado(linha({ dia_referencia: '', prox_contato: '2026-07-20' }), '2026-07-25')).toBe(true);
    expect(isIgnorado(linha({ dia_referencia: '', prox_contato: '2026-07-20' }), '2026-07-10')).toBe(false);
  });

  it('linhasVivas devolve só o que sobrou', () => {
    const rows = [
      linha({ prox_contato: null }),
      linha({ dia_referencia: '2026-07-15', prox_contato: '2026-07-01' }),
      linha({ dia_referencia: '2026-07-15', prox_contato: '2026-07-30' }),
    ];
    expect(linhasVivas(rows, '2026-07-31')).toHaveLength(2);
  });
});

// ── acordoKey ───────────────────────────────────────────────────────────────

describe('acordoKey — o que conta como "um acordo"', () => {
  it('cartão agrupa pelo código do acordo', () => {
    expect(acordoKey(linha({ forma_pagamento: 'Cartão Padrão', acordo_codigo: 'A-9' }))).toBe('cc:A-9');
  });

  it('cartão SEM código do acordo cai no pagamento — não dá para agrupar às cegas', () => {
    const l = linha({ forma_pagamento: 'Cartao Recorrente', acordo_codigo: null, id_baixa: 'b-77' });
    expect(acordoKey(l)).toBe('pay:b-77');
  });

  it('pix e boleto são um pagamento cada, mesmo com o mesmo acordo', () => {
    const a = linha({ forma_pagamento: 'Pix',    acordo_codigo: 'A-1', id_baixa: 'b-1' });
    const b = linha({ forma_pagamento: 'Boleto', acordo_codigo: 'A-1', id_baixa: 'b-2' });
    expect(acordoKey(a)).not.toBe(acordoKey(b));
  });

  it('sem Id.Baixa usa o id da linha', () => {
    expect(acordoKey(linha({ id: 'linha-x', id_baixa: null }))).toBe('pay:linha-x');
  });
});

// ── datas ───────────────────────────────────────────────────────────────────

describe('fmtDataISO e dataLabel', () => {
  it('formata em dd/MM/yyyy', () => {
    expect(fmtDataISO('2026-07-05')).toBe('05/07/2026');
  });

  it('sem data mostra travessão', () => {
    expect(fmtDataISO(null)).toBe('—');
    expect(dataLabel({ minData: null, maxData: null })).toBe('—');
  });

  it('um dia só não vira intervalo', () => {
    expect(dataLabel({ minData: '2026-07-05', maxData: '2026-07-05' })).toBe('05/07/2026');
  });

  it('parcelas em dias diferentes viram intervalo', () => {
    expect(dataLabel({ minData: '2026-07-05', maxData: '2026-07-09' }))
      .toBe('05/07/2026 a 09/07/2026');
  });
});

// ── consolidarItens ─────────────────────────────────────────────────────────

describe('consolidarItens — parcelas de cartão viram um acordo', () => {
  it('soma o valor, conta as parcelas e abre o intervalo de datas', () => {
    const rows = [
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', valor_recebido: 100, data_pagamento: '2026-07-05' }),
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', valor_recebido: 150, data_pagamento: '2026-07-09' }),
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', valor_recebido: 50,  data_pagamento: '2026-07-02' }),
    ];
    const itens = consolidarItens(rows, 1);
    expect(itens).toHaveLength(1);
    expect(itens[0].valor).toBe(300);
    expect(itens[0].n).toBe(3);
    expect(itens[0].minData).toBe('2026-07-02');
    expect(itens[0].maxData).toBe('2026-07-09');
    expect(itens[0].kind).toBe('cartao');
  });

  it('pix não consolida', () => {
    const rows = [
      linha({ forma_pagamento: 'Pix', id_baixa: 'b-1', valor_recebido: 100 }),
      linha({ forma_pagamento: 'Pix', id_baixa: 'b-2', valor_recebido: 100 }),
    ];
    expect(consolidarItens(rows, 1)).toHaveLength(2);
  });

  it('campo vazio na primeira parcela é preenchido pela seguinte', () => {
    const rows = [
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', cliente_codigo: null, nome_cliente: null, instituicao: null }),
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', cliente_codigo: '777', nome_cliente: 'Ana', instituicao: 'mundial' }),
    ];
    const [item] = consolidarItens(rows, 1);
    expect(item.cliente_codigo).toBe('777');
    expect(item.nome_cliente).toBe('Ana');
    expect(item.instituicao).toBe('mundial');
  });

  it('parcela sem data não apaga o intervalo já montado', () => {
    const rows = [
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', data_pagamento: '2026-07-05' }),
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', data_pagamento: null }),
    ];
    const [item] = consolidarItens(rows, 1);
    expect(item.minData).toBe('2026-07-05');
    expect(item.maxData).toBe('2026-07-05');
  });

  it('ordena por data e, no empate, por código do cliente', () => {
    const rows = [
      linha({ id_baixa: 'b-1', data_pagamento: '2026-07-09', cliente_codigo: '100' }),
      linha({ id_baixa: 'b-2', data_pagamento: '2026-07-05', cliente_codigo: '300' }),
      linha({ id_baixa: 'b-3', data_pagamento: '2026-07-05', cliente_codigo: '200' }),
    ];
    expect(consolidarItens(rows, 1).map(i => i.cliente_codigo)).toEqual(['200', '300', '100']);
  });
});

describe('consolidarItens — quem é "novo"', () => {
  it('no primeiro relatório do dia ninguém é novo', () => {
    const rows = [linha({ import_index: 1 }), linha({ import_index: 1 })];
    expect(consolidarItens(rows, 1).every(i => i.novo)).toBe(false);
  });

  it('a partir do segundo, é novo quem apareceu só na última importação', () => {
    const rows = [
      linha({ id_baixa: 'b-antigo', import_index: 1 }),
      linha({ id_baixa: 'b-novo',   import_index: 2 }),
    ];
    const itens = consolidarItens(rows, 2);
    expect(itens.find(i => i.key === 'pay:b-antigo')!.novo).toBe(false);
    expect(itens.find(i => i.key === 'pay:b-novo')!.novo).toBe(true);
  });

  it('acordo que já existia não vira novo por ganhar parcela na última importação', () => {
    // É o caso que a regra existe para cobrir: o cartão A-1 já estava lá no
    // primeiro relatório; a parcela nova não pode remarcá-lo como novidade.
    const rows = [
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', import_index: 1 }),
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', import_index: 2 }),
    ];
    const [item] = consolidarItens(rows, 2);
    expect(item.n).toBe(2);
    expect(item.novo).toBe(false);
  });
});

// ── montarTextoListaDiario ──────────────────────────────────────────────────

describe('montarTextoListaDiario — o texto que o líder cola no grupo', () => {
  const itens = consolidarItens([
    linha({ id_baixa: 'b-1', cliente_codigo: '1001', forma_pagamento: 'Pix',    valor_recebido: 250.5, import_index: 1, tabulacao: 'Acordo Fechado' }),
    linha({ id_baixa: 'b-2', cliente_codigo: '1002', forma_pagamento: 'Boleto', valor_recebido: 100,   import_index: 2, tabulacao: 'Promessa' }),
  ], 2);

  it('no primeiro relatório sai uma lista só, sem separar blocos', () => {
    const texto = montarTextoListaDiario('MARIA', '2026-07-15', itens, 1);
    expect(texto).toContain('*MARIA* — recebimentos (15/07/2026)');
    expect(texto).not.toContain('— Anteriores —');
    expect(texto).not.toContain('— Novos pagamentos —');
    expect(texto).toContain(`Total: ${formatBRL(350.5)}`);
  });

  it('a partir do segundo, separa anteriores e novos', () => {
    const texto = montarTextoListaDiario('MARIA', '2026-07-15', itens, 2);
    expect(texto).toContain('— Anteriores —');
    expect(texto).toContain('— Novos pagamentos —');
    expect(texto.indexOf('— Anteriores —')).toBeLessThan(texto.indexOf('— Novos pagamentos —'));
  });

  it('avisa para tabular quando a tabulação não é "Acordo Fechado"', () => {
    const texto = montarTextoListaDiario('MARIA', '2026-07-15', itens, 1);
    expect(texto).toContain(`1001 - Pix - ${formatBRL(250.5)}`);
    expect(texto).toContain(`1002 - Boleto - ${formatBRL(100)} (Tabular Acordo Fechado)`);
  });

  it('sem código do cliente usa o do acordo; sem os dois, travessão', () => {
    const sem = consolidarItens([
      linha({ id_baixa: 'b-3', cliente_codigo: null, acordo_codigo: 'A-42', valor_recebido: 10 }),
      linha({ id_baixa: 'b-4', cliente_codigo: null, acordo_codigo: null,   valor_recebido: 10 }),
    ], 1);
    const texto = montarTextoListaDiario('JOAO', null, sem, 1);
    expect(texto).toContain(`A-42 - Pix - ${formatBRL(10)}`);
    expect(texto).toContain(`— - Pix - ${formatBRL(10)}`);
  });

  it('sem dia, o cabeçalho não inventa data', () => {
    expect(montarTextoListaDiario('JOAO', null, [], 1)).toContain('*JOAO* — recebimentos\n');
  });

  it('lista vazia ainda fecha com total zero', () => {
    expect(montarTextoListaDiario('JOAO', '2026-07-15', [], 1)).toContain(`Total: ${formatBRL(0)}`);
  });
});

// ── agregarPorOperador ──────────────────────────────────────────────────────

describe('agregarPorOperador — o placar do líder', () => {
  it('separa por forma de pagamento e soma o total', () => {
    const rows = [
      linha({ operador_id: 'op-1', forma_pagamento: 'Pix',    valor_recebido: 100, id_baixa: 'b-1' }),
      linha({ operador_id: 'op-1', forma_pagamento: 'Boleto', valor_recebido: 50,  id_baixa: 'b-2' }),
      linha({ operador_id: 'op-1', forma_pagamento: 'Cartão', valor_recebido: 30,  acordo_codigo: 'A-1' }),
    ];
    const [m] = agregarPorOperador(rows, 1);
    expect(m.total).toBe(180);
    expect(m.pix).toBe(100);
    expect(m.boleto).toBe(50);
    expect(m.cartao).toBe(30);
    expect(m.nPagamentos).toBe(3);
    expect(m.nAcordos).toBe(3);
  });

  it('quatro parcelas de um cartão são UM acordo, mas quatro pagamentos', () => {
    const rows = [1, 2, 3, 4].map(() =>
      linha({ operador_id: 'op-1', forma_pagamento: 'Cartão', acordo_codigo: 'A-1', valor_recebido: 25 }));
    const [m] = agregarPorOperador(rows, 1);
    expect(m.total).toBe(100);
    expect(m.nPagamentos).toBe(4);
    expect(m.nAcordos).toBe(1);
  });

  it('linha órfã (sem operador vinculado) fica de fora', () => {
    const rows = [
      linha({ operador_id: null, valor_recebido: 999 }),
      linha({ operador_id: 'op-1', valor_recebido: 10, id_baixa: 'b-9' }),
    ];
    const resumo = agregarPorOperador(rows, 1);
    expect(resumo).toHaveLength(1);
    expect(resumo[0].total).toBe(10);
  });

  it('usa o nome do perfil quando o join veio, e o usuário do relatório quando não', () => {
    const comPerfil = agregarPorOperador(
      [linha({ operador_id: 'op-1', perfis: { id: 'op-1', nome: 'Maria Silva', usuario: 'msilva' } })], 1);
    expect(comPerfil[0].nome).toBe('Maria Silva');
    expect(comPerfil[0].usuario).toBe('msilva');

    const semPerfil = agregarPorOperador([linha({ operador_id: 'op-2', operador_usuario: 'joao', perfis: null })], 1);
    expect(semPerfil[0].nome).toBeNull();
    expect(semPerfil[0].usuario).toBe('joao');
  });

  it('ordena do maior total para o menor', () => {
    const rows = [
      linha({ operador_id: 'op-1', valor_recebido: 10,  id_baixa: 'b-1' }),
      linha({ operador_id: 'op-2', valor_recebido: 900, id_baixa: 'b-2' }),
      linha({ operador_id: 'op-3', valor_recebido: 500, id_baixa: 'b-3' }),
    ];
    expect(agregarPorOperador(rows, 1).map(m => m.operadorId)).toEqual(['op-2', 'op-3', 'op-1']);
  });

  it('conta "novos" só a partir da segunda importação do dia', () => {
    const rows = [
      linha({ operador_id: 'op-1', id_baixa: 'b-1', import_index: 1 }),
      linha({ operador_id: 'op-1', id_baixa: 'b-2', import_index: 2 }),
    ];
    expect(agregarPorOperador(rows, 1)[0].novos).toBe(0);
    expect(agregarPorOperador(rows, 2)[0].novos).toBe(1);
  });
});

// ── consolidarIgnorados ─────────────────────────────────────────────────────

describe('consolidarIgnorados — o card que explica o dinheiro que não entrou', () => {
  it('pega só as linhas derrubadas pelo próximo contato', () => {
    const rows = [
      linha({ dia_referencia: '2026-07-15', prox_contato: null }),
      linha({ dia_referencia: '2026-07-15', prox_contato: '2026-07-10', id_baixa: 'b-x' }),
    ];
    const ign = consolidarIgnorados(rows, '2026-07-31');
    expect(ign).toHaveLength(1);
    expect(ign[0].proxContato).toBe('2026-07-10');
  });

  it('agrupa parcelas do mesmo cartão e guarda o próximo contato mais antigo', () => {
    const rows = [
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', valor_recebido: 40,
              dia_referencia: '2026-07-15', prox_contato: '2026-07-12' }),
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', valor_recebido: 60,
              dia_referencia: '2026-07-15', prox_contato: '2026-07-08' }),
    ];
    const [item] = consolidarIgnorados(rows, '2026-07-31');
    expect(item.valor).toBe(100);
    expect(item.n).toBe(2);
    expect(item.proxContato).toBe('2026-07-08');
  });

  it('mesmo acordo em operadores diferentes não se mistura', () => {
    const rows = [
      linha({ operador_usuario: 'maria', forma_pagamento: 'Cartão', acordo_codigo: 'A-1',
              dia_referencia: '2026-07-15', prox_contato: '2026-07-10' }),
      linha({ operador_usuario: 'joao',  forma_pagamento: 'Cartão', acordo_codigo: 'A-1',
              dia_referencia: '2026-07-15', prox_contato: '2026-07-10' }),
    ];
    expect(consolidarIgnorados(rows, '2026-07-31')).toHaveLength(2);
  });

  it('código do cliente vazio na primeira parcela é preenchido pela seguinte', () => {
    const rows = [
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', cliente_codigo: null,
              dia_referencia: '2026-07-15', prox_contato: '2026-07-10' }),
      linha({ forma_pagamento: 'Cartão', acordo_codigo: 'A-1', cliente_codigo: '555',
              dia_referencia: '2026-07-15', prox_contato: '2026-07-10' }),
    ];
    expect(consolidarIgnorados(rows, '2026-07-31')[0].cliente_codigo).toBe('555');
  });

  it('ordena pelo próximo contato mais antigo e, no empate, pelo operador', () => {
    const rows = [
      linha({ operador_usuario: 'zeca',  id_baixa: 'b-1', dia_referencia: '2026-07-15', prox_contato: '2026-07-10' }),
      linha({ operador_usuario: 'ana',   id_baixa: 'b-2', dia_referencia: '2026-07-15', prox_contato: '2026-07-10' }),
      linha({ operador_usuario: 'bruno', id_baixa: 'b-3', dia_referencia: '2026-07-15', prox_contato: '2026-07-01' }),
    ];
    expect(consolidarIgnorados(rows, '2026-07-31').map(i => i.operador))
      .toEqual(['bruno', 'ana', 'zeca']);
  });

  it('usa o nome do perfil quando existe', () => {
    const rows = [linha({ perfis: { id: 'op-1', nome: 'Maria Silva', usuario: 'msilva' },
                          dia_referencia: '2026-07-15', prox_contato: '2026-07-10' })];
    expect(consolidarIgnorados(rows, '2026-07-31')[0].operador).toBe('Maria Silva');
  });
});
