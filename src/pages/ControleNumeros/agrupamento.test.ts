/**
 * O Controle de Números agrupado por situação — pedido de 14/09/2026:
 * «todos os aguardando 24 horas ficam organizados juntos, em aquecimento a mesma
 * coisa, e assim por diante».
 */
import { describe, it, expect } from 'vitest';
import type { CelularComNumeros } from '@/hooks/useControleNumeros';
import type { CelularRow, NumeroRow } from '@/services/numeros/numeros.service';
import type { Situacao } from '@/services/numeros/numerosRegras';
import { agruparPorSituacao, TODOS } from './agrupamento';

function celular(id: string, identificacao: string): CelularRow {
  return {
    id, empresa_id: 'e1', identificacao, modelo: null, setor_id: 's1', ativo: true,
    criado_por: null, criado_por_nome: null, criado_em: '', atualizado_em: '',
  };
}

function numero(id: string, celularId: string, situacao: Situacao, posse: 'nucleo' | 'setor' = 'nucleo'): NumeroRow {
  return {
    id, empresa_id: 'e1', celular_id: celularId, setor_id: 's1', numero: `55119${id}`,
    situacao, posse, operador_id: null, motivo_retorno: null, observacao_retorno: null,
    etiquetas: [], tratamento: null, criado_por: null,
  } as NumeroRow;
}

function aparelho(c: CelularRow, numeros: NumeroRow[]): CelularComNumeros {
  return { celular: c, numeros, vagas: 6 - numeros.length, cheio: numeros.length >= 6 };
}

const c10 = celular('c10', 'Celular 10');
const c02 = celular('c02', 'Celular 02');

const APARELHOS = [
  aparelho(c10, [
    numero('1', 'c10', 'aguardando_24h'),
    numero('2', 'c10', 'em_aquecimento'),
    numero('3', 'c10', 'ativo', 'setor'),
  ]),
  aparelho(c02, [
    numero('4', 'c02', 'aguardando_24h'),
    numero('5', 'c02', 'em_aquecimento'),
  ]),
];

const SEM_FILTRO = { celular: TODOS, situacao: TODOS, posse: TODOS };

describe('agruparPorSituacao', () => {
  it('junta os números da mesma situação, venham de qual aparelho vierem', () => {
    const grupos = agruparPorSituacao(APARELHOS, SEM_FILTRO);
    const aguardando = grupos.find(g => g.situacao === 'aguardando_24h')!;
    expect(aguardando.rotulo).toBe('Aguardando 24 horas');
    expect(aguardando.itens.map(i => i.numero.id)).toEqual(['4', '1']);
  });

  it('segue a ordem das situações do filtro e omite situação sem número', () => {
    const grupos = agruparPorSituacao(APARELHOS, SEM_FILTRO);
    expect(grupos.map(g => g.situacao)).toEqual(['em_aquecimento', 'ativo', 'aguardando_24h']);
  });

  it('dentro do grupo, ordena pelo nome do aparelho (Celular 02 antes do 10)', () => {
    const grupos = agruparPorSituacao(APARELHOS, SEM_FILTRO);
    const aquecimento = grupos.find(g => g.situacao === 'em_aquecimento')!;
    expect(aquecimento.itens.map(i => i.aparelho.celular.identificacao)).toEqual(['Celular 02', 'Celular 10']);
  });

  it('cada item leva o aparelho junto — as ações da linha precisam dele', () => {
    const grupos = agruparPorSituacao(APARELHOS, SEM_FILTRO);
    const ativo = grupos.find(g => g.situacao === 'ativo')!;
    expect(ativo.itens[0].aparelho.celular.id).toBe('c10');
    expect(ativo.lancados).toBe(1);
  });

  it('respeita os três filtros', () => {
    expect(agruparPorSituacao(APARELHOS, { ...SEM_FILTRO, celular: 'c02' })
      .flatMap(g => g.itens.map(i => i.numero.id))).toEqual(['5', '4']);
    expect(agruparPorSituacao(APARELHOS, { ...SEM_FILTRO, situacao: 'em_aquecimento' })
      .map(g => g.situacao)).toEqual(['em_aquecimento']);
    expect(agruparPorSituacao(APARELHOS, { ...SEM_FILTRO, posse: 'setor' })
      .flatMap(g => g.itens.map(i => i.numero.id))).toEqual(['3']);
  });

  it('nada no recorte, lista vazia', () => {
    expect(agruparPorSituacao([], SEM_FILTRO)).toEqual([]);
  });
});
