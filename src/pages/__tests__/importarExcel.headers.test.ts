/**
 * Testes de cobertura dos headers da planilha PaguePlay real.
 *
 * A planilha padrão da PaguePlay usa os seguintes cabeçalhos:
 *
 *   A  Inscrição
 *   B  Estado
 *   C  Forma de pagamento
 *   D  Quant. Parcelas
 *   E  Valor
 *   F  Data de venci.
 *   G  Status pendente/ pago ou não pago
 *   H  Nome do profissional
 *   I  CPF
 *   J  Whatsapp
 *
 * Este teste garante que a função `detectarCampo` (exportada de
 * `src/pages/ImportarExcel.tsx`) reconhece cada um desses headers e os
 * associa ao campo lógico correto, garantindo que o parser funcione na
 * prática com a planilha real fornecida pelo cliente.
 */
import { describe, it, expect } from 'vitest';
import { detectarCampo } from '@/lib/importar_excel_keywords';

describe('detectarCampo — headers reais da planilha PaguePlay', () => {
  it('reconhece "Inscrição" como instituicao (NR único da PaguePlay)', () => {
    expect(detectarCampo('Inscrição')).toBe('instituicao');
    expect(detectarCampo('Inscricao')).toBe('instituicao');
    expect(detectarCampo('INSCRIÇÃO')).toBe('instituicao');
  });

  it('reconhece "Estado" como estado_uf (UF do cliente)', () => {
    expect(detectarCampo('Estado')).toBe('estado_uf');
    expect(detectarCampo('UF')).toBe('estado_uf');
    expect(detectarCampo('Estado UF')).toBe('estado_uf');
  });

  it('reconhece "Forma de pagamento" como tipo', () => {
    expect(detectarCampo('Forma de pagamento')).toBe('tipo');
    expect(detectarCampo('FORMA DE PAGAMENTO')).toBe('tipo');
  });

  it('reconhece "Quant. Parcelas" como parcelas', () => {
    expect(detectarCampo('Quant. Parcelas')).toBe('parcelas');
    expect(detectarCampo('Quant Parcelas')).toBe('parcelas');
    expect(detectarCampo('Quantidade de Parcelas')).toBe('parcelas');
    expect(detectarCampo('Quantidade Parcelas')).toBe('parcelas');
  });

  it('reconhece "Valor" como valor', () => {
    expect(detectarCampo('Valor')).toBe('valor');
  });

  it('reconhece "Data de venci." como vencimento', () => {
    expect(detectarCampo('Data de venci.')).toBe('vencimento');
    expect(detectarCampo('Data de Vencimento')).toBe('vencimento');
    expect(detectarCampo('Data Venc')).toBe('vencimento');
  });

  it('reconhece "Status pendente/ pago ou não pago" como status', () => {
    expect(detectarCampo('Status pendente/ pago ou não pago')).toBe('status');
    expect(detectarCampo('Status')).toBe('status');
    expect(detectarCampo('Situação')).toBe('status');
  });

  it('reconhece "Nome do profissional" como nome_cliente', () => {
    expect(detectarCampo('Nome do profissional')).toBe('nome_cliente');
    expect(detectarCampo('Nome completo')).toBe('nome_cliente');
    expect(detectarCampo('Nome')).toBe('nome_cliente');
  });

  it('reconhece "CPF" como nr_cliente (mapeamento via keyword cpf)', () => {
    expect(detectarCampo('CPF')).toBe('nr_cliente');
    expect(detectarCampo('cpf')).toBe('nr_cliente');
  });

  it('reconhece "Whatsapp" como whatsapp', () => {
    expect(detectarCampo('Whatsapp')).toBe('whatsapp');
    expect(detectarCampo('WhatsApp')).toBe('whatsapp');
  });

  it('ignora as labels decorativas "Dados Obrigatórios" e "Dados Opcionais"', () => {
    // Linha 0 da planilha PaguePlay contém só essas duas labels que NÃO devem
    // ser reconhecidas como nenhum campo de acordo.
    expect(detectarCampo('Dados Obrigatórios')).toBe('_ignorar');
    expect(detectarCampo('Dados Opcionais')).toBe('_ignorar');
  });

  it('estado NÃO é mais mapeado para status (bug fix PaguePlay)', () => {
    // Antes da correção, o header "Estado" caía em status (confundindo a UF do
    // cliente com o campo de status do acordo). Garantimos que agora vai para
    // estado_uf e não para status.
    expect(detectarCampo('Estado')).not.toBe('status');
    expect(detectarCampo('Estado')).toBe('estado_uf');
  });
});
