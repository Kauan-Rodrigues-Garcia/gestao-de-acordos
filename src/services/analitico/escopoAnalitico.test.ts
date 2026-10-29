/**
 * escopoAnalitico.test.ts — a regra de "esta linha conta aqui?".
 *
 * O que se perde se isto quebrar: o dashboard e a aba Analítico voltam a
 * mostrar totais diferentes para o MESMO relatório, e ninguém consegue dizer
 * qual dos dois está certo. É dinheiro na tela de líder e de diretoria.
 */
import { describe, it, expect } from 'vitest';
import {
  linhaNoEscopo, escopoDeSetor, temCarimboDeSetor,
  setorSomaPorUsuarios, chavePessoaSetor, ESCOPO_EMPRESA,
  type EscopoAnalitico, type LinhaEscopavel,
} from './escopoAnalitico';

const PLAY4 = 'setor-play4';
const PLAY5 = 'setor-play5';
const DIGITAL = 'setor-digital';

const ANA   = 'op-ana';
const BRUNO = 'op-bruno';

/** Linha de operador do Play 4, carimbada no Play 4. */
const linhaAna: LinhaEscopavel = { operador_id: ANA, setor_id: PLAY4 };
/** Linha sem operador cadastrado, carimbada na importação do Play 4. */
const orfaPlay4: LinhaEscopavel = { operador_id: null, setor_id: PLAY4 };

describe('escopo de empresa', () => {
  it('soma tudo, inclusive linha sem operador', () => {
    // É o total do arquivo — o mesmo número do snapshot mensal e do card
    // "Total recebido" sem filtro.
    expect(linhaNoEscopo(linhaAna, ESCOPO_EMPRESA)).toBe(true);
    expect(linhaNoEscopo(orfaPlay4, ESCOPO_EMPRESA)).toBe(true);
    expect(linhaNoEscopo({ operador_id: null, setor_id: null }, ESCOPO_EMPRESA)).toBe(true);
  });
});

describe('escopo de operador', () => {
  const escopo: EscopoAnalitico = { tipo: 'operador', operadorId: ANA };

  it('pega só as linhas dele', () => {
    expect(linhaNoEscopo(linhaAna, escopo)).toBe(true);
    expect(linhaNoEscopo({ operador_id: BRUNO, setor_id: PLAY4 }, escopo)).toBe(false);
  });

  it('órfã não é de ninguém', () => {
    expect(linhaNoEscopo(orfaPlay4, escopo)).toBe(false);
  });
});

describe('escopo de equipe', () => {
  const escopo: EscopoAnalitico = { tipo: 'equipe', operadores: new Set([ANA]) };

  it('soma os membros', () => {
    expect(linhaNoEscopo(linhaAna, escopo)).toBe(true);
    expect(linhaNoEscopo({ operador_id: BRUNO, setor_id: PLAY4 }, escopo)).toBe(false);
  });

  it('órfã NÃO entra: ela tem setor, não tem equipe', () => {
    // Somá-la aqui creditaria a uma equipe o recebimento de alguém que o
    // sistema não sabe quem é.
    expect(linhaNoEscopo(orfaPlay4, escopo)).toBe(false);
  });
});

describe('escopo de equipe — a linha conta só no setor da pessoa (13/10/2026)', () => {
  // Ana é do Play 4 e tem linha carimbada no Play 5: o Painel Líder não a conta
  // na equipe, e o Dashboard passou a não contar também.
  const linhaAnaNoPlay5: LinhaEscopavel = { operador_id: ANA, setor_id: PLAY5 };
  const escopo: EscopoAnalitico = {
    tipo: 'equipe',
    operadores: new Set([ANA]),
    foraDoSetor: new Set([chavePessoaSetor(ANA, PLAY5)]),
  };

  it('tira a linha do membro carimbada fora do setor dele', () => {
    expect(linhaNoEscopo(linhaAnaNoPlay5, escopo)).toBe(false);
  });

  it('mantém as linhas do membro no setor dele', () => {
    expect(linhaNoEscopo(linhaAna, escopo)).toBe(true);
  });

  it('linha sem carimbo conta, como no resumo por operador', () => {
    expect(linhaNoEscopo({ operador_id: ANA, setor_id: null }, escopo)).toBe(true);
    expect(linhaNoEscopo({ operador_id: ANA }, escopo)).toBe(true);
  });

  it('sem os pares, nada muda: toda linha do membro conta', () => {
    const semRegra: EscopoAnalitico = { tipo: 'equipe', operadores: new Set([ANA]) };
    expect(linhaNoEscopo(linhaAnaNoPlay5, semRegra)).toBe(true);
  });

  it('quem saiu por transferência deixa na equipe de origem o que recebeu lá', () => {
    // Bruno foi para o Play 5; a linha dele no Play 4 é crédito desta equipe,
    // embora ele não seja mais membro. A do Play 5 não é.
    const comCredito: EscopoAnalitico = {
      ...escopo,
      creditos: new Set([chavePessoaSetor(BRUNO, PLAY4)]),
    };
    expect(linhaNoEscopo({ operador_id: BRUNO, setor_id: PLAY4 }, comCredito)).toBe(true);
    expect(linhaNoEscopo({ operador_id: BRUNO, setor_id: PLAY5 }, comCredito)).toBe(false);
  });

  it('crédito vale mesmo que o par esteja em foraDoSetor (é de lá que ele sai)', () => {
    const comCredito: EscopoAnalitico = {
      tipo: 'equipe',
      operadores: new Set(),
      foraDoSetor: new Set([chavePessoaSetor(BRUNO, PLAY4)]),
      creditos: new Set([chavePessoaSetor(BRUNO, PLAY4)]),
    };
    expect(linhaNoEscopo({ operador_id: BRUNO, setor_id: PLAY4 }, comCredito)).toBe(true);
  });
});

describe('setor NORMAL — soma pelo carimbo do relatório', () => {
  const escopo = escopoDeSetor({
    setorId: PLAY4, alternativo: false, operadores: new Set([ANA]), temCarimbo: true,
  });

  it('usa o carimbo, não o operador', () => {
    expect((escopo as { porRelatorio: boolean }).porRelatorio).toBe(true);
    expect(linhaNoEscopo(linhaAna, escopo)).toBe(true);
  });

  it('órfã carimbada no setor ENTRA', () => {
    // Este era o buraco do dashboard: ele descartava toda linha sem operador,
    // e o total ficava menor que o relatório do próprio setor.
    expect(linhaNoEscopo(orfaPlay4, escopo)).toBe(true);
  });

  it('clone emprestado de outro setor NÃO infla o total', () => {
    // Ana é clone numa equipe do Play 5, mas o recebimento dela veio no
    // relatório do Play 4: para o Play 5 ela não conta.
    const play5 = escopoDeSetor({
      setorId: PLAY5, alternativo: false, operadores: new Set([ANA]), temCarimbo: true,
    });
    expect(linhaNoEscopo(linhaAna, play5)).toBe(false);
  });

  it('operador do setor com linha carimbada em OUTRO setor fica de fora', () => {
    expect(linhaNoEscopo({ operador_id: ANA, setor_id: PLAY5 }, escopo)).toBe(false);
  });

  it('linha sem carimbo nenhum não vira do setor por acidente', () => {
    expect(linhaNoEscopo({ operador_id: ANA, setor_id: null }, escopo)).toBe(false);
  });
});

describe('setor ALTERNATIVO — soma pelos usuários', () => {
  // Digital não tem relatório próprio: recebe via clones do Play 4/5.
  const escopo = escopoDeSetor({
    setorId: DIGITAL, alternativo: true, operadores: new Set([ANA]), temCarimbo: true,
  });

  it('soma o clone mesmo com o carimbo em outro setor', () => {
    expect(linhaNoEscopo(linhaAna, escopo)).toBe(true);
  });

  it('não soma quem não é do setor', () => {
    expect(linhaNoEscopo({ operador_id: BRUNO, setor_id: DIGITAL }, escopo)).toBe(false);
  });

  it('órfã carimbada no próprio setor entra', () => {
    expect(linhaNoEscopo({ operador_id: null, setor_id: DIGITAL }, escopo)).toBe(true);
  });

  it('órfã de outro setor não entra', () => {
    expect(linhaNoEscopo(orfaPlay4, escopo)).toBe(false);
  });
});

describe('salvaguarda: RPC antiga, sem a coluna setor_id', () => {
  it('sem carimbo, setor normal cai na soma dos usuários em vez de zerar', () => {
    // Entre publicar o build e aplicar a 20260802a, `setor_id` vem undefined.
    // Somar "pelo carimbo" mostraria R$ 0,00 — um zero que parece dado real.
    const escopo = escopoDeSetor({
      setorId: PLAY4, alternativo: false, operadores: new Set([ANA]), temCarimbo: false,
    });
    expect((escopo as { porRelatorio: boolean }).porRelatorio).toBe(false);
    expect(linhaNoEscopo({ operador_id: ANA }, escopo)).toBe(true);
  });
});

describe('setorSomaPorUsuarios', () => {
  it('BookPlay: setor normal soma pelo carimbo do relatório', () => {
    expect(setorSomaPorUsuarios({ isPaguePlay: false, alternativo: false })).toBe(false);
  });

  it('BookPlay: setor alternativo soma pelos usuários', () => {
    expect(setorSomaPorUsuarios({ isPaguePlay: false, alternativo: true })).toBe(true);
  });

  it('PaguePlay soma pelos usuários em QUALQUER setor', () => {
    // Lá o carimbo não existe — a importação passa setorImportacaoId = null de
    // propósito. Somar por carimbo jogaria tudo no setor de quem importou.
    // Esta era a divergência: a aba Analítico usava carimbo, o Painel Líder não.
    expect(setorSomaPorUsuarios({ isPaguePlay: true, alternativo: false })).toBe(true);
    expect(setorSomaPorUsuarios({ isPaguePlay: true, alternativo: true })).toBe(true);
  });
});

describe('temCarimboDeSetor', () => {
  it('coluna ausente (undefined) = sem carimbo', () => {
    expect(temCarimboDeSetor([{ operador_id: ANA }, { operador_id: BRUNO }])).toBe(false);
  });

  it('carimbo nulo é carimbo conhecido e vazio, não coluna ausente', () => {
    // Distinção que importa: aqui a regra do carimbo É aplicável; o setor
    // apenas não tem essa linha.
    expect(temCarimboDeSetor([{ operador_id: ANA, setor_id: null }])).toBe(true);
  });

  it('uma linha carimbada já basta', () => {
    expect(temCarimboDeSetor([{ operador_id: ANA }, orfaPlay4])).toBe(true);
  });

  it('lista vazia não afirma que existe carimbo', () => {
    expect(temCarimboDeSetor([])).toBe(false);
  });
});

/*
 * O bloco `veTodosOsSetores` saiu com a função, na fase 4. O que ele protegia
 * — "a aba e o dashboard não podem discordar sobre a mesma pessoa" — agora é
 * garantido de outro jeito, e mais forte: as duas telas leem escopos
 * declarados por aba, e `permissoes-escopo.test.ts` trava que uma nunca fala
 * pela outra.
 */

/*
 * 14/09/2026: a Contribuição Receptivo passou a ENTRAR no analítico, como linha
 * sem operador no setor que recebeu (`procedencia = contribuicao_59`). O mesmo
 * dinheiro já está no total do Receptivo — então conta no setor e não na empresa.
 */
describe('linha de contribuição (2ª perna do Integral)', () => {
  const RECEPTIVO = 'setor-receptivo';
  const contribuicaoPlay4: LinhaEscopavel = {
    operador_id: null, setor_id: PLAY4, contribuicao: true, contribuicao_de_setor_id: RECEPTIVO,
  };

  it('não conta no total da empresa — já está no Receptivo', () => {
    expect(linhaNoEscopo(contribuicaoPlay4, ESCOPO_EMPRESA)).toBe(false);
  });

  it('conta no setor que recebeu, pelo carimbo', () => {
    const escopo = escopoDeSetor({ setorId: PLAY4, alternativo: false, operadores: new Set(), temCarimbo: true });
    expect(linhaNoEscopo(contribuicaoPlay4, escopo)).toBe(true);
  });

  it('não conta para operador nem equipe', () => {
    expect(linhaNoEscopo(contribuicaoPlay4, { tipo: 'operador', operadorId: ANA })).toBe(false);
    expect(linhaNoEscopo(contribuicaoPlay4, { tipo: 'equipe', operadores: new Set([ANA]) })).toBe(false);
  });

  it('a origem dela é o setor de quem cobrou: desmarcar o Receptivo tira a contribuição', () => {
    const escopo = escopoDeSetor({
      setorId: PLAY4, alternativo: false, operadores: new Set(), temCarimbo: true,
      origensExcluidas: new Set([RECEPTIVO]), setorDoOperador: () => null,
    });
    expect(linhaNoEscopo(contribuicaoPlay4, escopo)).toBe(false);
  });
});

/*
 * 28/10/2026: o 994 é dono da Retenção. Quando o 59 lança o mesmo pagamento
 * como extra para outro operador em outro setor, a linha do 994 é o espelho
 * (`espelho_extra`): conta para a pessoa, a equipe e o setor dela; na empresa,
 * o dinheiro já está no setor que o 59 creditou. Out/2026: NR 13052605, R$ 1.500
 * na Jessica (994) e na Juliana (59).
 */
describe('espelho do extra da Retenção (994)', () => {
  const JORNADA = 'setor-jornada';
  const JESSICA = 'op-jessica';
  const espelho: LinhaEscopavel = { operador_id: JESSICA, setor_id: JORNADA, espelho_extra: true };

  it('não conta no total da empresa — já está no setor do extra', () => {
    expect(linhaNoEscopo(espelho, ESCOPO_EMPRESA)).toBe(false);
  });

  it('conta para a pessoa, a equipe e o setor dela', () => {
    expect(linhaNoEscopo(espelho, { tipo: 'operador', operadorId: JESSICA })).toBe(true);
    expect(linhaNoEscopo(espelho, { tipo: 'equipe', operadores: new Set([JESSICA]) })).toBe(true);
    const setor = escopoDeSetor({ setorId: JORNADA, alternativo: false, operadores: new Set([JESSICA]), temCarimbo: true });
    expect(linhaNoEscopo(espelho, setor)).toBe(true);
  });

  it('a linha do 994 sem par no 59 conta na empresa como qualquer outra', () => {
    expect(linhaNoEscopo({ ...espelho, espelho_extra: false }, ESCOPO_EMPRESA)).toBe(true);
  });
});
