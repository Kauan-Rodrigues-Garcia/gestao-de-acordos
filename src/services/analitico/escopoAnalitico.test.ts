/**
 * escopoAnalitico.test.ts — a regra de "esta linha conta aqui?".
 *
 * O que se perde se isto quebrar: o dashboard e a aba Analítico voltam a
 * mostrar totais diferentes para o MESMO relatório, e ninguém consegue dizer
 * qual dos dois está certo. É dinheiro na tela de líder e de diretoria.
 */
import { describe, it, expect } from 'vitest';
import {
  linhaNoEscopo, escopoDeSetor, temCarimboDeSetor, veTodosOsSetores,
  setorSomaPorUsuarios, ESCOPO_EMPRESA,
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

describe('veTodosOsSetores', () => {
  const nega = () => false;
  const libera = () => true;

  it('cargo abre por si', () => {
    for (const cargo of ['administrador', 'super_admin', 'diretoria']) {
      expect(veTodosOsSetores(cargo, nega)).toBe(true);
    }
  });

  it('diretoria enxerga a empresa toda no dashboard, como já enxergava na aba', () => {
    // O defeito: a aba decidia por cargo e o dashboard por permissão, então a
    // diretoria via a empresa numa tela e só o próprio setor na outra.
    expect(veTodosOsSetores('diretoria', nega)).toBe(true);
  });

  it('permissão configurável abre para os demais', () => {
    expect(veTodosOsSetores('lider', nega)).toBe(false);
    expect(veTodosOsSetores('lider', libera)).toBe(true);
    expect(veTodosOsSetores('lider', c => c === 'ver_todos_setores')).toBe(true);
    expect(veTodosOsSetores('lider', c => c === 'ver_analiticos_global')).toBe(true);
  });

  it('cargo ausente não abre nada', () => {
    expect(veTodosOsSetores(null, nega)).toBe(false);
    expect(veTodosOsSetores(undefined, nega)).toBe(false);
  });
});
