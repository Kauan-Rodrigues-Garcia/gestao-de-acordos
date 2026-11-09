import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ASSUNTOS, CANAIS, CORES_ETIQUETA, FILTROS_INICIAIS, SITUACOES, STATUS, UFS, alertasDe, etiquetasUsadas, faltaBr,
  filtrar, indicadores, isoDeDataHora, ordenar, paraCsv, pedeAcao, quandoBr, situacaoEncaminhamento,
  textoAnuidades, textoTicket, textoTicketGrupo, urgenciaRetorno,
  type Etiqueta, type Grupo, type Manifestacao,
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

describe('ouvidoria 2 — filtros novos', () => {
  it('período pela data da manifestação, aba de tickets e «só as minhas» olha quem registrou', () => {
    const lista = [
      m({ id: 'a', data_manifestacao: '2026-11-01' }),
      m({ id: 'b', data_manifestacao: '2026-11-05', ticket_status: 'pendente', responsavel_id: null, criado_por: 'eu' }),
      m({ id: 'c', data_manifestacao: '2026-11-08', ticket_status: 'aberto', responsavel_id: null, retorno_agendado_por: 'eu' }),
      m({ id: 'd', data_manifestacao: '2026-11-08', responsavel_id: 'outro' }),
    ];
    const ids = (f: Partial<typeof FILTROS_INICIAIS>) => filtrar(lista, { ...FILTROS_INICIAIS, visao: 'todas', ...f }, 'eu').map(x => x.id);
    expect(ids({ de: '2026-11-02', ate: '2026-11-07' })).toEqual(['b']);
    expect(ids({ visao: 'tickets' })).toEqual(['b']);
    expect(ids({ responsavel: 'meus' })).toEqual(['a', 'b', 'c']);
  });
});

describe('ouvidoria 2 — retorno agendado e alertas', () => {
  const agora = Date.parse('2026-11-09T15:00:00Z'); // 12:00 em Brasília
  it('urgência: atrasado, na última hora, hoje e outro dia', () => {
    expect(urgenciaRetorno('2026-11-09T14:59:00Z', agora)).toBe('atrasado');
    expect(urgenciaRetorno('2026-11-09T16:00:00Z', agora)).toBe('agora');
    expect(urgenciaRetorno('2026-11-09T16:01:00Z', agora)).toBe('hoje');
    // 22:30 em Brasília ainda é hoje, mesmo já sendo amanhã em UTC.
    expect(urgenciaRetorno('2026-11-10T01:30:00Z', agora)).toBe('hoje');
    expect(urgenciaRetorno('2026-11-10T12:00:00Z', agora)).toBe('depois');
  });

  it('textos de quando e quanto falta, no horário de Brasília', () => {
    expect(quandoBr('2026-11-09T17:00:00Z', agora)).toBe('hoje às 14:00');
    expect(quandoBr('2026-11-10T12:00:00Z', agora)).toBe('amanhã às 09:00');
    expect(quandoBr('2026-11-12T12:00:00Z', agora)).toBe('12/11 às 09:00');
    expect(faltaBr('2026-11-09T15:45:00Z', agora)).toBe('em 45 min');
    expect(faltaBr('2026-11-09T17:10:00Z', agora)).toBe('em 2 h 10 min');
    expect(faltaBr('2026-11-09T14:48:00Z', agora)).toBe('há 12 min');
    expect(isoDeDataHora('2026-11-09', '14:00')).toBe('2026-11-09T14:00:00-03:00');
    expect(Date.parse(isoDeDataHora('2026-11-09', '12:00'))).toBe(agora);
  });

  it('alertas: meus retornos em ordem, ciência, resposta pendente e respostas recebidas', () => {
    const lista = [
      m({ id: 'r2', retorno_agendado_em: '2026-11-10T12:00:00Z', criado_por: 'eu', responsavel_id: null }),
      m({ id: 'r1', retorno_agendado_em: '2026-11-09T15:30:00Z', retorno_agendado_por: 'eu', responsavel_id: null }),
      m({ id: 'concluida', retorno_agendado_em: '2026-11-09T15:30:00Z', criado_por: 'eu', status: 'concluido' }),
      m({ id: 'alheia', retorno_agendado_em: '2026-11-09T15:30:00Z', criado_por: 'outro', responsavel_id: 'outro2' }),
      m({ id: 'ciencia', criado_por: 'chefe', responsavel_id: 'eu' }),
      m({ id: 'responder', criado_por: 'chefe', responsavel_id: 'eu', responsavel_ciente_em: '2026-11-09T13:00:00Z' }),
      m({ id: 'resposta', criado_por: 'eu', responsavel_id: 'fabio', responsavel_respondeu_em: '2026-11-09T14:00:00Z' }),
      m({ id: 'vista', criado_por: 'eu', responsavel_id: 'fabio', responsavel_respondeu_em: '2026-11-09T14:00:00Z',
          responsavel_resposta_vista_em: '2026-11-09T14:10:00Z' }),
    ];
    const a = alertasDe(lista, 'eu');
    expect(a.retornos.map(x => x.id)).toEqual(['r1', 'r2']);
    expect(a.paraCiencia.map(x => x.id)).toEqual(['ciencia']);
    expect(a.paraResponder.map(x => x.id)).toEqual(['responder']);
    expect(a.respostas.map(x => x.id)).toEqual(['resposta']);
  });

  it('encaminhar para si mesmo não é encaminhamento', () => {
    expect(situacaoEncaminhamento(m({ criado_por: 'eu', responsavel_id: 'eu' }))).toBe('sem');
    expect(situacaoEncaminhamento(m({ criado_por: 'eu', responsavel_id: 'fabio' }))).toBe('aguardando');
  });
});

describe('ouvidoria 2 — etiquetas e ticket', () => {
  const etiquetas: Etiqueta[] = [
    { id: 'pago', setor_id: 's', nome: 'Alegou ter pago', cor: 'verde', criado_por: null, criado_em: '' },
    { id: 'canc', setor_id: 's', nome: 'Alegou ter cancelado', cor: 'vermelho', criado_por: null, criado_em: '' },
  ];
  const caso = m({
    anuidades: [2021, 2022, 2023, 2024], anuidades_etiquetas: { 2023: 'pago', 2024: 'pago', 2022: 'canc', 1999: 'pago' },
    criado_por_nome: 'Mirella', responsavel_id: 'f', responsavel_nome: 'Fábio', ticket_pedido: 'Dar baixa em 2023 e 2024',
  });

  it('anuidades agrupadas pela cor, as sem cor primeiro', () => {
    expect(textoAnuidades(caso, etiquetas)).toBe('2021; 2023, 2024 (alegou ter pago); 2022 (alegou ter cancelado)');
    expect(etiquetasUsadas([caso], etiquetas).map(e => e.id)).toEqual(['pago', 'canc']);
  });

  it('o texto do ticket leva o essencial e nunca CPF', () => {
    const t = textoTicket(caso, { etiquetas, setorNome: 'Conecta Play', grupo: { codigo: 'GRP-0001', titulo: 'Pagou e não deu baixa' } });
    expect(t.split('\n')[0]).toBe('[OUVIDORIA COFEN] OUV-00001 — Cobrança indevida');
    expect(t).toContain('Grupo: GRP-0001 · Pagou e não deu baixa');
    expect(t).toContain('Código do cliente: 4521873');
    expect(t).toContain('Conselho: Coren-SP');
    expect(t).toContain('Anuidade(s): 2021; 2023, 2024 (alegou ter pago); 2022 (alegou ter cancelado)');
    expect(t).toContain('SOLICITAÇÃO\nDar baixa em 2023 e 2024');
    expect(t).toContain('Registrado por: Mirella · Responsável pela análise: Fábio');
    expect(t).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });

  it('o ticket do grupo lista cada profissional', () => {
    const g = { codigo: 'GRP-0001', titulo: 'Pagou e não deu baixa', assunto: 'cobranca_indevida', descricao: 'Pagou e segue em aberto',
                providencia: null } as Grupo;
    const t = textoTicketGrupo(g, [caso, m({ id: '2', codigo: 'OUV-00002', nome_profissional: 'Ana', codigo_cliente: null, anuidades: [] })],
      { etiquetas, setorNome: 'Conecta Play' });
    expect(t.split('\n')[0]).toBe('[OUVIDORIA COFEN] GRP-0001 — Pagou e não deu baixa (2 profissionais)');
    expect(t).toContain('1. João da Silva · Cód. 4521873 · Coren-SP');
    expect(t).toContain('2. Ana · Coren-SP · OUV-00002');
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

  it('cores da legenda = CHECK de ouvidoria_etiquetas (20261109120000)', () => {
    const v2 = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261109120000_ouvidoria_cofen_alertas_tickets_grupos.sql'), 'utf8');
    const trecho = v2.slice(v2.indexOf('CONSTRAINT ouvidoria_etiquetas_cor CHECK'));
    const cores = [...trecho.slice(0, trecho.indexOf(')')).matchAll(/'([a-z]+)'/g)].map(x => x[1]);
    expect(cores.sort()).toEqual(CORES_ETIQUETA.map(c => c.valor).sort());
  });
});
