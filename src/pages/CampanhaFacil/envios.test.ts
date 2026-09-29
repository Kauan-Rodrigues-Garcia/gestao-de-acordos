import { describe, it, expect } from 'vitest';
import { CampaignCore, type CampaignItem } from './lib/campaign-core';
import { CampaignXlsx } from './lib/xlsx-export';
import { repartirPorOperador, repartirRepasse, linhaDoItem, itemDaLinha, type LinhaEnvio } from './envios';
import {
  envioCampanhaDaNotificacao, rotaDoEnvioCampanha, rotaDaNotificacao,
} from '@/lib/notificacoes-rota';

const ANA = { id: 'id-ana', nome: 'Ana' };
const BIA = { id: 'id-bia', nome: 'Bia' };
/** Homônima da Ana — o rodízio por nome juntaria as duas. */
const ANA2 = { id: 'id-ana-2', nome: 'Ana' };

function campanha(qtd: number, ids: string[]): CampaignItem[] {
  const records = Array.from({ length: qtd }, (_, i) => ({
    rowNumber: i + 2,
    values: { NOME: `Cliente ${i}`, CPF: '', CONTRATO: `C${i}`, TELEFONE: '18999999999' },
    normalized: { nome: `Cliente ${i}`, contrato: `C${i}`, telefone: '18999999999' },
  }));
  return CampaignCore.buildCampaign(records, { senders: ids, template: 'Olá {{primeiro_nome}}' });
}

describe('repartirPorOperador', () => {
  it('divide em rodízio pelos ids e grava o nome em «Encaminhada por»', () => {
    const partes = repartirPorOperador(campanha(5, [ANA.id, BIA.id]), [ANA, BIA]);
    expect(partes.map(p => [p.operador.id, p.linhas.length])).toEqual([[ANA.id, 3], [BIA.id, 2]]);
    expect(partes[0].linhas.every(l => l.sender === 'Ana')).toBe(true);
    expect(partes[1].linhas.every(l => l.sender === 'Bia')).toBe(true);
  });

  it('homônimos continuam sendo duas pessoas', () => {
    const partes = repartirPorOperador(campanha(4, [ANA.id, ANA2.id]), [ANA, ANA2]);
    expect(partes).toHaveLength(2);
    expect(partes.map(p => p.linhas.length)).toEqual([2, 2]);
  });

  it('quem não recebeu linha nenhuma não ganha envio vazio', () => {
    const partes = repartirPorOperador(campanha(1, [ANA.id, BIA.id]), [ANA, BIA]);
    expect(partes.map(p => p.operador.id)).toEqual([ANA.id]);
  });

  it('não leva a linha crua do relatório', () => {
    const [parte] = repartirPorOperador(campanha(1, [ANA.id]), [ANA]);
    expect(parte.linhas[0]).not.toHaveProperty('source');
  });
});

describe('repartirRepasse', () => {
  const linhas = [1, 2, 3].map(n => ({ ...linhaDoItem(campanha(1, ['x'])[0]), rowNumber: n, sender: 'Faltou' }));

  it('um recebedor leva tudo, com o nome dele', () => {
    const [p, ...resto] = repartirRepasse(linhas, [BIA]);
    expect(resto).toEqual([]);
    expect(p.linhas.map(l => [l.rowNumber, l.sender])).toEqual([[1, 'Bia'], [2, 'Bia'], [3, 'Bia']]);
  });

  it('vários dividem em rodízio', () => {
    const partes = repartirRepasse(linhas, [ANA, BIA]);
    expect(partes.map(p => p.linhas.map(l => l.rowNumber))).toEqual([[1, 3], [2]]);
  });

  it('sem recebedor não repassa', () => {
    expect(repartirRepasse(linhas, [])).toEqual([]);
  });
});

describe('a linha gravada remonta o Excel', () => {
  it('itemDaLinha gera planilha válida', () => {
    const [parte] = repartirPorOperador(campanha(3, [ANA.id]), [ANA]);
    // Ida e volta pelo JSON, como no banco.
    const doBanco = JSON.parse(JSON.stringify(parte.linhas)) as LinhaEnvio[];
    const bytes = CampaignXlsx.createWorkbook(doBanco.map(itemDaLinha));
    expect(CampaignXlsx.isValidWorkbook(bytes)).toBe(true);
  });

  it('linha sem `issues` não quebra o escritor', () => {
    const [parte] = repartirPorOperador(campanha(1, [ANA.id]), [ANA]);
    const { issues: _fora, ...semIssues } = parte.linhas[0];
    const bytes = CampaignXlsx.createWorkbook([itemDaLinha(semIssues as LinhaEnvio)]);
    expect(CampaignXlsx.isValidWorkbook(bytes)).toBe(true);
  });
});

describe('rota da notificação de campanha', () => {
  const id = '0b7c2a4e-1d2f-4a6b-9c8d-7e6f5a4b3c2d';

  it('ida e volta do id', () => {
    expect(envioCampanhaDaNotificacao({ rota: rotaDoEnvioCampanha(id) })).toBe(id);
  });

  it('recusa o que não é UUID depois do prefixo', () => {
    expect(envioCampanhaDaNotificacao({ rota: '/campanha-facil/envio/../admin' })).toBeNull();
    expect(envioCampanhaDaNotificacao({ rota: `/campanha-facil/envio/${id}/x` })).toBeNull();
    expect(envioCampanhaDaNotificacao({ rota: '/acordos' })).toBeNull();
    expect(envioCampanhaDaNotificacao({ rota: null })).toBeNull();
  });

  it('não navega: o caminho não é página', () => {
    // Título com «mensagem» cairia no palpite de Solicitações se a rota não
    // fosse barrada antes.
    const n = { titulo: 'Campanha pronta — MENSAGEM DE PREVENTIVO', rota: rotaDoEnvioCampanha(id), acordo_id: null };
    expect(rotaDaNotificacao(n, false)).toBeNull();
  });
});
