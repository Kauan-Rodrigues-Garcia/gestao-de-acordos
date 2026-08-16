/**
 * A janela dos cinco cliques, e o distintivo de quem já descobriu.
 *
 * A regra dos cliques parece trivial e tem três armadilhas: um clique não pode
 * abrir, cinco cliques lentos não podem abrir, e a janela precisa recomeçar em
 * vez de travar quem clicou devagar.
 *
 * O distintivo tem uma armadilha só, mas pior: ele pertence à PESSOA, e uma
 * falha de rede não pode tirar dela algo que já foi conquistado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  proximoEstado, JANELA_MS, CLIQUES_NECESSARIOS, DURACAO_ESCURECIMENTO_MS,
  useDescobriuCreatorsLab, esquecerDescobertaRemota, CHAVE_DESCOBERTO,
} from '../useEasterEggCriadores';

const jaDescobriuOLab = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
vi.mock('@/services/creatorsLab.service', () => ({ jaDescobriuOLab }));

/** Simula uma sequência de cliques com intervalos dados, em ms. */
function sequencia(intervalos: number[]): { cliques: number; abriu: boolean } {
  let cliques = 0;
  let primeiro: number | null = null;
  let agora = 1_000_000;
  let abriu = false;

  for (const dt of intervalos) {
    agora += dt;
    const r = proximoEstado(cliques, primeiro, agora);
    cliques = r.cliques;
    primeiro = r.primeiroEm;
    if (r.abrir) { abriu = true; break; }
  }
  return { cliques, abriu };
}

describe('proximoEstado', () => {
  it('o primeiro clique começa a contagem', () => {
    const r = proximoEstado(0, null, 5000);
    expect(r).toEqual({ cliques: 1, primeiroEm: 5000, abrir: false });
  });

  it('um clique não abre nada', () => {
    expect(sequencia([0]).abriu).toBe(false);
  });

  it('quatro cliques rápidos não abrem', () => {
    expect(sequencia([0, 100, 100, 100]).abriu).toBe(false);
  });

  it('cinco cliques rápidos abrem', () => {
    expect(sequencia([0, 100, 100, 100, 100]).abriu).toBe(true);
  });

  it('exatamente no limite da janela ainda abre', () => {
    const passo = JANELA_MS / (CLIQUES_NECESSARIOS - 1);
    expect(sequencia([0, passo, passo, passo, passo]).abriu).toBe(true);
  });

  /** O caso que evita abertura acidental de quem só clica no logo às vezes. */
  it('cinco cliques lentos NÃO abrem', () => {
    expect(sequencia([0, 1000, 1000, 1000, 1000]).abriu).toBe(false);
  });

  it('clique muito depois recomeça a contagem em 1', () => {
    const r = proximoEstado(4, 1000, 1000 + JANELA_MS + 1);
    expect(r.cliques).toBe(1);
    expect(r.abrir).toBe(false);
  });

  /**
   * Quem clicou devagar não pode ficar preso: depois de recomeçar, cinco
   * cliques rápidos ainda funcionam.
   */
  it('depois de expirar, uma nova rajada abre normalmente', () => {
    let cliques = 0;
    let primeiro: number | null = null;
    let agora = 0;

    // Rajada lenta, que expira.
    for (const dt of [0, 2000, 2000]) {
      agora += dt;
      const r = proximoEstado(cliques, primeiro, agora);
      cliques = r.cliques; primeiro = r.primeiroEm;
    }
    // Agora uma rajada rápida.
    let abriu = false;
    for (const dt of [0, 80, 80, 80, 80]) {
      agora += dt;
      const r = proximoEstado(cliques, primeiro, agora);
      cliques = r.cliques; primeiro = r.primeiroEm;
      if (r.abrir) { abriu = true; break; }
    }
    expect(abriu).toBe(true);
  });

  it('a janela conta do PRIMEIRO clique, não do último', () => {
    // Quatro cliques colados no fim da janela: o quinto já está fora.
    let cliques = 0;
    let primeiro: number | null = null;
    let agora = 0;
    for (const dt of [0, 10, 10, 10]) {
      agora += dt;
      const r = proximoEstado(cliques, primeiro, agora);
      cliques = r.cliques; primeiro = r.primeiroEm;
    }
    agora += JANELA_MS;                       // muito depois do primeiro
    const r = proximoEstado(cliques, primeiro, agora);
    expect(r.abrir).toBe(false);
    expect(r.cliques).toBe(1);
  });
});

describe('escurecimento antes de abrir', () => {
  /**
   * O quinto clique não joga a pessoa direto na abertura: a tela apaga antes.
   * O `Layout` usa esta constante tanto na animação quanto no atraso da
   * navegação, então ela precisa ser um tempo de transição de verdade — nem
   * instantânea (vira corte seco), nem longa a ponto de parecer travamento.
   */
  it('dura o suficiente para ser passagem, e pouco para não parecer travada', () => {
    expect(DURACAO_ESCURECIMENTO_MS).toBeGreaterThanOrEqual(700);
    expect(DURACAO_ESCURECIMENTO_MS).toBeLessThanOrEqual(2000);
  });
});

/**
 * Até 16/08/2026 o distintivo morava só no `localStorage`, o que o prendia ao
 * NAVEGADOR: quem descobria o Lab em casa chegava no trabalho sem a marca, e
 * limpar cache apagava a descoberta. Agora a resposta vem do banco.
 */
describe('useDescobriuCreatorsLab', () => {
  beforeEach(() => {
    esquecerDescobertaRemota();
    localStorage.clear();
    jaDescobriuOLab.mockReset();
  });

  afterEach(() => { localStorage.clear(); });

  it('sem nada em lugar nenhum, não há distintivo', async () => {
    jaDescobriuOLab.mockResolvedValue(false);
    const { result } = renderHook(() => useDescobriuCreatorsLab());
    expect(result.current).toBe(false);
    await waitFor(() => expect(jaDescobriuOLab).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('o banco sabendo, o distintivo aparece mesmo em navegador limpo', async () => {
    jaDescobriuOLab.mockResolvedValue(true);
    const { result } = renderHook(() => useDescobriuCreatorsLab());
    await waitFor(() => expect(result.current).toBe(true));
    // E fica em cache local, para o próximo carregamento não piscar.
    expect(localStorage.getItem(CHAVE_DESCOBERTO)).toBe('true');
  });

  /**
   * O caso que importa: `false` do servidor significa "não sei" — tabela ainda
   * não migrada, sessão expirada, rede caída. Dúvida não tira de ninguém um
   * troféu já conquistado.
   */
  it('resposta negativa do servidor NÃO apaga o distintivo local', async () => {
    localStorage.setItem(CHAVE_DESCOBERTO, 'true');
    jaDescobriuOLab.mockResolvedValue(false);

    const { result } = renderHook(() => useDescobriuCreatorsLab());
    expect(result.current).toBe(true);
    await waitFor(() => expect(jaDescobriuOLab).toHaveBeenCalled());
    expect(result.current).toBe(true);
  });

  it('promessa rejeitada não derruba nada e mantém o que havia', async () => {
    localStorage.setItem(CHAVE_DESCOBERTO, 'true');
    jaDescobriuOLab.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useDescobriuCreatorsLab());
    await waitFor(() => expect(jaDescobriuOLab).toHaveBeenCalled());
    expect(result.current).toBe(true);
  });

  /**
   * O `Layout` monta em toda tela do Gestão. Sem a memória de módulo, trocar
   * de aba seis vezes viraria seis consultas para responder a mesma pergunta
   * de enfeite.
   */
  it('consulta o banco uma vez só, por mais que monte', async () => {
    jaDescobriuOLab.mockResolvedValue(true);

    const a = renderHook(() => useDescobriuCreatorsLab());
    const b = renderHook(() => useDescobriuCreatorsLab());
    await waitFor(() => expect(a.result.current).toBe(true));
    await waitFor(() => expect(b.result.current).toBe(true));

    a.unmount();
    renderHook(() => useDescobriuCreatorsLab());

    expect(jaDescobriuOLab).toHaveBeenCalledTimes(1);
  });
});
