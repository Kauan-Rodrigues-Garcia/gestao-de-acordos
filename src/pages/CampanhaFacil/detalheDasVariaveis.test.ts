/**
 * A ficha das variáveis e a prévia da mensagem (25/10/2026).
 *
 * O que se perde se isto quebrar: a ficha descreve uma variável que não existe,
 * ou a prévia mostra um texto diferente do que a campanha manda ao cliente.
 */
import { describe, expect, it } from 'vitest';
import { CampaignCore } from './lib/campaign-core';
import {
  DETALHE_DA_VARIAVEL, VARIAVEIS_EM_REAIS, corrigirReaisDuplicados, exemploDaMensagem, pedacosDaPrevia,
  reaisDuplicados, valorCurto, variaveisDesconhecidas,
} from './detalheDasVariaveis';
import { VARIABLE_LABELS } from './VariaveisMensagem';

const exemplo = exemploDaMensagem(null, CampaignCore.DEFAULT_DISCOUNTS);

describe('ficha das variáveis', () => {
  it('toda variável da mensagem tem ficha, e toda ficha é de uma variável que existe', () => {
    const conhecidas = Object.keys(exemplo.variaveis).sort();
    expect(Object.keys(DETALHE_DA_VARIAVEL).sort()).toEqual(conhecidas);
    for (const [v] of VARIABLE_LABELS) expect(DETALHE_DA_VARIAVEL[v], v).toBeDefined();
  });
});

describe('cliente de exemplo', () => {
  it('é o do documento, com os percentuais da tela', () => {
    expect(exemplo.real).toBe(false);
    expect(exemplo.variaveis.primeiro_nome).toBe('Kleber');
    expect(exemplo.variaveis.quitacao).toBe(CampaignCore.formatCurrency(1400));
    const outro = exemploDaMensagem(null, { ...CampaignCore.DEFAULT_DISCOUNTS, settlement: 50 });
    expect(outro.variaveis.quitacao).toBe(CampaignCore.formatCurrency(1000));
  });

  it('com um cliente selecionado, usa o dele', () => {
    const [item] = CampaignCore.buildCampaign([{
      rowNumber: 7, values: {}, normalized: { NOME: 'ANA LIMA', CONTRATOS: '1', VALOR: '100', VALORABERTO: '100', VALORATUALIZADO: '100', PARCELASEMATRASO: '1' },
    }], { template: '', senders: ['x'] });
    const e = exemploDaMensagem(item, CampaignCore.DEFAULT_DISCOUNTS);
    expect(e.real).toBe(true);
    expect(e.rotulo).toContain('linha 7');
    expect(e.variaveis.primeiro_nome).toBe('Ana');
  });
});

describe('prévia', () => {
  it('monta o mesmo texto da campanha', () => {
    const texto = 'Olá *{{primeiro_nome}}*, quitação {{quitacao}}. 0800 779 6000';
    const montado = pedacosDaPrevia(texto, exemplo.variaveis)
      .map((p) => (p.tipo === 'texto' || p.tipo === 'valor' ? p.texto : '')).join('');
    const campanha = CampaignCore.renderTemplate(CampaignCore.withCompanySupportPhone(texto), exemplo.variaveis);
    expect(montado).toBe(campanha);
  });

  it('separa a variável vazia da que não existe', () => {
    const pedacos = pedacosDaPrevia('{{nome}} {{quitacão}} {{cpf}}', { ...exemplo.variaveis, cpf: '' });
    expect(pedacos.filter((p) => p.tipo !== 'texto').map((p) => p.tipo)).toEqual(['valor', 'desconhecida', 'vazia']);
  });

  it('acha as variáveis que não existem — com acento, maiúscula ou nome errado', () => {
    expect(variaveisDesconhecidas('{{nome}} {{quitacão}} {{ Quitacao }} {{pct_juncao}} {{constructor}}'))
      .toEqual(['quitacão', 'Quitacao', 'constructor']);
    expect(variaveisDesconhecidas('Olá {{primeiro_nome}}, {{ cpf }}')).toEqual([]);
  });

  it('a que não existe sairia errada na campanha: em branco ou com as chaves', () => {
    const v = exemplo.variaveis;
    expect(CampaignCore.renderTemplate('[{{ Quitacao }}]', v)).toBe('[]');
    expect(CampaignCore.renderTemplate('[{{quitacão}}]', v)).toBe('[{{quitacão}}]');
  });

  it('a lista das variáveis em reais é exatamente a das que saem com «R$»', () => {
    const emReais = Object.entries(exemplo.variaveis).filter(([, v]) => v.startsWith('R$')).map(([k]) => k).sort();
    expect([...VARIAVEIS_EM_REAIS].sort()).toEqual(emReais);
  });

  it('acha o «R$» antes e o «,00» depois das variáveis em reais', () => {
    expect(reaisDuplicados('*R${{quitacao}},00* ou R$ {{juncao}} ou {{valor_com_juros}},00')).toEqual(['quitacao', 'juncao', 'valor_com_juros']);
    expect(reaisDuplicados('R$ *"{{cartao_quitacao}}"* e R${{ parcela_desconto }}, 00')).toEqual(['cartao_quitacao', 'parcela_desconto']);
    // Variável que não é em reais, ou valor já certo: não avisa.
    expect(reaisDuplicados('Ganhe {{pct_quitacao}} por *{{quitacao}}*, R$ 10,00 à vista, CPF {{cpf}},00')).toEqual([]);
  });

  it('o «Corrigir» tira o «R$» e o «,00» e deixa o negrito', () => {
    expect(corrigirReaisDuplicados('por *R${{quitacao}},00* ou 12x de R$ {{cartao_quitacao}}')).toBe('por *{{quitacao}}* ou 12x de {{cartao_quitacao}}');
    expect(corrigirReaisDuplicados('de R$ *"{{valor_com_juros}}"* por {{juncao}}, 00!')).toBe('de *{{valor_com_juros}}* por {{juncao}}!');
    const certo = 'Quite por *{{quitacao}}* (R$ 10,00 de taxa)';
    expect(corrigirReaisDuplicados(certo)).toBe(certo);
    // Depois de corrigir, a campanha manda um «R$» só.
    const texto = corrigirReaisDuplicados('*R${{quitacao}},00*');
    expect(CampaignCore.renderTemplate(texto, exemplo.variaveis)).toBe(`*${exemplo.variaveis.quitacao}*`);
  });

  it('o valor curto do botão tira os centavos zerados', () => {
    expect(valorCurto('R$ 1.400,00')).toBe('R$ 1.400');
    expect(valorCurto('7%')).toBe('7%');
    expect(valorCurto(undefined)).toBe('');
  });
});
