import { describe, it, expect } from 'vitest';
import { CampaignCore, type CampaignItem } from './lib/campaign-core';
import { casaNome, numeroWhatsApp, repartirPorOperador, repartirRepasse } from './envios';
import { rotaDaCampanhaWhatsapp, rotaDaNotificacao } from '@/lib/notificacoes-rota';

const ANA = { id: 'id-ana', nome: 'Ana' };
const BIA = { id: 'id-bia', nome: 'Bia' };
/** Homônima da Ana — o rodízio por nome juntaria as duas. */
const ANA2 = { id: 'id-ana-2', nome: 'Ana' };

function campanha(qtd: number, ids: string[]): CampaignItem[] {
  const records = Array.from({ length: qtd }, (_, i) => ({
    rowNumber: i + 2,
    values: { Nome: `Cliente ${i}`, CPF: '123', Contrato: `C${i}`, 'Whats Titular': '18999999999' },
    // As chaves como `normalizeHeader` deixa (campaign-core).
    normalized: { NOME: `Cliente ${i}`, CPF: '123', CONTRATO: `C${i}`, WHATSTITULAR: '18999999999' },
  }));
  return CampaignCore.buildCampaign(records, { senders: ids, template: 'Olá {{primeiro_nome}}' });
}

describe('repartirPorOperador', () => {
  it('divide em rodízio pelos ids, com a ordem da campanha inteira', () => {
    const partes = repartirPorOperador(campanha(5, [ANA.id, BIA.id]), [ANA, BIA]);
    expect(partes.map(p => [p.operador.id, p.contatos.map(c => c.ordem)])).toEqual([
      [ANA.id, [1, 3, 5]], [BIA.id, [2, 4]],
    ]);
  });

  it('homônimos continuam sendo duas pessoas', () => {
    const partes = repartirPorOperador(campanha(4, [ANA.id, ANA2.id]), [ANA, ANA2]);
    expect(partes.map(p => p.contatos.length)).toEqual([2, 2]);
  });

  it('quem não recebeu nada não ganha campanha vazia', () => {
    const partes = repartirPorOperador(campanha(1, [ANA.id, BIA.id]), [ANA, BIA]);
    expect(partes.map(p => p.operador.id)).toEqual([ANA.id]);
  });

  it('leva a mensagem pronta e o número do WhatsApp; CPF não vai', () => {
    const [{ contatos: [c] }] = repartirPorOperador(campanha(1, [ANA.id]), [ANA]);
    expect(c).toMatchObject({ nome: 'Cliente 0', contrato: 'C0', whatsapp: '5518999999999', mensagem: 'Olá Cliente' });
    expect(c).not.toHaveProperty('cpf');
    expect(c.pendencias.some(p => /encaminhar/i.test(p))).toBe(false);
  });
});

describe('numeroWhatsApp', () => {
  it('10 ou 11 dígitos ganham o 55; 12 ou 13 já têm; o resto não é número', () => {
    expect(numeroWhatsApp('(18) 99999-9999')).toBe('5518999999999');
    expect(numeroWhatsApp('1833334444')).toBe('551833334444');
    expect(numeroWhatsApp('5518999999999')).toBe('5518999999999');
    expect(numeroWhatsApp('9999')).toBeNull();
    expect(numeroWhatsApp(null)).toBeNull();
  });
});

describe('repartirRepasse', () => {
  const contatos = [1, 2, 3].map(ordem => ({ ordem }));

  it('um recebedor leva tudo', () => {
    const [p, ...resto] = repartirRepasse(contatos, [BIA]);
    expect(resto).toEqual([]);
    expect(p.contatos.map(c => c.ordem)).toEqual([1, 2, 3]);
  });

  it('vários dividem em rodízio', () => {
    expect(repartirRepasse(contatos, [ANA, BIA]).map(p => p.contatos.map(c => c.ordem))).toEqual([[1, 3], [2]]);
  });

  it('sem recebedor não repassa', () => {
    expect(repartirRepasse(contatos, [])).toEqual([]);
  });
});

describe('busca de operador', () => {
  it('sem acento e sem caixa', () => {
    expect(casaNome('JOÃO PEREIRA', 'joao')).toBe(true);
    expect(casaNome('Maria', 'per')).toBe(false);
    expect(casaNome('Maria', '  ')).toBe(true);
  });
});

describe('rota da notificação de campanha', () => {
  const id = '0b7c2a4e-1d2f-4a6b-9c8d-7e6f5a4b3c2d';

  it('leva à aba, já na campanha', () => {
    const n = { titulo: 'Campanha de WhatsApp pronta', rota: rotaDaCampanhaWhatsapp(id), acordo_id: null };
    expect(rotaDaNotificacao(n, false)).toBe(`/campanhas-whatsapp?envio=${id}`);
  });

  it('a notificação antiga (baixar planilha) também leva à aba', () => {
    const n = { titulo: 'Campanha pronta — MENSAGEM', rota: `/campanha-facil/envio/${id}`, acordo_id: null };
    expect(rotaDaNotificacao(n, false)).toBe(`/campanhas-whatsapp?envio=${id}`);
    expect(rotaDaNotificacao({ ...n, rota: '/campanha-facil/envio/../admin' }, false)).toBe('/campanhas-whatsapp');
  });
});
