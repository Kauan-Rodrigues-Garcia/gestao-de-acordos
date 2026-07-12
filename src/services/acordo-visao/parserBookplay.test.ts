/**
 * Testes do parser de fallback (OCR) de acordos BookPlay e do merge
 * multi-imagem (reparcelamento dividido em dois prints).
 */
import { describe, it, expect } from 'vitest';
import { extrairDadosBookplay, mesclarDadosBookplay } from './parserBookplay';
import { sanitizarDadosAcordo } from './sanitizar';

describe('extrairDadosBookplay', () => {
  it('extrai NR, vencimento, valor por parcela e status de um print simples', () => {
    const texto = [
      'Acordo BookPlay',
      'NR: 482910',
      'Cliente: JOAO DA SILVA',
      'Forma de pagamento: Boleto',
      'Status: Pago',
      '1.590,40  10/08/2026',
      '1.590,40  10/09/2026',
      '1.590,40  10/10/2026',
    ].join('\n');

    const d = extrairDadosBookplay(texto);
    expect(d.nr_cliente).toBe('482910');
    expect(d.vencimento).toBe('2026-08-10');
    expect(d.valor).toBe('1.590,40'); // valor POR PARCELA
    expect(d.parcelas).toBe('3');
    expect(d.tipo).toBe('boleto');
    expect(d.status).toBe('pago');
    expect(d.nome_cliente).toBe('JOAO DA SILVA');
  });

  it('reconhece "não pago" sem confundir com "pago"', () => {
    expect(extrairDadosBookplay('Status: Não Pago').status).toBe('nao_pago');
    expect(extrairDadosBookplay('Situação: Pendente').status).toBe('verificar_pendente');
  });

  it('usa fallback "6x" quando não há tabela de parcelas', () => {
    const d = extrairDadosBookplay('Parcelamento em 6x de 200,00 - PIX Automático');
    expect(d.parcelas).toBe('6');
    expect(d.tipo).toBe('pix_automatico');
  });

  it('extrai UMA linha coerente de uma planilha (sem misturar linhas)', () => {
    // Caso real: várias linhas; deve pegar a 1ª completa inteira, não misturar.
    const planilha = [
      'LENIRA CARDOSO DA CRUZ COSTA 12925711 199 21x 05/06/2026 (94) 98814-4364 PENDENTE FACULDADE BOOKPLAY BOLETO',
      'AMANDA MOHR 12854491 236,98 12x 05/06/2026 (66) 99644-3323 VERIFICAR FACULDADE BOOKPLAY CARTAO RECORRENTE',
      'ROSIMEIRE SANTOS DE OLIVEIRA 12805763 224,1 12x 05/06/2026 (96)99164-4490 VERIFICAR FACULDADE BOOKPLAY CARTAO RECORRENTE',
    ].join('\n');

    const d = extrairDadosBookplay(planilha);
    expect(d.nr_cliente).toBe('12925711');   // linha 1, não 12854491
    expect(d.valor).toBe('199,00');
    expect(d.parcelas).toBe('21');
    expect(d.vencimento).toBe('2026-06-05');
    expect(d.tipo).toBe('boleto');            // linha 1 é BOLETO, não CARTÃO
    expect(d.status).toBe('verificar_pendente');
    expect(d.nome_cliente).toContain('LENIRA');
  });

  it('lê NR sem rótulo e valor com 1 casa decimal', () => {
    const d = extrairDadosBookplay('CLEUDES RIBEIRO DE SOUSA 12946345 211,65 17x 05/06/2026 VERIFICAR BOOKPLAY CARTAO RECORRENTE');
    expect(d.nr_cliente).toBe('12946345');
    expect(d.valor).toBe('211,65');
    expect(d.parcelas).toBe('17');
    expect(d.tipo).toBe('cartao_recorrente');
  });
});

describe('mesclarDadosBookplay (reparcelamento em 2 prints)', () => {
  it('soma as parcelas das imagens e mantém a identidade do primeiro print', () => {
    const print1 = extrairDadosBookplay(
      ['NR: 482910', 'Boleto', '1.590,40  10/08/2026', '1.590,40  10/09/2026'].join('\n'),
    );
    const print2 = extrairDadosBookplay(
      ['1.590,40  10/10/2026', '1.590,40  10/11/2026', '1.590,40  10/12/2026'].join('\n'),
    );

    const merged = sanitizarDadosAcordo(mesclarDadosBookplay([print1, print2]));
    expect(merged.nr_cliente).toBe('482910');
    expect(merged.parcelas).toBe('5'); // 2 + 3
    expect(merged.valor).toBe('1.590,40');
    expect(merged.vencimento).toBe('2026-08-10');
  });
});

describe('sanitizarDadosAcordo', () => {
  it('normaliza data BR e valor americano vindos da IA', () => {
    const d = sanitizarDadosAcordo({
      vencimento: '10/08/2026',
      valor: '1590.40',
      parcelas: '3',
      tipo: 'BOLETO',
      status: 'quitado',
    });
    expect(d.vencimento).toBe('2026-08-10');
    expect(d.valor).toBe('1.590,40');
    expect(d.tipo).toBe('boleto');
    expect(d.status).toBe('pago');
  });

  it('descarta tipo/status fora do vocabulário', () => {
    const d = sanitizarDadosAcordo({ tipo: 'cheque', status: 'sei_la' });
    expect(d.tipo).toBeUndefined();
    expect(d.status).toBeUndefined();
  });
});
