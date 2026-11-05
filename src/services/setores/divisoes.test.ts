/**
 * Divisões do setor (05/11/2026): recorte VISUAL sobre o setor. Nada conta a
 * mais nem duas vezes — cada linha do setor cai em exatamente um lugar
 * (uma divisão ou «Sem divisão»), e a soma fecha o setor ao centavo.
 */
import { describe, expect, it } from 'vitest';
import {
  escopoDeSetor, linhaNoEscopo, type EscopoSetor, type LinhaEscopavel,
} from '@/services/analitico/escopoAnalitico';
import type { OperadorEquipeInfo } from '@/services/analitico/analitico.service';
import {
  divisaoDaEquipe, divisaoDePessoa, divisoesDoSetor, escopoDaDivisao, escopoSemDivisao,
  recebedoresSemCadastro, type DivisaoDoSetor,
} from './divisoes';

const RECEPTIVO = 'setor-receptivo';
const PLAY1 = 'setor-play1';

const info = (equipe: string | null, setor: string | null): OperadorEquipeInfo => ({
  equipe_id: equipe, equipe_nome: equipe ?? '', setor_id: setor,
});

const fontes = {
  operadorEquipeMap: {
    ana:    info('eq-0800-a', RECEPTIVO),
    bia:    info('eq-0800-b', RECEPTIVO),
    caio:   info('eq-tav', RECEPTIVO),
    dani:   info('eq-sem', RECEPTIVO),     // equipe do Receptivo fora de divisão
    play1:  info(null, RECEPTIVO),          // tem conta, recebe sem equipe
    edu:    info('eq-p1', PLAY1),           // outro setor
  } as Record<string, OperadorEquipeInfo>,
  // A Ana é da 0800 e também está CLONADA numa equipe do Time a vencer.
  equipesExtrasPorOperador: { ana: ['eq-tav'] } as Record<string, string[]>,
};

const perfilPorUsuario = { pagueplay_play1: 'play1' };

const div0800: DivisaoDoSetor = {
  id: 'd-0800', setorId: RECEPTIVO, nome: '0800', ordem: 1, ativo: true,
  equipes: ['eq-0800-a', 'eq-0800-b'], recebedores: ['pagueplay_play1', 'pagueplay_play3'],
};
const divTav: DivisaoDoSetor = {
  id: 'd-tav', setorId: RECEPTIVO, nome: 'Time a vencer', ordem: 2, ativo: true,
  equipes: ['eq-tav'], recebedores: ['pagueplay_play2'],
};
const divisoes = [div0800, divTav];

const setor = escopoDeSetor({
  setorId: RECEPTIVO, alternativo: false, operadores: new Set(), temCarimbo: true,
}) as EscopoSetor;

interface Linha extends LinhaEscopavel { valor: number }
const linhas: Linha[] = [
  { operador_id: 'ana',   setor_id: RECEPTIVO, valor: 100 },
  { operador_id: 'bia',   setor_id: RECEPTIVO, valor: 50.25 },
  { operador_id: 'caio',  setor_id: RECEPTIVO, valor: 70 },
  { operador_id: 'dani',  setor_id: RECEPTIVO, valor: 30 },
  { operador_id: 'play1', setor_id: RECEPTIVO, valor: 999.99 },
  // Órfãs: login sem conta. Maiúscula como vem do relatório.
  { operador_id: null, operador_usuario: 'Pagueplay_play3', setor_id: RECEPTIVO, valor: 9056.69 },
  { operador_id: null, operador_usuario: 'pagueplay_play2', setor_id: RECEPTIVO, valor: 7780.63 },
  { operador_id: null, operador_usuario: 'roberta_valencio', setor_id: RECEPTIVO, valor: 188 },
  { operador_id: null, setor_id: RECEPTIVO, valor: 12.34 },                    // órfã sem login
  { operador_id: null, setor_id: RECEPTIVO, valor: 40, ajuste_equipe_id: 'eq-tav' },
  { operador_id: 'edu',   setor_id: RECEPTIVO, valor: 5, contribuicao: true, contribuicao_de_setor_id: PLAY1 },
  { operador_id: 'ana',   setor_id: PLAY1,     valor: 1000 },                  // carimbada fora
  { operador_id: null, operador_usuario: 'pagueplay_play2', setor_id: PLAY1, valor: 77 }, // login em outro setor
];

const e0800 = escopoDaDivisao(setor, div0800, divisoes, fontes, perfilPorUsuario);
const eTav  = escopoDaDivisao(setor, divTav, divisoes, fontes, perfilPorUsuario);
const resto = escopoSemDivisao(setor, divisoes, fontes, perfilPorUsuario);

const centavos = (v: number) => Math.round(v * 100) / 100;
const soma = (esc: Parameters<typeof linhaNoEscopo>[1]) =>
  centavos(linhas.filter(l => linhaNoEscopo(l, esc)).reduce((s, l) => s + l.valor, 0));

describe('divisões do setor — nada a mais, nada em dobro', () => {
  it('cada linha do setor cai em exatamente UM lugar', () => {
    for (const l of linhas) {
      const lugares = [e0800, eTav, resto].filter(e => linhaNoEscopo(l, e)).length;
      expect(lugares, JSON.stringify(l)).toBe(linhaNoEscopo(l, setor) ? 1 : 0);
    }
  });

  it('divisões + «Sem divisão» = total do setor, ao centavo', () => {
    expect(centavos(soma(e0800) + soma(eTav) + soma(resto))).toBe(soma(setor));
  });

  it('quem está em duas divisões (equipe + clone) soma só na da própria equipe', () => {
    expect(divisaoDePessoa(divisoes, fontes, perfilPorUsuario).get('ana')).toBe('d-0800');
    const linhaAna = linhas[0];
    expect(linhaNoEscopo(linhaAna, e0800)).toBe(true);
    expect(linhaNoEscopo(linhaAna, eTav)).toBe(false);
  });

  it('a divisão soma as equipes dela, o recebedor com conta e o login sem conta', () => {
    expect(soma(e0800)).toBe(centavos(100 + 50.25 + 999.99 + 9056.69));
  });

  it('login sem conta casa sem olhar maiúscula; o ajuste da equipe vai junto', () => {
    expect(soma(eTav)).toBe(centavos(70 + 7780.63 + 40));
  });

  it('órfã de ninguém, login fora das divisões, contribuição e equipe sem divisão ficam em «Sem divisão»', () => {
    expect(soma(resto)).toBe(centavos(30 + 188 + 12.34 + 5));
  });

  it('linha carimbada em outro setor não entra em lugar nenhum', () => {
    for (const l of linhas.filter(x => x.setor_id === PLAY1)) {
      expect(linhaNoEscopo(l, e0800) || linhaNoEscopo(l, eTav) || linhaNoEscopo(l, resto)).toBe(false);
    }
  });
});

describe('divisões do setor — cadastro', () => {
  it('aponta o login que não tem conta', () => {
    expect(recebedoresSemCadastro(div0800, perfilPorUsuario)).toEqual(['pagueplay_play3']);
  });

  it('lista só as ativas do setor, na ordem', () => {
    const inativa = { ...divTav, id: 'x', nome: 'Velha', ativo: false };
    const outra = { ...divTav, id: 'y', setorId: PLAY1 };
    expect(divisoesDoSetor([divTav, inativa, outra, div0800], RECEPTIVO).map(d => d.id))
      .toEqual(['d-0800', 'd-tav']);
    expect(divisoesDoSetor([div0800], null)).toEqual([]);
  });

  it('acha a divisão da equipe', () => {
    expect(divisaoDaEquipe(divisoes, 'eq-tav')?.id).toBe('d-tav');
    expect(divisaoDaEquipe(divisoes, 'eq-sem')).toBeNull();
  });
});
