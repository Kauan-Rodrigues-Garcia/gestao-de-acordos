// src/pages/Analitico/linhaOperador.test.ts
import { describe, it, expect } from 'vitest';
import { deResumoAnalitico, deResumoDiario, fatiaDoGrupo } from './linhaOperador';
import type { AnaliticoDashboardLinha } from '@/lib/supabase';
import type { ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';
import type { ResumoOperadorDiario } from '@/pages/Analitico/Diario/helpers';

const ANA = '11111111-1111-1111-1111-111111111111';
const BRU = '22222222-2222-2222-2222-222222222222';

const equipeDe = (id: string) =>
  id === ANA
    ? { equipe_id: 'eq-1', equipe_nome: 'Play 1', setor_id: 's-1' }
    : { equipe_id: null, equipe_nome: 'Sem equipe', setor_id: 's-1' };

describe('fatiaDoGrupo', () => {
  it('devolve a proporção', () => {
    expect(fatiaDoGrupo(250, 1000)).toBeCloseTo(0.25);
  });
  it('grupo zerado não divide por zero', () => {
    expect(fatiaDoGrupo(0, 0)).toBe(0);
  });
  it('valor negativo de ajuste manual vira zero na barra', () => {
    expect(fatiaDoGrupo(-100, 1000)).toBe(0);
  });
  it('nunca passa de 1', () => {
    expect(fatiaDoGrupo(1500, 1000)).toBe(1);
  });
});

describe('deResumoAnalitico', () => {
  const resumos: ResumoOperadorAnalitico[] = [
    { operador_id: ANA, operador_usuario: 'ana.silva', operador_nome: 'Ana Silva',
      total_recebido: 1000, total_ho: 300, total_pagamentos: 4, ajuste_manual: 200 },
  ];
  const linhas: AnaliticoDashboardLinha[] = [
    { dia: '2026-09-01', operador_id: ANA, forma_pagamento: 'boleto_pix',
      forma_detalhe: 'Pix', status_tabulacao: 'tabulado', total: 600, total_ho: 180, qtd: 2 },
    { dia: '2026-09-02', operador_id: ANA, forma_pagamento: 'cartao',
      forma_detalhe: null, status_tabulacao: 'tabulado', total: 400, total_ho: 120, qtd: 2 },
    { dia: '2026-09-02', operador_id: BRU, forma_pagamento: 'cartao',
      forma_detalhe: null, status_tabulacao: 'tabulado', total: 999, total_ho: 0, qtd: 1 },
  ];

  it('preenche o contrato a partir do resumo', () => {
    const [linha] = deResumoAnalitico(resumos, linhas, equipeDe);
    expect(linha).toMatchObject({
      operador_id: ANA, usuario: 'ana.silva', nome: 'Ana Silva',
      equipeId: 'eq-1', equipeNome: 'Play 1',
      valor: 1000, ho: 300, pagamentos: 4, novos: 0, ajusteManual: 200,
    });
  });

  it('quebra por forma usando o rótulo do ERP, da maior para a menor', () => {
    const [linha] = deResumoAnalitico(resumos, linhas, equipeDe);
    expect(linha.porForma).toEqual([
      { rotulo: 'Pix',    valor: 600 },
      { rotulo: 'Cartão', valor: 400 },
    ]);
  });

  it('ignora as linhas de outro operador na quebra por forma', () => {
    const [linha] = deResumoAnalitico(resumos, linhas, equipeDe);
    expect(linha.porForma.reduce((s, f) => s + f.valor, 0)).toBe(1000);
  });

  it('operador sem linhas no dashboard fica sem quebra, não quebra', () => {
    const [linha] = deResumoAnalitico(resumos, [], equipeDe);
    expect(linha.porForma).toEqual([]);
  });
});

describe('deResumoDiario', () => {
  const resumos: ResumoOperadorDiario[] = [
    { operadorId: BRU, usuario: 'bruno.lima', nome: 'Bruno Lima',
      total: 900, pix: 500, boleto: 300, cartao: 100,
      nAcordos: 6, nPagamentos: 8, novos: 3 },
  ];

  it('preenche o contrato e marca HO como ausente', () => {
    const [linha] = deResumoDiario(resumos, equipeDe);
    expect(linha).toMatchObject({
      operador_id: BRU, usuario: 'bruno.lima', nome: 'Bruno Lima',
      equipeId: null, equipeNome: 'Sem equipe',
      valor: 900, ho: null, pagamentos: 8, novos: 3,
    });
  });

  it('quebra por forma sai dos três subtotais, sem os zerados', () => {
    const [linha] = deResumoDiario(
      [{ ...resumos[0], boleto: 0 }], equipeDe,
    );
    expect(linha.porForma).toEqual([
      { rotulo: 'Pix',    valor: 500 },
      { rotulo: 'Cartão', valor: 100 },
    ]);
  });
});
