import { describe, expect, it } from 'vitest';
import { identificarRelatorio } from './identificar';

// Cabeçalhos reais: o 945 de 26/10/2026 e o 58 dos testes do analítico.
const CAB_945 = ['Período', 'Data', 'Id.Baixa', 'UF Coren', 'Cód.Venda', 'Cód.Cliente', 'Nr.Documento', 'Cód.Receber', 'CPF',
  'Profissional', 'Cód.Acordo', 'Parcela', 'Forma Pgto', 'Referência', 'Valor Recebido', 'Valor Tarifa',
  'Split ( PP | Coren | Cofen )', 'Pague Play', 'Coren', 'Cofen', 'Retenção', 'Dt.Baixa', 'Horário', 'Dt.Pagamento',
  'Dt.Repasse', 'Conferido', 'IA', 'Dt. Inicio', 'Dt. Término', 'Operador', 'Dt. Prev. Pgto', 'Próx. Contato', 'Tabulação', 'Status', 'Origem'];
const CAB_58 = ['Cobradora', 'Equipe/SubGrupo', 'Cliente', 'Email', 'Título', 'Colchão?', 'NrDocumento', 'Parcela', 'TpDoc',
  'Tipo Venda', 'DtVenc', 'DtLig', 'DtPgto', 'Dias em atraso', 'Recebido', 'Total HO'];
// O 994 de 27/10/2026.
const CAB_994 = ['Cód. Venda', 'Nr. Doc.', 'Cód. Acordo', 'Cód. Cliente', 'Cliente', 'Franquia', 'Operador',
  'Tp. Documento', 'Data Acordo', 'Data Pagamento', 'Pago no mesmo dia?', 'Valor Pagto', 'CodItens', 'Item',
  'TipoVenda', 'Setor Original', 'Sub Grupo'];

describe('identificarRelatorio', () => {
  it('reconhece o 945', () => expect(identificarRelatorio(CAB_945)).toBe('945'));
  it('reconhece o 945 com o percentual no nome da coluna', () => {
    expect(identificarRelatorio(['Id.Baixa', 'UF Coren', 'Valor Recebido', 'Coren 56,28', 'Cofen 18,76'])).toBe('945');
  });
  it('reconhece o 58', () => expect(identificarRelatorio(CAB_58)).toBe('58'));
  it('o 58 com "Operador" no lugar de "Cobradora" continua sendo o 58', () => {
    expect(identificarRelatorio(['Operador', 'Cliente', 'TpDoc', 'DtPgto', 'Recebido'])).toBe('58');
  });
  it('reconhece o 994 (Retenção do Jornada) e não o confunde com o 58', () => {
    expect(identificarRelatorio(CAB_994)).toBe('994');
  });
  it('planilha qualquer não é nenhum dos dois', () => {
    expect(identificarRelatorio(['Nome', 'Valor'])).toBe('desconhecido');
    expect(identificarRelatorio([])).toBe('desconhecido');
  });
});
