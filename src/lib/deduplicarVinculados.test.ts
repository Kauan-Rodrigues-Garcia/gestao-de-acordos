/**
 * deduplicarVinculados.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Testes da função pura que consolida pares Direto+Extra em acordos.
 *
 * Foco dos casos: cada ramo da função e os cenários que já causaram bugs
 * reais em produção (par sem chave, par entre mesmo operador, par com
 * mais de 2 entradas, etc).
 */
import { describe, it, expect } from 'vitest';
import { deduplicarVinculados, temVisaoAmpla } from './deduplicarVinculados';
import type { Acordo } from './supabase';

// Helper para montar um acordo mínimo sem poluir cada teste.
function mk(partial: Partial<Acordo>): Acordo {
  return {
    id: partial.id ?? 'a1',
    nome_cliente: partial.nome_cliente ?? 'Cliente X',
    nr_cliente: partial.nr_cliente ?? '',
    data_cadastro: '2026-04-20',
    vencimento: '2026-04-30',
    valor: 100,
    tipo: 'boleto',
    parcelas: 1,
    whatsapp: null,
    status: 'agendado',
    operador_id: partial.operador_id ?? 'op1',
    setor_id: null,
    empresa_id: partial.empresa_id ?? 'e1',
    observacoes: null,
    instituicao: partial.instituicao ?? null,
    tipo_vinculo: partial.tipo_vinculo ?? 'direto',
    vinculo_operador_id: partial.vinculo_operador_id ?? null,
    vinculo_operador_nome: partial.vinculo_operador_nome ?? null,
    criado_em: '2026-04-20T00:00:00Z',
    atualizado_em: '2026-04-20T00:00:00Z',
    ...partial,
  } as Acordo;
}

describe('temVisaoAmpla', () => {
  it('reconhece perfis com visão ampla', () => {
    for (const p of ['lider', 'administrador', 'super_admin', 'elite', 'gerencia', 'diretoria']) {
      expect(temVisaoAmpla(p)).toBe(true);
    }
  });

  it('rejeita operador comum e valores nulos', () => {
    expect(temVisaoAmpla('operador')).toBe(false);
    expect(temVisaoAmpla(null)).toBe(false);
    expect(temVisaoAmpla(undefined)).toBe(false);
    expect(temVisaoAmpla('')).toBe(false);
  });

  it('é case-insensitive', () => {
    expect(temVisaoAmpla('LIDER')).toBe(true);
    expect(temVisaoAmpla('Administrador')).toBe(true);
  });
});

describe('deduplicarVinculados', () => {
  it('retorna array vazio para entrada vazia ou nula', () => {
    expect(deduplicarVinculados([], true)).toEqual([]);
    expect(deduplicarVinculados([], false)).toEqual([]);
    // Teste defensivo: passando null (simulando valor runtime inesperado)
    expect(deduplicarVinculados(null as unknown as never, true)).toEqual([]);
  });

  it('preserva acordos sem chave (nr_cliente / instituicao vazio)', () => {
    // Bookplay usa nr_cliente; se vazio, nunca entra no dedup.
    const sem = mk({ id: 'a1', nr_cliente: '', tipo_vinculo: 'direto' });
    const out = deduplicarVinculados([sem], false);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('a1');
  });

  it('mantém grupos de tamanho 1 intactos', () => {
    const a = mk({ id: 'a1', nr_cliente: '123', tipo_vinculo: 'direto' });
    const out = deduplicarVinculados([a], false);
    expect(out).toHaveLength(1);
    expect((out[0] as { _vinculoDuplo?: boolean })._vinculoDuplo).toBeUndefined();
  });

  it('consolida par Direto+Extra em Bookplay (chave = nr_cliente)', () => {
    const direto = mk({
      id: 'D', nr_cliente: '999', operador_id: 'op-direto',
      tipo_vinculo: 'direto',
      vinculo_operador_id: 'op-extra', vinculo_operador_nome: 'Maria',
    });
    const extra = mk({
      id: 'E', nr_cliente: '999', operador_id: 'op-extra',
      tipo_vinculo: 'extra',
      vinculo_operador_id: 'op-direto', vinculo_operador_nome: 'João',
    });

    const out = deduplicarVinculados([direto, extra], false);
    expect(out).toHaveLength(1);
    const unico = out[0] as typeof out[0] & { _vinculoDuplo?: boolean; _acordoExtraId?: string };
    expect(unico.id).toBe('D');                  // o Direto é mantido
    expect(unico._vinculoDuplo).toBe(true);
    expect(unico._acordoExtraId).toBe('E');
    expect(unico._vinculoExtraOperadorId).toBe('op-extra');
  });

  it('consolida par Direto+Extra em PaguePlay (chave = instituicao)', () => {
    const direto = mk({
      id: 'D', instituicao: 'COREN-SP 12345', operador_id: 'op1',
      tipo_vinculo: 'direto',
    });
    const extra = mk({
      id: 'E', instituicao: 'COREN-SP 12345', operador_id: 'op2',
      tipo_vinculo: 'extra', vinculo_operador_nome: 'João',
    });

    const out = deduplicarVinculados([direto, extra], true);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('D');
  });

  it('NÃO consolida par quando os dois lados têm o mesmo operador (guarda defensiva)', () => {
    const a = mk({ id: 'A', nr_cliente: '1', operador_id: 'op1', tipo_vinculo: 'direto' });
    const b = mk({ id: 'B', nr_cliente: '1', operador_id: 'op1', tipo_vinculo: 'extra' });
    const out = deduplicarVinculados([a, b], false);
    // Ambos permanecem porque não há dois operadores diferentes.
    expect(out).toHaveLength(2);
  });

  it('NÃO consolida quando o grupo tem só "direto" duplicado (estado inconsistente)', () => {
    const a = mk({ id: 'A', nr_cliente: '5', operador_id: 'op1', tipo_vinculo: 'direto' });
    const b = mk({ id: 'B', nr_cliente: '5', operador_id: 'op2', tipo_vinculo: 'direto' });
    const out = deduplicarVinculados([a, b], false);
    // Sem EXTRA no grupo, a função devolve todos — importante para o usuário
    // enxergar o problema de dados em vez de perder silenciosamente um acordo.
    expect(out).toHaveLength(2);
  });

  it('com 3+ itens no grupo, consolida o par e anexa o restante', () => {
    const d = mk({ id: 'D', nr_cliente: '7', operador_id: 'op1', tipo_vinculo: 'direto' });
    const e = mk({ id: 'E', nr_cliente: '7', operador_id: 'op2', tipo_vinculo: 'extra' });
    const extra2 = mk({ id: 'E2', nr_cliente: '7', operador_id: 'op3', tipo_vinculo: 'extra' });
    const out = deduplicarVinculados([d, e, extra2], false);
    // 1 par consolidado + 1 remanescente = 2 saídas
    expect(out).toHaveLength(2);
    expect(out.map(o => o.id).sort()).toEqual(['D', 'E2']);
  });

  it('acordos de empresas diferentes NÃO são pareados', () => {
    const a = mk({ id: 'A', nr_cliente: '10', empresa_id: 'emp1', tipo_vinculo: 'direto' });
    const b = mk({ id: 'B', nr_cliente: '10', empresa_id: 'emp2', tipo_vinculo: 'extra' });
    const out = deduplicarVinculados([a, b], false);
    expect(out).toHaveLength(2); // chaves distintas por empresa
  });

  it('ignora whitespace ao agrupar (trim na chave)', () => {
    const a = mk({ id: 'A', nr_cliente: ' 77 ', operador_id: 'op1', tipo_vinculo: 'direto' });
    const b = mk({ id: 'B', nr_cliente: '77', operador_id: 'op2', tipo_vinculo: 'extra' });
    const out = deduplicarVinculados([a, b], false);
    expect(out).toHaveLength(1);
  });
});
