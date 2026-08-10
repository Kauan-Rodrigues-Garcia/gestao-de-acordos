/**
 * escopo.test.ts — para quem a comemoração explode.
 *
 * Errar aqui é a comemoração de um setor aparecendo na tela de outro, ou pior:
 * o líder montando a festa e não vendo ela acontecer.
 */
import { describe, it, expect } from 'vitest';
import { deveExplodir } from './escopo';

const SETOR_A = 's-a';
const SETOR_B = 's-b';
const EU      = 'u-eu';

describe('deveExplodir', () => {
  it('sou do setor alvo', () => {
    expect(deveExplodir({ setores_alvo: [SETOR_A] }, SETOR_A, EU)).toBe(true);
  });

  it('sou de outro setor', () => {
    expect(deveExplodir({ setores_alvo: [SETOR_A] }, SETOR_B, EU)).toBe(false);
  });

  it('quem criou vê sempre, mesmo de fora do setor', () => {
    // Diretoria e administração não têm setor próprio; sem esta regra montariam
    // a comemoração e não a veriam.
    expect(deveExplodir({ criado_por: EU, setores_alvo: [SETOR_A] }, SETOR_B, EU)).toBe(true);
  });

  it('quem criou vê mesmo sem setor nenhum', () => {
    expect(deveExplodir({ criado_por: EU, setores_alvo: [SETOR_A] }, null, EU)).toBe(true);
  });

  it('sem setor e sem ter criado, não vê', () => {
    expect(deveExplodir({ criado_por: 'outro', setores_alvo: [SETOR_A] }, null, EU)).toBe(false);
  });

  it('vários setores alvo: basta estar em um', () => {
    // É o caso do clone que respondeu "todos os setores" na pergunta da
    // 20260810a — antes dela, a união era automática.
    expect(deveExplodir({ setores_alvo: [SETOR_A, SETOR_B] }, SETOR_B, EU)).toBe(true);
  });

  it('setores_alvo vazio não explode para ninguém além de quem criou', () => {
    expect(deveExplodir({ setores_alvo: [] }, SETOR_A, EU)).toBe(false);
    expect(deveExplodir({ setores_alvo: [], criado_por: EU }, SETOR_A, EU)).toBe(true);
  });

  it('setores_alvo nulo não estoura', () => {
    expect(deveExplodir({ setores_alvo: null }, SETOR_A, EU)).toBe(false);
  });

  it('usuário deslogado não vê nada', () => {
    expect(deveExplodir({ criado_por: null, setores_alvo: [SETOR_A] }, null, null)).toBe(false);
  });
});

describe('meta de setor: empresa inteira (20260801a)', () => {
  it('explode para quem é de outro setor', () => {
    expect(deveExplodir(
      { empresa_inteira: true, setores_alvo: [SETOR_A] }, SETOR_B, EU,
    )).toBe(true);
  });

  it('explode até para quem não tem setor — diretoria, administração', () => {
    expect(deveExplodir({ empresa_inteira: true, setores_alvo: [] }, null, EU)).toBe(true);
  });

  it('quem barra outra empresa é a RLS, não isto: aqui só chega quem pode ler', () => {
    // Sem `empresa_inteira`, a mesma linha não explodiria para o setor B.
    expect(deveExplodir({ setores_alvo: [SETOR_A] }, SETOR_B, EU)).toBe(false);
  });

  it('false explícito se comporta como comemoração comum', () => {
    expect(deveExplodir(
      { empresa_inteira: false, setores_alvo: [SETOR_A] }, SETOR_B, EU,
    )).toBe(false);
  });
});

describe('exibir apenas para a equipe (20260810a)', () => {
  const EQ_1 = 'eq-1';
  const EQ_2 = 'eq-2';
  const OUTRO = 'u-outro';

  it('sou da equipe alvo', () => {
    expect(deveExplodir(
      { criado_por: OUTRO, setores_alvo: [SETOR_A], equipes_alvo: [EQ_1] },
      SETOR_A, EU, [EQ_1],
    )).toBe(true);
  });

  it('mesmo setor, outra equipe: não vê', () => {
    // É o ponto do recurso — antes dele, o setor inteiro via.
    expect(deveExplodir(
      { criado_por: OUTRO, setores_alvo: [SETOR_A], equipes_alvo: [EQ_1] },
      SETOR_A, EU, [EQ_2],
    )).toBe(false);
  });

  it('sem equipe nenhuma, não vê o que foi estreitado', () => {
    expect(deveExplodir(
      { criado_por: OUTRO, setores_alvo: [SETOR_A], equipes_alvo: [EQ_1] },
      SETOR_A, EU, [],
    )).toBe(false);
  });

  it('clone: basta uma das minhas equipes bater', () => {
    expect(deveExplodir(
      { criado_por: OUTRO, setores_alvo: [SETOR_A, SETOR_B], equipes_alvo: [EQ_2] },
      SETOR_A, EU, [EQ_1, EQ_2],
    )).toBe(true);
  });

  it('quem criou vê mesmo estreitado para outra equipe', () => {
    expect(deveExplodir(
      { criado_por: EU, setores_alvo: [SETOR_A], equipes_alvo: [EQ_1] },
      SETOR_B, EU, [EQ_2],
    )).toBe(true);
  });

  it('equipes_alvo vazio se comporta como antes: vale o setor', () => {
    // Toda comemoração anterior à migration cai aqui.
    expect(deveExplodir(
      { criado_por: OUTRO, setores_alvo: [SETOR_A], equipes_alvo: [] },
      SETOR_A, EU, [],
    )).toBe(true);
  });

  it('equipes_alvo nulo (banco sem a coluna) também vale o setor', () => {
    expect(deveExplodir(
      { criado_por: OUTRO, setores_alvo: [SETOR_A], equipes_alvo: null },
      SETOR_A, EU,
    )).toBe(true);
  });

  it('meta de setor ignora o recorte: é da empresa inteira', () => {
    expect(deveExplodir(
      { criado_por: OUTRO, empresa_inteira: true, equipes_alvo: [EQ_1] },
      SETOR_B, EU, [EQ_2],
    )).toBe(true);
  });
});
