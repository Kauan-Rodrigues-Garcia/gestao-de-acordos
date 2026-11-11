/**
 * Trocar o desconto ao editar a campanha já lançada (11/11/2026).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CampaignCore, type Discounts, type RawRecord } from './lib/campaign-core';
import { repartirPorOperador } from './envios';
import {
  baseDoItem, descontosDasVariaveis, descontosIguais, eVariavelDeValor, motivoSemDesconto, recalcularPendentes,
  type PendenteComBase,
} from './descontoDaEdicao';

function registro(rowNumber: number, v: { parcelas: string; valor: string; aberto: string; atualizado: string }): RawRecord {
  const values: Record<string, string> = {
    Nome: 'MARIA DA SILVA', CPF: '123.456.789-00', Contrato: String(rowNumber), 'Parcelas em atraso': v.parcelas,
    Protesto: '0', Valor: v.valor, 'Valor Aberto': v.aberto, 'Valor Atualizado': v.atualizado, 'Tp. Venda': 'BOOK',
    'Whats Titular': '18999999999',
  };
  const normalized = Object.fromEntries(Object.entries(values).map(([k, x]) => [CampaignCore.normalizeHeader(k), x]));
  return { rowNumber, values, normalized, sourceType: 'report-247', financialDataAvailable: true };
}

const REGISTROS = [
  registro(2, { parcelas: '3', valor: '300', aberto: '1.234,56', atualizado: '1.500,10' }),
  registro(3, { parcelas: '1', valor: '89,9', aberto: '987,65', atualizado: '1000' }),
  registro(4, { parcelas: '12', valor: '2.345,67', aberto: '12.345,67', atualizado: '15.000,01' }),
];
const ANA = { id: 'ana', nome: 'Ana' };
const MODELO = 'Olá {{primeiro_nome}}, quitação {{quitacao}} ({{pct_quitacao}}), junção {{juncao}}, Pix {{pix_automatico_desconto_21x}}.';
const D1: Discounts = { ...CampaignCore.DEFAULT_DISCOUNTS };
const D2: Discounts = { overdue: 10, settlement: 42.5, interest: 3, bundle: 20, annual: 30, pix_automatico: 8, cartao_recorrente: 12 };

function contatos(d: Discounts, modelo = MODELO) {
  const itens = CampaignCore.buildCampaign(REGISTROS, { discounts: d, senders: [ANA.id], template: modelo });
  return repartirPorOperador(itens, [ANA], d)[0].contatos;
}

function pendentes(d: Discounts, modelo = MODELO): PendenteComBase[] {
  return contatos(d, modelo).map((c, i) => ({ id: `c${i}`, variaveis: c.variaveis, base: c.base }));
}

describe('a base guardada na liberação', () => {
  it('leva só os números da conta — sem nome, sem CPF', () => {
    const [c] = contatos(D1);
    expect(c.base).toEqual({ parcelas: 3, valor: 300, valor_aberto: 1234.56, valor_atualizado: 1500.1 });
  });

  it('relatório sem valores não tem base', () => {
    const item = CampaignCore.deriveRecord({ ...REGISTROS[0], sourceType: 'report-245', financialDataAvailable: false });
    expect(baseDoItem(item)).toBeNull();
  });
});

describe('recalcular os pendentes com o desconto novo', () => {
  it('sai igual à campanha montada direto com o desconto novo, em toda variável', () => {
    const antes = pendentes(D1);
    const { novas, travadas } = recalcularPendentes(antes, MODELO, D2, { recalcular: false, manter: false });
    expect(travadas).toBe(0);
    const direto = contatos(D2);
    antes.forEach((p, i) => {
      expect({ ...p.variaveis, ...novas[i].variaveis }).toEqual(direto[i].variaveis);
    });
    // E muda de verdade.
    expect(novas[0].variaveis.quitacao).not.toBe(antes[0].variaveis?.quitacao);
    expect(novas[0].variaveis.pct_quitacao).toBe('42,5%');
  });

  it('manda ao banco só as variáveis de valor e de %', () => {
    const { novas } = recalcularPendentes(pendentes(D1), MODELO, D2, { recalcular: false, manter: false });
    const chaves = Object.keys(novas[0].variaveis);
    expect(chaves).toContain('quitacao');
    expect(chaves).toContain('pct_pix_automatico');
    for (const k of ['nome', 'primeiro_nome', 'cpf', 'contrato', 'empresa', 'telefone', 'link']) expect(chaves).not.toContain(k);
  });

  it('toda variável do core é de valor ou de identificação — nenhuma fica sem dono', () => {
    const IDENTIFICACAO = new Set(['nome', 'primeiro_nome', 'cpf', 'contrato', 'protocolo', 'empresa', 'atendimento', 'telefone', 'link']);
    const mailing = new Set(CampaignCore.MAILING_FIELDS.map((f) => f.key as string));
    const vars = CampaignCore.variablesFor(CampaignCore.deriveRecord(REGISTROS[0], D1), D1);
    for (const k of Object.keys(vars)) {
      expect(IDENTIFICACAO.has(k) || mailing.has(k) ? !eVariavelDeValor(k) : eVariavelDeValor(k)).toBe(true);
    }
  });

  it('a parcela mínima vale: o % novo que derruba a parcela trava, e o recálculo conserta a que tem conserto', () => {
    const modelo = 'Junção em {{juncao_12x}}.';
    const antes = pendentes(D1, modelo);
    // Junção com 90%: 89,90 × 2 × 0,1 = R$ 18 → 12x de R$ 2 (abaixo de R$ 30, sem conserto);
    // as outras duas também caem, e a de 12 parcelas tem conserto.
    const forte: Discounts = { ...D1, bundle: 90 };
    const r = recalcularPendentes(antes, modelo, forte, { recalcular: false, manter: false });
    expect(r.comParcelaBaixa).toBeGreaterThan(0);
    expect(r.travadas).toBe(r.comParcelaBaixa);
    const consertado = recalcularPendentes(antes, modelo, forte, { recalcular: true, manter: false });
    expect(consertado.travadas).toBeLessThan(r.travadas);
    // O consertado sai em menos vezes («6x de R$ 31,00»), não mais em 12x.
    expect(consertado.novas.some((x) => /^\d+x de/.test(x.variaveis.juncao_12x) && !/^12x/.test(x.variaveis.juncao_12x))).toBe(true);
    // Junção não é rígida: manter libera.
    expect(recalcularPendentes(antes, modelo, forte, { recalcular: true, manter: true }).travadas).toBe(0);
  });
});

describe('os % da campanha', () => {
  it('saem das variáveis da mensagem, com decimal', () => {
    const [p] = pendentes(D2);
    expect(descontosDasVariaveis(p.variaveis)).toEqual(D2);
    expect(descontosIguais(descontosDasVariaveis(p.variaveis) as Discounts, D2)).toBe(true);
  });

  it('faltou algum % (campanha antiga): null', () => {
    const [p] = pendentes(D1);
    const { pct_cartao_recorrente: _fora, ...sem } = p.variaveis as Record<string, string>;
    expect(descontosDasVariaveis(sem)).toBeNull();
  });
});

describe('quando o desconto não pode mudar', () => {
  it('campanha sem base (liberada antes) e campanha sem pendente', () => {
    const lista = pendentes(D1);
    expect(motivoSemDesconto(lista)).toBeNull();
    expect(motivoSemDesconto([{ ...lista[0], base: null }, ...lista.slice(1)])).toMatch(/antes de guardar/);
    expect(motivoSemDesconto([])).toMatch(/Não há mensagem pendente/);
  });
});

describe('migration 20261111120000', () => {
  const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
  const arquivo = fs.readdirSync(MIGRATIONS).find((f) => f.endsWith('_campanha_editar_desconto.sql'));
  const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
    .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

  it('guarda a base e troca a assinatura sem deixar sobrecarga', () => {
    expect(LISO).toContain('ALTER TABLE public.campanha_facil_contatos ADD COLUMN IF NOT EXISTS base JSONB');
    expect(LISO).toContain('DROP FUNCTION IF EXISTS public.fn_campanha_facil_lote_editar(UUID, TEXT, TEXT, JSONB)');
    expect(LISO).toContain('p_atribuicao JSONB, p_variaveis JSONB DEFAULT NULL');
    expect(LISO).toContain('GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_lote_editar(UUID, TEXT, TEXT, JSONB, JSONB) TO authenticated');
  });

  it('continua só de quem lançou, desativada, e mexe só nos pendentes da campanha', () => {
    expect(LISO).toContain('WHERE id = p_lote AND criado_por = (SELECT auth.uid()) FOR UPDATE');
    expect(LISO).toContain("RAISE EXCEPTION 'Desative a campanha antes de editar.'");
    // A lista do desconto tem de ser exatamente a dos pendentes desta campanha.
    expect(LISO).toContain('IF v_vars <> v_vars_dist OR v_vars <> v_pend OR v_vars_cas <> v_pend THEN');
    expect(LISO).toMatch(/SET variaveis = COALESCE\(c\.variaveis, '\{\}'::JSONB\) \|\| x\.vars, .*WHERE c\.id = x\.id AND c\.status = 'pendente'/);
    // As configurações de desconto do setor não são tocadas.
    expect(LISO).not.toContain('campanha_facil_descontos');
  });
});
