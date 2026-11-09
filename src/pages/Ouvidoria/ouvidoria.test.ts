import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ASSUNTOS, CANAIS, FILTROS_INICIAIS, SITUACOES, STATUS, UFS, filtrar,
  indicadores, ordenar, paraCsv, pedeAcao, type Manifestacao,
} from './ouvidoria';

const base: Manifestacao = {
  id: '1', empresa_id: 'e', setor_id: 's', numero: 1, codigo: 'OUV-00001', data_manifestacao: '2026-11-01',
  canal: 'telefone', nome_profissional: 'João da Silva', codigo_cliente: '4521873', conselho_uf: 'SP',
  assunto: 'cobranca_indevida', descricao: 'Cobrança de anuidade paga', anuidades: [2024],
  situacao_financeira: 'quitada', providencia: null, responsavel_id: 'eu', responsavel_nome: 'Lia',
  data_resposta: null, status: 'aberto', acompanhar: true, observacoes: null, criado_por: null,
  criado_por_nome: null, criado_em: '2026-11-01T12:00:00Z', atualizado_por_nome: null,
  atualizado_em: '2026-11-01T12:00:00Z',
};
const m = (over: Partial<Manifestacao>): Manifestacao => ({ ...base, ...over });

describe('ouvidoria — a fila', () => {
  it('indicadores: abertas, sem retorno, em alerta e concluídas no mês', () => {
    const lista = [
      m({ id: 'a', data_manifestacao: '2026-11-01' }),                         // aberta há 5 dias: alerta
      m({ id: 'b', data_manifestacao: '2026-11-05', data_resposta: '2026-11-05' }),
      m({ id: 'c', status: 'concluido', data_resposta: '2026-11-03' }),
      m({ id: 'd', acompanhar: false, status: 'concluido' }),                 // histórico
    ];
    expect(indicadores(lista, '2026-11-06')).toEqual({
      total: 4, acompanhadas: 3, abertas: 2, semRetorno: 1, atrasadas: 1, concluidasNoMes: 2,
    });
  });

  it('pede ação: aberta, ou concluída sem retorno; histórico nunca', () => {
    expect(pedeAcao(m({}))).toBe(true);
    expect(pedeAcao(m({ status: 'concluido' }))).toBe(true);
    expect(pedeAcao(m({ status: 'concluido', data_resposta: '2026-11-02' }))).toBe(false);
    expect(pedeAcao(m({ acompanhar: false }))).toBe(false);
  });

  it('a busca ignora acento e casa o código do cliente', () => {
    const lista = [m({ id: 'a' }), m({ id: 'b', nome_profissional: 'Maria', codigo_cliente: null })];
    const busca = (b: string) => filtrar(lista, { ...FILTROS_INICIAIS, visao: 'todas', busca: b }, null).map(x => x.id);
    expect(busca('joao')).toEqual(['a']);
    expect(busca('218')).toEqual(['a']);
    expect(busca('2024')).toEqual(['a', 'b']);
  });

  it('as visões separam acompanhamento de histórico, e «só as minhas» olha o responsável', () => {
    const lista = [m({ id: 'a' }), m({ id: 'b', acompanhar: false }), m({ id: 'c', responsavel_id: 'outro' })];
    const ids = (f: Partial<typeof FILTROS_INICIAIS>) => filtrar(lista, { ...FILTROS_INICIAIS, ...f }, 'eu').map(x => x.id);
    expect(ids({})).toEqual(['a', 'c']);
    expect(ids({ visao: 'historico' })).toEqual(['b']);
    expect(ids({ visao: 'todas', responsavel: 'meus' })).toEqual(['a', 'b']);
  });

  it('no acompanhamento, quem pede ação vem primeiro e o mais antigo no topo', () => {
    const lista = [
      m({ id: 'novo', data_manifestacao: '2026-11-05', numero: 3 }),
      m({ id: 'feito', data_manifestacao: '2026-10-01', status: 'concluido', data_resposta: '2026-10-02', numero: 1 }),
      m({ id: 'velho', data_manifestacao: '2026-11-01', numero: 2 }),
    ];
    expect(ordenar(lista, 'acompanhamento').map(x => x.id)).toEqual(['velho', 'novo', 'feito']);
    expect(ordenar(lista, 'todas').map(x => x.id)).toEqual(['novo', 'velho', 'feito']);
  });
});

describe('ouvidoria — CSV', () => {
  it('põe aspas onde o «;» ou a quebra de linha quebrariam a planilha', () => {
    expect(paraCsv([['a', 'b;c'], ['linha\n2', 'x"y']])).toBe('a;"b;c"\r\n"linha\n2";"x""y"\r\n');
  });
});

describe('contrato: opções da tela = CHECK da migration', () => {
  const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261106150000_ouvidoria_cofen.sql'), 'utf8');
  const doCheck = (nome: string) => {
    const trecho = sql.slice(sql.indexOf(`CONSTRAINT ${nome} CHECK`));
    const fim = trecho.indexOf('CONSTRAINT', 12);
    return [...trecho.slice(0, fim).matchAll(/'([A-Za-z_]+)'/g)].map(x => x[1]);
  };
  it.each([
    ['ouvidoria_manifestacoes_canal', CANAIS.map(c => c.valor)],
    ['ouvidoria_manifestacoes_assunto', ASSUNTOS.map(a => a.valor)],
    ['ouvidoria_manifestacoes_situacao', SITUACOES.map(s => s.valor)],
    ['ouvidoria_manifestacoes_status', STATUS.map(s => s.valor)],
    ['ouvidoria_manifestacoes_uf', [...UFS]],
  ])('%s', (nome, tela) => {
    expect(doCheck(nome).sort()).toEqual([...tela].sort());
  });
});
