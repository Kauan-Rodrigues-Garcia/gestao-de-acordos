import { describe, expect, it } from 'vitest';
import { formatCurrency, STATUS_LABELS, TIPO_LABELS } from '@/lib/index';
import {
  acordoDoLeitor, descreverMudanca, ehCardDoAnalitico, fraseDoCard, frasesDoAnalitico, lerCardAcordo,
} from './cardAcordo';

const rotulos = { status: STATUS_LABELS, tipo: TIPO_LABELS };

/** Como `fn_acordo_par_avisar` grava (migration 20261030235500). */
const bruto = {
  evento: 'alterado',
  feito_por: 'isa', feito_por_nome: 'Isa',
  rotulo: 'NR', chave: '12345', cliente: 'Maria', parcela: 2, parcelas: 4,
  mudancas: [
    { campo: 'status', de: 'verificar_pendente', para: 'pago' },
    { campo: 'data_pagamento', de: null, para: '2026-10-30' },
  ],
  acordos: { isa: 'ac-isa', cleber: 'ac-cleber' },
  sincronizado: true,
};

describe('lerCardAcordo', () => {
  it('lê o que o banco grava', () => {
    const d = lerCardAcordo(bruto);
    expect(d.evento).toBe('alterado');
    expect(d.mudancas).toHaveLength(2);
    expect(d.acordos).toEqual({ isa: 'ac-isa', cleber: 'ac-cleber' });
    expect(d.sincronizado).toBe(true);
  });

  it('dado faltando não quebra o card', () => {
    const d = lerCardAcordo(null);
    expect(d).toMatchObject({ evento: 'alterado', feitoPorNome: 'Alguém', rotulo: 'NR', mudancas: [] });
    expect(acordoDoLeitor(d, 'x')).toBeNull();
  });
});

describe('acordoDoLeitor', () => {
  it('cada um abre o próprio lado do par', () => {
    const d = lerCardAcordo(bruto);
    expect(acordoDoLeitor(d, 'cleber')).toBe('ac-cleber');
    expect(acordoDoLeitor(d, 'isa')).toBe('ac-isa');
  });

  it('quem não é do par (monitor) abre o que houver', () => {
    expect(acordoDoLeitor(lerCardAcordo(bruto), 'lider')).toBe('ac-isa');
  });
});

describe('descreverMudanca', () => {
  it('formata valor, data e situação com os rótulos de quem lê', () => {
    expect(descreverMudanca({ campo: 'valor', de: 100, para: 120.5 }, rotulos))
      .toEqual({ campo: 'Valor', de: formatCurrency(100), para: formatCurrency(120.5) });
    expect(descreverMudanca({ campo: 'vencimento', de: '2026-10-10', para: '2026-10-30' }, rotulos))
      .toEqual({ campo: 'Vencimento', de: '10/10/2026', para: '30/10/2026' });
    expect(descreverMudanca({ campo: 'status', de: 'verificar_pendente', para: 'pago' }, rotulos))
      .toEqual({ campo: 'Situação', de: 'Verificar', para: 'Pago' });
  });

  it('vazio vira travessão', () => {
    expect(descreverMudanca({ campo: 'data_pagamento', de: null, para: '2026-10-30' }, rotulos).de).toBe('—');
  });

  it('WhatsApp só diz que mudou', () => {
    expect(descreverMudanca({ campo: 'whatsapp', de: null, para: null }, rotulos))
      .toEqual({ campo: 'WhatsApp', de: null, para: null });
  });
});

describe('fraseDoCard', () => {
  it('pago vira «marcou como Pago»', () => {
    expect(fraseDoCard(lerCardAcordo(bruto), 'cleber', STATUS_LABELS)).toBe('Isa marcou como Pago');
  });

  it('quem fez lê «Você»', () => {
    expect(fraseDoCard(lerCardAcordo(bruto), 'isa', STATUS_LABELS)).toBe('Você marcou como Pago');
  });

  it('edição de vários campos é «alterou»', () => {
    const d = lerCardAcordo({
      ...bruto,
      mudancas: [
        { campo: 'valor', de: 100, para: 120 },
        { campo: 'vencimento', de: '2026-10-10', para: '2026-10-20' },
      ],
    });
    expect(fraseDoCard(d, 'cleber', STATUS_LABELS)).toBe('Isa alterou o acordo vinculado');
  });

  it('exclusão de uma parcela diz qual', () => {
    const d = lerCardAcordo({ ...bruto, evento: 'excluido', resultado: 'virou_direto' });
    expect(fraseDoCard(d, 'cleber', STATUS_LABELS)).toBe('Isa excluiu a parcela 2 do acordo vinculado');
    expect(d.resultado).toBe('virou_direto');
  });
});

/** Como `fn_analitico_avisar_no_chat` grava (migration 20261116234244). */
describe('avisos do Analítico', () => {
  const base = {
    origem: 'analitico', feito_por: 'ayslan', feito_por_nome: 'Ayslan',
    rotulo: 'NR', chave: '13027352', cliente: 'Maria', valor_recebido: 3220,
    de_id: 'quezia', de_nome: 'Quezia', para_id: 'ayslan', para_nome: 'Ayslan',
  };

  it('transferência: quem perdeu lê que saiu da lista dele, e não tem acordo para abrir', () => {
    const d = lerCardAcordo({ ...base, evento: 'transferido', acordos: { ayslan: 'ac-1' } });
    expect(ehCardDoAnalitico(d)).toBe(true);
    expect(d.valorRecebido).toBe(3220);
    expect(frasesDoAnalitico(d, 'quezia').titulo).toBe('Seu acordo passou para Ayslan');
    expect(frasesDoAnalitico(d, 'ayslan').titulo).toBe('O acordo de Quezia passou para você');
    expect(acordoDoLeitor(d, 'quezia')).toBeNull();
    expect(acordoDoLeitor(d, 'ayslan')).toBe('ac-1');
  });

  it('par pelo relatório: ninguém perde, e cada um abre o seu', () => {
    const d = lerCardAcordo({ ...base, evento: 'virou_extra', acordos: { quezia: 'ac-extra', ayslan: 'ac-direto' } });
    expect(frasesDoAnalitico(d, 'quezia')).toEqual({
      titulo: 'Seu acordo virou Extra',
      detalhe: 'O relatório mostra Ayslan como Direto e o seu recebimento como Extra. Seu acordo continua com você.',
    });
    expect(frasesDoAnalitico(d, 'ayslan').titulo).toBe('Você entrou como Direto');
    expect(acordoDoLeitor(d, 'quezia')).toBe('ac-extra');
    expect(acordoDoLeitor(d, 'ayslan')).toBe('ac-direto');
  });

  it('quem olha de fora (monitor) lê os dois nomes', () => {
    const d = lerCardAcordo({ ...base, evento: 'transferido', acordos: { ayslan: 'ac-1' } });
    expect(frasesDoAnalitico(d, 'lider').titulo).toBe('O acordo passou de Quezia para Ayslan');
    expect(acordoDoLeitor(d, 'lider')).toBe('ac-1');
  });

  it('o card do par Direto/Extra de sempre não é do Analítico', () => {
    expect(ehCardDoAnalitico(lerCardAcordo(bruto))).toBe(false);
  });
});
