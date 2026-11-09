/**
 * ouvidoria.ts — o vocabulário da aba Ouvidoria (regra Cofen) sem React:
 * tipos, opções dos campos, rótulos e as contas da tela (fila, indicadores,
 * filtros). A tela e o teste usam as mesmas funções.
 *
 * As listas de opções são as mesmas dos CHECK da migration 20261106150000.
 */
import { apenasDigitos } from '@/lib/cpf';

export interface SetorOuvidoria {
  setor_id: string;
  setor_nome: string;
  empresa_id: string;
  pode_gerir: boolean;
}

export type Canal = 'telefone' | 'whatsapp' | 'email' | 'ouvidoria' | 'outro';
export type Assunto = 'operador' | 'chatplay' | 'cobranca_indevida' | 'reclamacao_generica' | 'outros';
export type SituacaoFinanceira = 'em_aberto' | 'parcelada' | 'quitada' | 'judicializada' | 'outra';
export type Status = 'aberto' | 'em_andamento' | 'pendente_documentos' | 'encaminhado_coren' | 'concluido';

export interface Manifestacao {
  id: string;
  empresa_id: string;
  setor_id: string;
  numero: number;
  codigo: string;
  data_manifestacao: string;
  canal: Canal;
  nome_profissional: string;
  /** O mesmo «Código» do acordo na regra Cofen (só números). */
  codigo_cliente: string | null;
  conselho_uf: string | null;
  assunto: Assunto;
  descricao: string;
  anuidades: number[];
  situacao_financeira: SituacaoFinanceira | null;
  providencia: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  data_resposta: string | null;
  status: Status;
  acompanhar: boolean;
  observacoes: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_por_nome: string | null;
  atualizado_em: string;
}

export type TipoAndamento = 'criada' | 'status' | 'retorno' | 'responsavel' | 'acompanhamento' | 'edicao' | 'nota';

export interface Andamento {
  id: string;
  manifestacao_id: string;
  tipo: TipoAndamento;
  texto: string | null;
  status_de: Status | null;
  status_para: Status | null;
  autor_nome: string | null;
  criado_em: string;
}

export type OrigemAcesso = 'total' | 'liberado' | 'bloqueado' | 'cargo' | 'sem';

export interface PessoaOuvidoria {
  perfil_id: string;
  nome: string;
  cargo: string;
  foto_url: string | null;
  tem_acesso: boolean;
  origem: OrigemAcesso;
}

// ── Opções ───────────────────────────────────────────────────────────────────

export const CANAIS: readonly { valor: Canal; rotulo: string }[] = [
  { valor: 'telefone', rotulo: 'Telefone (0800)' },
  { valor: 'whatsapp', rotulo: 'WhatsApp' },
  { valor: 'email', rotulo: 'E-mail' },
  { valor: 'ouvidoria', rotulo: 'Ouvidoria' },
  { valor: 'outro', rotulo: 'Outro' },
];

export const ASSUNTOS: readonly { valor: Assunto; rotulo: string }[] = [
  { valor: 'operador', rotulo: 'Operador' },
  { valor: 'chatplay', rotulo: 'ChatPlay' },
  { valor: 'cobranca_indevida', rotulo: 'Cobrança indevida' },
  { valor: 'reclamacao_generica', rotulo: 'Reclamação genérica' },
  { valor: 'outros', rotulo: 'Outros' },
];

export const SITUACOES: readonly { valor: SituacaoFinanceira; rotulo: string }[] = [
  { valor: 'em_aberto', rotulo: 'Em aberto' },
  { valor: 'parcelada', rotulo: 'Parcelada' },
  { valor: 'quitada', rotulo: 'Quitada' },
  { valor: 'judicializada', rotulo: 'Judicializada' },
  { valor: 'outra', rotulo: 'Outra' },
];

/** Na ordem do caminho de um caso; `concluido` fecha. */
export const STATUS: readonly { valor: Status; rotulo: string }[] = [
  { valor: 'aberto', rotulo: 'Aberto' },
  { valor: 'em_andamento', rotulo: 'Em andamento' },
  { valor: 'pendente_documentos', rotulo: 'Pendente de documentos' },
  { valor: 'encaminhado_coren', rotulo: 'Encaminhado ao Coren' },
  { valor: 'concluido', rotulo: 'Concluído' },
];

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

/** O Coren mais comum primeiro; o resto em ordem alfabética. */
export const UFS_NO_SELETOR: readonly string[] = ['SP', 'MG', 'RJ', ...UFS.filter(u => !['SP', 'MG', 'RJ'].includes(u))];

const rotuloDe = <T extends string>(lista: readonly { valor: T; rotulo: string }[], v: T | null | undefined) =>
  (v && lista.find(x => x.valor === v)?.rotulo) || '—';

export const rotuloCanal = (v: Canal | null | undefined) => rotuloDe(CANAIS, v);
export const rotuloAssunto = (v: Assunto | null | undefined) => rotuloDe(ASSUNTOS, v);
export const rotuloSituacao = (v: SituacaoFinanceira | null | undefined) => rotuloDe(SITUACOES, v);
export const rotuloStatus = (v: Status | null | undefined) => rotuloDe(STATUS, v);
export const rotuloConselho = (uf: string | null | undefined) => (uf ? `Coren-${uf}` : '—');

export const ROTULO_ORIGEM: Record<OrigemAcesso, string> = {
  total: 'Acesso total',
  liberado: 'Liberado na aba',
  bloqueado: 'Bloqueado pelo administrador',
  cargo: 'Pelo cargo',
  sem: 'Sem acesso',
};

// ── Datas ────────────────────────────────────────────────────────────────────

/** `2026-11-06` → `06/11/2026`. */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '—';
}

/** Dias corridos entre duas datas ISO (só a parte da data). */
export function diasEntre(deIso: string, ateIso: string): number {
  const de = Date.UTC(+deIso.slice(0, 4), +deIso.slice(5, 7) - 1, +deIso.slice(8, 10));
  const ate = Date.UTC(+ateIso.slice(0, 4), +ateIso.slice(5, 7) - 1, +ateIso.slice(8, 10));
  return Math.round((ate - de) / 86_400_000);
}

// ── A fila ───────────────────────────────────────────────────────────────────

export const estaAberta = (m: Pick<Manifestacao, 'status'>) => m.status !== 'concluido';
export const teveRetorno = (m: Pick<Manifestacao, 'data_resposta'>) => !!m.data_resposta;

/** Uma acompanhada que ainda pede ação: aberta, ou concluída sem retorno ao profissional. */
export function pedeAcao(m: Pick<Manifestacao, 'acompanhar' | 'status' | 'data_resposta'>): boolean {
  return m.acompanhar && (estaAberta(m) || !teveRetorno(m));
}

/** A partir de quantos dias aberta uma acompanhada fica em alerta. */
export const DIAS_ALERTA = 5;

export interface Indicadores {
  total: number;
  acompanhadas: number;
  abertas: number;
  semRetorno: number;
  atrasadas: number;
  concluidasNoMes: number;
}

export function indicadores(lista: readonly Manifestacao[], hojeIso: string): Indicadores {
  const mes = hojeIso.slice(0, 7);
  let acompanhadas = 0; let abertas = 0; let semRetorno = 0; let atrasadas = 0; let concluidasNoMes = 0;
  for (const m of lista) {
    if (m.acompanhar) {
      acompanhadas += 1;
      if (estaAberta(m)) {
        abertas += 1;
        if (diasEntre(m.data_manifestacao, hojeIso) >= DIAS_ALERTA) atrasadas += 1;
      }
      if (!teveRetorno(m)) semRetorno += 1;
    }
    if (m.status === 'concluido' && (m.data_resposta ?? m.atualizado_em).slice(0, 7) === mes) concluidasNoMes += 1;
  }
  return { total: lista.length, acompanhadas, abertas, semRetorno, atrasadas, concluidasNoMes };
}

export type Visao = 'acompanhamento' | 'todas' | 'historico';

export interface Filtros {
  visao: Visao;
  busca: string;
  status: Status | 'todos' | 'abertos';
  assunto: Assunto | 'todos';
  canal: Canal | 'todos';
  retorno: 'todos' | 'com' | 'sem';
  responsavel: string | 'todos' | 'meus';
}

export const FILTROS_INICIAIS: Filtros = {
  visao: 'acompanhamento', busca: '', status: 'todos', assunto: 'todos', canal: 'todos',
  retorno: 'todos', responsavel: 'todos',
};

/** Sem acento e em minúsculas, para a busca casar «joao» com «João». */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrar(lista: readonly Manifestacao[], f: Filtros, meuId: string | null): Manifestacao[] {
  const busca = normalizar(f.busca.trim());
  const buscaDigitos = apenasDigitos(f.busca);
  return lista.filter(m => {
    if (f.visao === 'acompanhamento' && !m.acompanhar) return false;
    if (f.visao === 'historico' && m.acompanhar) return false;
    if (f.status === 'abertos' && !estaAberta(m)) return false;
    if (f.status !== 'todos' && f.status !== 'abertos' && m.status !== f.status) return false;
    if (f.assunto !== 'todos' && m.assunto !== f.assunto) return false;
    if (f.canal !== 'todos' && m.canal !== f.canal) return false;
    if (f.retorno === 'com' && !teveRetorno(m)) return false;
    if (f.retorno === 'sem' && teveRetorno(m)) return false;
    if (f.responsavel === 'meus' && m.responsavel_id !== meuId) return false;
    if (f.responsavel !== 'todos' && f.responsavel !== 'meus' && m.responsavel_id !== f.responsavel) return false;
    if (busca) {
      const alvo = normalizar([
        m.codigo, m.nome_profissional, m.descricao, m.providencia ?? '', m.observacoes ?? '',
        m.responsavel_nome ?? '', m.anuidades.join(' '),
      ].join(' '));
      const codigoCasa = buscaDigitos.length >= 3 && (m.codigo_cliente ?? '').includes(buscaDigitos);
      if (!alvo.includes(busca) && !codigoCasa) return false;
    }
    return true;
  });
}

/**
 * A ordem da fila: no acompanhamento, quem pede ação primeiro e o mais antigo
 * no topo; no resto, o mais recente primeiro.
 */
export function ordenar(lista: readonly Manifestacao[], visao: Visao): Manifestacao[] {
  const copia = [...lista];
  if (visao !== 'acompanhamento') {
    return copia.sort((a, b) => b.data_manifestacao.localeCompare(a.data_manifestacao) || b.numero - a.numero);
  }
  return copia.sort((a, b) =>
    Number(pedeAcao(b)) - Number(pedeAcao(a))
    || a.data_manifestacao.localeCompare(b.data_manifestacao)
    || a.numero - b.numero);
}

/** Anos oferecidos no seletor de anuidade: do ano corrente até 2010. */
export function anosDeAnuidade(hojeIso: string): number[] {
  const atual = +hojeIso.slice(0, 4);
  return Array.from({ length: atual - 2010 + 1 }, (_, i) => atual - i);
}

/** Linhas para exportar (CSV). */
export function paraLinhas(lista: readonly Manifestacao[]): string[][] {
  return [
    ['Código', 'Data da manifestação', 'Canal', 'Profissional', 'Código do cliente', 'Conselho', 'Assunto', 'Descrição',
      'Anuidade', 'Situação financeira', 'Providência', 'Responsável', 'Data da resposta', 'Status',
      'Acompanhamento', 'Observações'],
    ...lista.map(m => [
      m.codigo, dataBr(m.data_manifestacao), rotuloCanal(m.canal), m.nome_profissional, m.codigo_cliente ?? '',
      m.conselho_uf ? rotuloConselho(m.conselho_uf) : '', rotuloAssunto(m.assunto), m.descricao,
      m.anuidades.join(', '), m.situacao_financeira ? rotuloSituacao(m.situacao_financeira) : '',
      m.providencia ?? '', m.responsavel_nome ?? '', m.data_resposta ? dataBr(m.data_resposta) : '',
      rotuloStatus(m.status), m.acompanhar ? 'Sim' : 'Não', m.observacoes ?? '',
    ]),
  ];
}

/** CSV com «;» (o Excel em português abre direto), aspas onde precisa. */
export function paraCsv(linhas: readonly (readonly string[])[]): string {
  const celula = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return linhas.map(l => l.map(celula).join(';')).join('\r\n') + '\r\n';
}
