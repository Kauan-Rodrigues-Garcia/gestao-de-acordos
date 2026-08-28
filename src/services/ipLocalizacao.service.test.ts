import { rotuloLocalizacaoIp } from './ipLocalizacao.service';

describe('rotuloLocalizacaoIp', () => {
  it('mostra cidade e sigla do estado', () => {
    expect(rotuloLocalizacaoIp({
      ip: '8.8.8.8', cidade: 'Marília', estado: 'São Paulo', estadoCodigo: 'SP',
      pais: 'Brasil', paisCodigo: 'BR', consultadoEm: null, aproximada: true,
    })).toBe('Marília, SP');
  });

  it('cai para o país quando cidade e estado não existem', () => {
    expect(rotuloLocalizacaoIp({
      ip: '8.8.8.8', cidade: null, estado: null, estadoCodigo: null,
      pais: 'Brasil', paisCodigo: 'BR', consultadoEm: null, aproximada: true,
    })).toBe('Brasil');
  });
});
