/** Os textos do aviso de pagamento — spec §4 (corte, resumo, meta batida). */
import { describe, it, expect } from 'vitest';
import { faixasBatidas, montarAvisos, type ItemFila } from '../../../supabase/functions/enviar-push/texto';

const it_ = (id: number, valor: number, detalhe: string | null, cliente = 'MARIA SILVA', forma = 'boleto_pix', perfil = 'ana'): ItemFila =>
  ({ id, perfil_id: perfil, valor, forma_pagamento: forma, forma_detalhe: detalhe, nome_cliente: cliente });

const nbsp = (s: string) => s.replace(/\u00a0/g, ' ');

describe('montarAvisos', () => {
  it('até o corte: um aviso por pagamento, com forma, valor bruto e cliente abreviado', () => {
    const [r] = montarAvisos([it_(1, 350, 'Pix'), it_(2, 520, 'Boleto', 'JOAO SOUZA')], {}, 3, '2026-09');
    expect(r.avisos).toHaveLength(2);
    expect(r.avisos[0].titulo).toBe('💰 Pagamento recebido!');
    expect(nbsp(r.avisos[0].corpo)).toBe('Pix de R$ 350,00 · Maria S.');
    expect(nbsp(r.avisos[1].corpo)).toBe('Boleto de R$ 520,00 · Joao S.');
    expect(r.ids).toEqual([1, 2]);
  });

  it('acima do corte: um resumo com total, formas no plural e o recebido do mês', () => {
    const itens = [it_(1, 100, 'Pix'), it_(2, 200, 'Pix'), it_(3, 300, 'Pix'), it_(4, 400, 'Pix'), it_(5, 500, 'Boleto'), it_(6, 640, 'Boleto')];
    const [r] = montarAvisos(itens, { ana: { em_ho: false, antes: 36_280.5, depois: 38_420.5, degraus: [] } }, 3, '2026-09');
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].titulo).toBe('💰 Você recebeu 6 pagamentos!');
    expect(nbsp(r.avisos[0].corpo)).toBe('R$ 2.140,00 · 4 Pix, 2 boletos · no mês: R$ 38.420,50');
    expect(r.ids).toHaveLength(6);
  });

  it('PaguePlay sem detalhe: «Pix/Boleto»', () => {
    const [r] = montarAvisos([it_(1, 1000, null)], {}, 3, '2026-09');
    expect(nbsp(r.avisos[0].corpo)).toBe('Pix/Boleto de R$ 1.000,00 · Maria S.');
  });

  it('cruzou faixas no lote: um aviso de meta, só com a maior', () => {
    const [r] = montarAvisos([it_(1, 650, 'Pix')],
      { ana: { em_ho: false, antes: 900, depois: 1550, degraus: [1000, 1500, 2000] } }, 3, '2026-09');
    const meta = r.avisos.filter(a => a.titulo.startsWith('🎯'));
    expect(meta).toHaveLength(1);
    expect(meta[0].titulo).toBe('🎯 Você bateu a 2ª meta!');
    expect(meta[0].corpo).toBe('Toque para ver sua comissão');
    expect(meta[0].tag).toBe('meta:ana:2026-09:2');
  });

  it('não cruzou faixa: sem aviso de meta; sem meta cadastrada: também não', () => {
    const [a] = montarAvisos([it_(1, 50, 'Pix')], { ana: { em_ho: false, antes: 1100, depois: 1150, degraus: [1000, 1500] } }, 3, '2026-09');
    expect(a.avisos.some(x => x.titulo.startsWith('🎯'))).toBe(false);
    const [b] = montarAvisos([it_(1, 50, 'Pix')], { ana: { em_ho: false, antes: 0, depois: 50, degraus: [] } }, 3, '2026-09');
    expect(b.avisos.some(x => x.titulo.startsWith('🎯'))).toBe(false);
  });

  it('separa por pessoa', () => {
    const r = montarAvisos([it_(1, 10, 'Pix', 'A', 'boleto_pix', 'ana'), it_(2, 20, 'Pix', 'B', 'boleto_pix', 'bia')], {}, 3, '2026-09');
    expect(r.map(x => x.perfilId).sort()).toEqual(['ana', 'bia']);
  });
});

describe('faixasBatidas', () => {
  it('conta degraus alcançados', () => {
    expect(faixasBatidas(1550, [1000, 1500, 2000])).toBe(2);
    expect(faixasBatidas(999.99, [1000])).toBe(0);
    expect(faixasBatidas(1000, [1000])).toBe(1);
  });
});
