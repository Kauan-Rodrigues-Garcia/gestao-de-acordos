import { describe, expect, it } from 'vitest';
import {
  agruparPorTipo, cidadesDoMes, contarPorCidade, cruzaCidades, filtrar, linhasDoHistorico,
  rotuloMes, setoresDoMes, somarMes, type EventoRh,
} from './historicoMes';

function ev(p: Partial<EventoRh> & Pick<EventoRh, 'tipo'>): EventoRh {
  return {
    dia: '2026-11-05', pessoa_id: 'p1', pessoa_nome: 'Ana', cargo: 'operador', empresa_id: 'e1',
    setor_de_id: 's1', setor_de_nome: 'Play 1', cidade_de: 'Birigui',
    setor_para_id: 's1', setor_para_nome: 'Play 1', cidade_para: 'Birigui',
    valor_de: null, valor_para: null, sentido: null,
    ausencia_tipo: null, ausencia_rotulo: null, inicio: null, fim: null, feito_por: 'Cleber',
    ...p,
  };
}

const ENTRE_CIDADES = ev({
  tipo: 'transferencia', pessoa_nome: 'Bia',
  setor_de_id: 's9', setor_de_nome: 'Play Mix Marília', cidade_de: 'Marília',
});
const DESLIGADO = ev({ tipo: 'desligamento', pessoa_nome: 'Caio', dia: '2026-11-12' });
const AFASTADO_MARILIA = ev({
  tipo: 'afastamento', pessoa_nome: 'Duda', dia: '2026-11-01',
  setor_de_id: 's9', setor_de_nome: 'Play Mix Marília', cidade_de: 'Marília',
  setor_para_id: 's9', setor_para_nome: 'Play Mix Marília', cidade_para: 'Marília',
  ausencia_rotulo: 'INSS', inicio: '2026-10-20', fim: '9999-12-31',
});
const ENTRADA_SEM_CIDADE = ev({
  tipo: 'entrada', pessoa_nome: 'Edu',
  setor_de_id: null, setor_de_nome: null, cidade_de: null,
  setor_para_id: null, setor_para_nome: null, cidade_para: null,
});
const TODOS = [ENTRE_CIDADES, DESLIGADO, AFASTADO_MARILIA, ENTRADA_SEM_CIDADE];

describe('historicoMes', () => {
  it('transferência entre cidades conta nas duas', () => {
    const c = contarPorCidade(TODOS);
    expect(c.get('birigui')?.transferencia).toBe(1);
    expect(c.get('marilia')?.transferencia).toBe(1);
    expect(c.get('birigui')?.desligamento).toBe(1);
    expect(c.get('marilia')?.desligamento).toBe(0);
    expect(cruzaCidades(ENTRE_CIDADES)).toBe(true);
    expect(cruzaCidades(DESLIGADO)).toBe(false);
  });

  it('entrada sem setor vai para «Sem cidade», sempre por último', () => {
    const cidades = cidadesDoMes(TODOS);
    expect(cidades.map(c => c.nome)).toEqual(['Birigui', 'Marília', 'Sem cidade']);
    expect(cidades.map(c => c.marca)).toEqual(['BookPlay', 'PaguePlay', null]);
  });

  it('filtro de cidade pega a transferência pela origem ou pelo destino', () => {
    expect(filtrar(TODOS, { cidade: 'marilia', setor: null }).map(e => e.pessoa_nome)).toEqual(['Bia', 'Duda']);
    expect(filtrar(TODOS, { cidade: 'birigui', setor: null }).map(e => e.pessoa_nome)).toEqual(['Bia', 'Caio']);
  });

  it('filtro de setor vale origem ou destino', () => {
    expect(filtrar(TODOS, { cidade: null, setor: 's9' }).map(e => e.pessoa_nome)).toEqual(['Bia', 'Duda']);
    expect(setoresDoMes(TODOS)).toEqual([
      { id: 's1', nome: 'Play 1', cidade: 'Birigui', eventos: 2 },
      { id: 's9', nome: 'Play Mix Marília', cidade: 'Marília', eventos: 2 },
    ]);
  });

  it('seções na ordem da tela, só as que têm linha, ordenadas por dia', () => {
    const outra = ev({ tipo: 'transferencia', pessoa_nome: 'Aaron', dia: '2026-11-02' });
    const g = agruparPorTipo([...TODOS, outra]);
    expect(g.map(s => s.tipo)).toEqual(['transferencia', 'desligamento', 'afastamento', 'entrada']);
    expect(g[0].eventos.map(e => e.pessoa_nome)).toEqual(['Aaron', 'Bia']);
  });

  it('mês: soma, vira o ano e tem rótulo', () => {
    expect(somarMes('2026-12', 1)).toBe('2027-01');
    expect(somarMes('2026-08', -1)).toBe('2026-07');
    expect(rotuloMes('2026-11')).toBe('Novembro/2026');
  });

  it('planilha: uma aba por tipo, afastamento sem volta escrito por extenso', () => {
    const abas = linhasDoHistorico(TODOS, c => c.toUpperCase());
    expect(Object.keys(abas)).toEqual(['Transferências', 'Desligamentos', 'Afastamentos', 'Entradas']);
    expect(abas['Transferências'][0]).toMatchObject({
      'Setor de origem': 'Play Mix Marília', 'Cidade de origem': 'Marília', 'Setor de destino': 'Play 1',
    });
    expect(abas.Afastamentos[0]).toMatchObject({ Tipo: 'INSS', 'Início': '20/10/2026', Fim: 'sem data de volta', Cargo: 'OPERADOR' });
  });
});
