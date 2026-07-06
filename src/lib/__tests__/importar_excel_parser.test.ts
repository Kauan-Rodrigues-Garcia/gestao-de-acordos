/**
 * Testes do motor adaptativo de importação (Bookplay).
 *
 * Cobre o requisito do usuário: reconhecer os campos pelo cabeçalho em qualquer
 * ordem/posição, mapear diferentes modelos para o formato-alvo, bloquear quando
 * faltar coluna obrigatória e suportar planilhas em blocos por data.
 */
import { describe, it, expect } from 'vitest';
import {
  parsearPlanilha,
  classificarLinha,
  validarColunasObrigatorias,
} from '@/lib/importar_excel_parser';

// Modelo exato da imagem enviada pelo usuário (cabeçalho na 1ª linha).
const HEADER_IMAGEM = [
  'NR', 'Nome do Cliente', 'WhatsApp', 'Instituição', 'Forma de Pagamento',
  'Qtd. Parcelas', 'Valor (Parcela)', 'Data de Venci.', 'Status', 'Observações',
];
const LINHAS_IMAGEM: unknown[][] = [
  HEADER_IMAGEM,
  ['23232',     'João da Silva',  '(89) 99999-1111', 'Banco X', 'Boleto', 3, 500, '30/05/2026', 'Pendente', ''],
  ['232323232', 'Maria Oliveira', '(89) 98888-2222', 'Banco Y', 'PIX',    1, 200, '15/06/2026', 'Pago',     ''],
  ['23232322',  'Carlos Pereira', '',                '',        'Cartão', 1, 350, '10/07/2026', 'Não Pago', 'Cliente em negociação'],
];

describe('parsearPlanilha (Bookplay) — modelo da imagem', () => {
  it('mapeia as 3 linhas em modo tabela', () => {
    const { registros, modo, blocos } = parsearPlanilha(LINHAS_IMAGEM);
    expect(modo).toBe('tabela');
    expect(blocos).toBe(0);
    expect(registros).toHaveLength(3);
  });

  it('reconhece cada campo do primeiro registro', () => {
    const r0 = parsearPlanilha(LINHAS_IMAGEM).registros[0];
    expect(r0).toMatchObject({
      nr_cliente:   '23232',
      nome_cliente: 'João da Silva',
      instituicao:  'Banco X',
      tipo:         'boleto',
      parcelas:     3,
      valor:        500,
      vencimento:   '2026-05-30',
      status:       'verificar_pendente',
      valido:       true,
    });
    expect(r0.whatsapp).toBe('89999991111');
    expect(r0.nr_cliente).not.toBe('');
  });

  it('aceita WhatsApp e Instituição em branco (coluna existe, célula vazia)', () => {
    const r2 = parsearPlanilha(LINHAS_IMAGEM).registros[2];
    expect(r2.nome_cliente).toBe('Carlos Pereira');
    expect(r2.whatsapp).toBeNull();
    expect(r2.instituicao).toBe('');
    expect(r2.tipo).toBe('cartao');
    expect(r2.status).toBe('nao_pago');
    expect(r2.observacoes_raw).toBe('Cliente em negociação');
    expect(r2.valido).toBe(true); // NR + valor + vencimento presentes
  });

  it('valida colunas obrigatórias: todas presentes', () => {
    const { mapa, modo } = parsearPlanilha(LINHAS_IMAGEM);
    expect(validarColunasObrigatorias(mapa, false, modo)).toEqual({ ok: true, faltando: [] });
  });
});

describe('parsearPlanilha (Bookplay) — colunas em ordem trocada', () => {
  const rows: unknown[][] = [
    ['Valor (Parcela)', 'Status', 'NR', 'Data de Venci.', 'Nome do Cliente', 'Qtd. Parcelas', 'Forma de Pagamento', 'WhatsApp', 'Instituição'],
    [500, 'Pendente', '900', '30/05/2026', 'Ana Souza', 2, 'PIX', '11987654321', 'Banco Z'],
  ];

  it('mapeia corretamente mesmo com as colunas fora de ordem', () => {
    const { registros, mapa, modo } = parsearPlanilha(rows);
    expect(validarColunasObrigatorias(mapa, false, modo).ok).toBe(true);
    expect(registros[0]).toMatchObject({
      nr_cliente:   '900',
      nome_cliente: 'Ana Souza',
      instituicao:  'Banco Z',
      tipo:         'pix',
      parcelas:     2,
      valor:        500,
      vencimento:   '2026-05-30',
      status:       'verificar_pendente',
      valido:       true,
    });
    expect(registros[0].whatsapp).toBe('11987654321');
  });
});

describe('parsearPlanilha (Bookplay) — nomes de cabeçalho alternativos', () => {
  const rows: unknown[][] = [
    ['Contrato', 'Nome', 'Celular', 'Banco', 'Forma', 'Parcelas', 'Valor', 'Vencimento', 'Situação'],
    ['C-77', 'Rui Barbosa', '(11) 90000-0000', 'Itaú', 'Boleto', 4, '1.250,90', '05/08/2026', 'Pago'],
  ];

  it('reconhece Contrato→NR, Celular→WhatsApp, Banco→Instituição, Situação→Status', () => {
    const { registros, mapa, modo } = parsearPlanilha(rows);
    expect(validarColunasObrigatorias(mapa, false, modo).ok).toBe(true);
    expect(registros[0]).toMatchObject({
      nr_cliente:   'C-77',
      nome_cliente: 'Rui Barbosa',
      instituicao:  'Itaú',
      tipo:         'boleto',
      parcelas:     4,
      valor:        1250.9,
      vencimento:   '2026-08-05',
      status:       'pago',
    });
    expect(registros[0].whatsapp).toBe('11900000000');
  });
});

describe('validarColunasObrigatorias — coluna obrigatória ausente', () => {
  it('bloqueia e lista "Valor" quando a coluna de valor não existe', () => {
    const rows: unknown[][] = [
      ['NR', 'Nome do Cliente', 'WhatsApp', 'Instituição', 'Forma de Pagamento', 'Qtd. Parcelas', 'Data de Venci.', 'Status'],
      ['10', 'Zé', '11999998888', 'Banco X', 'Boleto', 1, '30/05/2026', 'Pendente'],
    ];
    const { mapa, modo } = parsearPlanilha(rows);
    const res = validarColunasObrigatorias(mapa, false, modo);
    expect(res.ok).toBe(false);
    expect(res.faltando).toContain('Valor');
  });

  it('lista múltiplos campos faltantes', () => {
    const rows: unknown[][] = [
      ['NR', 'Nome do Cliente', 'Valor'],
      ['10', 'Zé', 500],
    ];
    const { mapa, modo } = parsearPlanilha(rows);
    const res = validarColunasObrigatorias(mapa, false, modo);
    expect(res.ok).toBe(false);
    expect(res.faltando).toEqual(
      expect.arrayContaining(['WhatsApp', 'Instituição', 'Forma de Pagamento', 'Qtd. Parcelas', 'Data de Vencimento']),
    );
  });
});

describe('parsearPlanilha (Bookplay) — blocos por data', () => {
  const rows: unknown[][] = [
    ['14/04/2026', '', '', '', ''],
    ['NR', 'Nome', 'Valor', 'Parcelas', 'Status'],
    ['1001', 'Cliente A', '100,00', '1x', 'Pendente'],
    ['1002', 'Cliente B', '200,00', '2x', 'Pago'],
    ['', '', '', '', ''],
    ['20/04/2026', '', '', '', ''],
    ['NR', 'Nome', 'Valor', 'Parcelas', 'Status'],
    ['1003', 'Cliente C', '300,00', '1x', 'Pendente'],
  ];

  it('detecta modo blocos e carimba a data de cada bloco', () => {
    const { registros, modo, blocos } = parsearPlanilha(rows);
    expect(modo).toBe('blocos');
    expect(blocos).toBe(2);
    expect(registros).toHaveLength(3);
    expect(registros[0]).toMatchObject({ nr_cliente: '1001', valor: 100, vencimento: '2026-04-14', bloco: 1 });
    expect(registros[1]).toMatchObject({ nr_cliente: '1002', valor: 200, vencimento: '2026-04-14', bloco: 1 });
    expect(registros[2]).toMatchObject({ nr_cliente: '1003', valor: 300, vencimento: '2026-04-20', bloco: 2 });
  });

  it('no modo blocos não exige coluna de vencimento (vem da data do bloco)', () => {
    const { mapa, modo } = parsearPlanilha(rows);
    expect(validarColunasObrigatorias(mapa, false, modo).ok).toBe(true);
  });
});

describe('classificarLinha', () => {
  it('linha vazia → vazia', () => {
    expect(classificarLinha(['', '', ''])).toBe('vazia');
  });
  it('linha só com data → data_bloco', () => {
    expect(classificarLinha(['14/04/2026', '', ''])).toBe('data_bloco');
  });
  it('linha de cabeçalho → cabecalho', () => {
    expect(classificarLinha(HEADER_IMAGEM)).toBe('cabecalho');
  });
  it('linha de dados → acordo_bloco', () => {
    expect(classificarLinha(['23232', 'João da Silva', '(89) 99999-1111', 'Banco X', 'Boleto', 3, 500, '30/05/2026', 'Pendente', ''])).toBe('acordo_bloco');
  });
  it('linha decorativa → ruido', () => {
    expect(classificarLinha(['Dados Obrigatórios', '', 'Dados Opcionais'])).toBe('ruido');
  });
});
