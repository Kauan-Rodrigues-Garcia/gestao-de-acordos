/**
 * A Edge Function `enviar-push` tem uma CÓPIA do formato da tela do celular
 * (`supabase/functions/enviar-push/texto.ts`). Este teste roda os mesmos casos
 * contra as duas: o aviso e a tela nunca podem escrever o mesmo pagamento de
 * jeitos diferentes.
 */
import { describe, it, expect } from 'vitest';
import * as tela from './formato';
import * as aviso from '../../../supabase/functions/enviar-push/texto';

const NOMES = ['123456 - MARIA SILVA OLIVEIRA', '98765-JOAO SOUZA', '4455 ANA LIMA', '12/345 - CARLA DIAS', 'MARIA SILVA OLIVEIRA', 'joão batista dos', 'Ana de Souza', 'Rosângela', '  carlos   eduardo  ', '', null, 'ÉRICA DA SILVA E SOUZA'];
const FORMAS: ['boleto_pix' | 'cartao', string | null][] = [
  ['boleto_pix', 'Pix'], ['boleto_pix', 'Boleto Negociação'], ['cartao', 'Cartão de Crédito'],
  ['cartao', 'Cartão Recorrente'], ['boleto_pix', 'Pix Automático'], ['boleto_pix', null],
  ['cartao', ''], ['boleto_pix', 'Pix/Boleto'], ['boleto_pix', 'Ajuste manual'], ['boleto_pix', 'Depósito'],
  ['boleto_pix', 'Recorrente'], ['cartao', 'Cartão Site Parcial + Boleto'],
];

describe('paridade tela × aviso', () => {
  it.each(NOMES)('cliente %s', (n) => {
    expect(aviso.abreviarCliente(n)).toBe(tela.abreviarCliente(n));
    expect(aviso.abreviarCliente(n, '98765')).toBe(tela.abreviarCliente(n, '98765'));
  });
  it.each(FORMAS)('forma %s / %s', (f, d) => {
    const t = tela.formaDoPagamento(f, d);
    expect(aviso.formaDoPagamento(f, d)).toEqual({ chave: t.chave, rotulo: t.rotulo });
  });
});
