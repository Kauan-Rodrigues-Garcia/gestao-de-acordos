/**
 * O que a importação do 59 mexeu, e como isso é dito para cada um.
 *
 * O caso que originou o pedido: «se sumiu um acordo meu do dia 1, foi para
 * outra pessoa, aparece para mim na nova importação». E, para a liderança, «o
 * acordo tal do operador tal era tanto e com essa nova importação agora tá
 * custando tanto».
 */
import { describe, it, expect } from 'vitest';
import {
  classificar, classificarTodas, fraseParaOperador, fraseParaLideranca,
  minhasMudancas, resumir, saldoDoOperador, momento,
  type MudancaCrua,
} from './mudancasImportacao';

/**
 * `Intl` separa «R$» do número com espaço INQUEBRÁVEL (U+00A0), não com o
 * espaço comum que se digita aqui. Comparar sem normalizar faz o teste falhar
 * com as duas strings idênticas na tela — meia hora perdida por caractere
 * invisível.
 */
const txt = (s: string) => s.replace(/\u00a0/g, ' ');

const ANA = '11111111-1111-1111-1111-111111111111';
const BIA = '22222222-2222-2222-2222-222222222222';

function crua(over: Partial<MudancaCrua> = {}): MudancaCrua {
  return {
    codigo: '13061983',
    nome_cliente: 'Cliente X',
    data_pagamento: '2026-09-01',
    lote_id: 'lote-1',
    ocorrido_em: '2026-09-28T14:07:00Z',
    operador_antes_id: ANA,
    operador_antes_nome: 'Ana Souza',
    valor_antes: 1000,
    com_ele_desde: '2026-09-22T12:30:00Z',
    operador_depois_id: ANA,
    operador_depois_nome: 'Ana Souza',
    valor_depois: 1000,
    ...over,
  };
}

describe('classificar', () => {
  it('sem depois nenhum: o NR sumiu do relatório', () => {
    expect(classificar(crua({ valor_depois: null, operador_depois_id: null }))).toBe('removido');
  });

  it('outro dono: transferência', () => {
    expect(classificar(crua({ operador_depois_id: BIA }))).toBe('transferido');
  });

  it('mesmo dono, outro valor: valor alterado', () => {
    expect(classificar(crua({ valor_depois: 800 }))).toBe('valor_alterado');
  });

  it('mesmo dono e mesmo valor: não é notícia', () => {
    /*
     * A sincronização grava o retrato antigo quando QUALQUER campo difere —
     * nome_cliente, forma_detalhe, e a própria procedência quando o 58 vira
     * 59. Nada disso interessa a ninguém.
     */
    expect(classificar(crua())).toBeNull();
  });

  it('centavos: 0,1 + 0,2 não vira "mudou de valor"', () => {
    expect(classificar(crua({ valor_antes: 0.1 + 0.2, valor_depois: 0.3 }))).toBeNull();
  });

  it('sumir vence trocar de dono', () => {
    expect(classificar(crua({ valor_depois: null, operador_depois_id: BIA }))).toBe('removido');
  });

  it('trocar de dono vence mudar de valor', () => {
    expect(classificar(crua({ operador_depois_id: BIA, valor_depois: 750 }))).toBe('transferido');
  });

  it('linha que era de ninguém e ganhou dono é transferência', () => {
    expect(classificar(crua({ operador_antes_id: null, operador_depois_id: BIA }))).toBe('transferido');
  });
});

describe('classificarTodas', () => {
  it('descarta o que não é notícia e calcula a diferença', () => {
    const r = classificarTodas([
      crua(),                                    // nada
      crua({ codigo: 'A', valor_depois: 800 }),  // -200
      crua({ codigo: 'B', valor_depois: null, operador_depois_id: null }), // -1000
    ]);
    expect(r.map(m => m.codigo)).toEqual(['A', 'B']);
    expect(r.find(m => m.codigo === 'A')?.diferenca).toBe(-200);
    expect(r.find(m => m.codigo === 'B')?.diferenca).toBe(-1000);
  });

  it('a mais recente vem primeiro', () => {
    const r = classificarTodas([
      crua({ codigo: 'velha', ocorrido_em: '2026-09-20T10:00:00Z', valor_depois: 1 }),
      crua({ codigo: 'nova',  ocorrido_em: '2026-09-28T10:00:00Z', valor_depois: 1 }),
    ]);
    expect(r.map(m => m.codigo)).toEqual(['nova', 'velha']);
  });

  it('empate de horário desempata pelo NR, para a ordem não dançar', () => {
    const r = classificarTodas([
      crua({ codigo: 'B', valor_depois: 1 }),
      crua({ codigo: 'A', valor_depois: 1 }),
    ]);
    expect(r.map(m => m.codigo)).toEqual(['A', 'B']);
  });
});

describe('a frase do operador', () => {
  const um = (o: Partial<MudancaCrua>) => classificarTodas([crua(o)])[0];

  it('o acordo que saiu e foi para outra pessoa', () => {
    const f = fraseParaOperador(um({ operador_depois_id: BIA, operador_depois_nome: 'Bia Lima' }), ANA);
    expect(f).toContain('NR 13061983');
    expect(f).toContain('com você desde 22/09/2026');
    expect(f).toContain('saiu dos seus recebimentos');
    expect(f).toContain('agora consta com Bia Lima');
    expect(txt(f)).toContain('R$ 1.000,00');
  });

  it('o acordo que sumiu manda falar com a liderança', () => {
    const f = fraseParaOperador(um({ valor_depois: null, operador_depois_id: null }), ANA);
    expect(f).toContain('foi removido do seu analítico');
    expect(f).toContain('fale com a liderança');
  });

  it('o acordo que CHEGOU para mim diz de quem veio', () => {
    const m = um({
      operador_antes_id: BIA, operador_antes_nome: 'Bia Lima',
      operador_depois_id: ANA, operador_depois_nome: 'Ana Souza',
    });
    const f = fraseParaOperador(m, ANA);
    expect(f).toContain('entrou nos seus recebimentos');
    expect(f).toContain('vindo de Bia Lima');
  });

  it('a mudança de valor diz o de antes e o de agora', () => {
    const f = fraseParaOperador(um({ valor_depois: 800 }), ANA);
    expect(txt(f)).toContain('mudou de R$ 1.000,00 para R$ 800,00');
  });

  it('sem data de entrada, a frase não inventa "desde"', () => {
    const f = fraseParaOperador(um({ com_ele_desde: null, valor_depois: null, operador_depois_id: null }), ANA);
    expect(f).not.toContain('desde');
  });

  it('o horário sai no fuso de São Paulo', () => {
    // 14:07 UTC = 11:07 em Brasília — a hora em que o robô do 59 rodou.
    const f = fraseParaOperador(um({ valor_depois: 800 }), ANA);
    expect(f).toContain('28/09/2026 às 11:07');
  });
});

describe('a frase da liderança', () => {
  const um = (o: Partial<MudancaCrua>) => classificarTodas([crua(o)])[0];

  it('diz de quem saiu e para quem foi', () => {
    const f = fraseParaLideranca(um({ operador_depois_id: BIA, operador_depois_nome: 'Bia Lima' }));
    expect(txt(f)).toBe(
      'NR 13061983 (01/09/2026) passou de Ana Souza, desde 22/09/2026 para Bia Lima. R$ 1.000,00.',
    );
  });

  it('na transferência com valor diferente, mostra os dois valores', () => {
    const f = fraseParaLideranca(um({
      operador_depois_id: BIA, operador_depois_nome: 'Bia Lima', valor_depois: 750,
    }));
    expect(txt(f)).toContain('R$ 1.000,00 → R$ 750,00');
  });

  it('o removido nomeia quem perdeu', () => {
    const f = fraseParaLideranca(um({ valor_depois: null, operador_depois_id: null }));
    expect(f).toContain('saiu do relatório');
    expect(f).toContain('Estava com Ana Souza');
  });

  it('a mudança de valor nomeia o dono — «o acordo tal do operador tal»', () => {
    const f = fraseParaLideranca(um({ valor_depois: 800 }));
    expect(txt(f)).toBe('NR 13061983 (01/09/2026), com Ana Souza, mudou de R$ 1.000,00 para R$ 800,00.');
  });

  it('linha sem operador não vira nome vazio', () => {
    const f = fraseParaLideranca(um({
      operador_antes_id: null, operador_antes_nome: null,
      operador_depois_id: BIA, operador_depois_nome: 'Bia Lima',
    }));
    expect(f).toContain('ninguém (sem operador)');
  });
});

describe('minhasMudancas', () => {
  it('pega as que saíram de mim e as que chegaram em mim', () => {
    const todas = classificarTodas([
      crua({ codigo: 'saiu',   operador_depois_id: BIA }),
      crua({ codigo: 'chegou', operador_antes_id: BIA, operador_depois_id: ANA, valor_depois: 500 }),
      crua({ codigo: 'alheia', operador_antes_id: BIA, operador_depois_id: null, valor_depois: null }),
    ]);
    expect(minhasMudancas(todas, ANA).map(m => m.codigo).sort()).toEqual(['chegou', 'saiu']);
  });
});

describe('resumir — o cabeçalho do card', () => {
  it('conta por tipo e soma o saldo', () => {
    const r = resumir(classificarTodas([
      crua({ codigo: 'A', valor_depois: null, operador_depois_id: null }), // -1000
      crua({ codigo: 'B', valor_depois: 800 }),                            //  -200
      crua({ codigo: 'C', operador_depois_id: BIA }),                      //     0
    ]));
    expect(r).toEqual({
      removidos: 1, transferidos: 1, valorAlterado: 1, saldo: -1200, total: 3,
    });
  });

  it('lista vazia não quebra', () => {
    expect(resumir([]).total).toBe(0);
  });
});

describe('saldoDoOperador', () => {
  /*
   * Diferente do saldo geral: numa transferência o dinheiro não some do mundo,
   * mas some da carteira de quem perdeu.
   */
  it('a transferência que sai pesa negativo na minha conta', () => {
    const ms = classificarTodas([crua({ operador_depois_id: BIA })]);
    expect(saldoDoOperador(ms, ANA)).toBe(-1000);
    expect(resumir(ms).saldo).toBe(0);
  });

  it('a que chega pesa positivo', () => {
    const ms = classificarTodas([
      crua({ operador_antes_id: BIA, operador_depois_id: ANA, valor_depois: 500 }),
    ]);
    expect(saldoDoOperador(ms, ANA)).toBe(500);
  });

  it('remoção tira o valor inteiro', () => {
    const ms = classificarTodas([crua({ valor_depois: null, operador_depois_id: null })]);
    expect(saldoDoOperador(ms, ANA)).toBe(-1000);
  });

  it('mudança de valor conta só a diferença', () => {
    const ms = classificarTodas([crua({ valor_depois: 800 })]);
    expect(saldoDoOperador(ms, ANA)).toBe(-200);
  });
});

describe('momento', () => {
  it('data inválida não vira "Invalid Date" na tela', () => {
    expect(momento('nao é data')).toBe('—');
  });
});
