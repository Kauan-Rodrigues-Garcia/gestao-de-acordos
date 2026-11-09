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
export type TicketStatus = 'pendente' | 'aberto';
export type CorEtiqueta = 'verde' | 'vermelho' | 'amarelo' | 'azul' | 'roxo' | 'laranja' | 'rosa' | 'cinza';

/** Uma cor da legenda das anuidades («verde = alegou ter pago»), do setor. */
export interface Etiqueta {
  id: string;
  setor_id: string;
  nome: string;
  cor: CorEtiqueta;
  criado_por: string | null;
  criado_em: string;
}

/** Reclamação repetida do dia: o assunto e o relato padrão de várias manifestações. */
export interface Grupo {
  id: string;
  empresa_id: string;
  setor_id: string;
  numero: number;
  codigo: string;
  titulo: string;
  assunto: Assunto;
  canal: Canal | null;
  descricao: string;
  providencia: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  encerrado_em: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

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
  // ── 20261109120000 (opcionais: o laboratório e linha antiga podem não ter) ──
  grupo_id?: string | null;
  /** Etiqueta de cada ano: { "2024": "<id da etiqueta>" }. */
  anuidades_etiquetas?: Record<string, string>;
  retorno_agendado_em?: string | null;
  retorno_agendado_nota?: string | null;
  retorno_agendado_por?: string | null;
  retorno_agendado_por_nome?: string | null;
  responsavel_encaminhado_em?: string | null;
  responsavel_ciente_em?: string | null;
  responsavel_respondeu_em?: string | null;
  responsavel_resposta_vista_em?: string | null;
  ticket_status?: TicketStatus | null;
  ticket_pedido?: string | null;
  ticket_numero?: string | null;
  ticket_aberto_em?: string | null;
  ticket_aberto_por_nome?: string | null;
}

export type TipoAndamento =
  | 'criada' | 'status' | 'retorno' | 'responsavel' | 'acompanhamento' | 'edicao' | 'nota'
  | 'agendamento' | 'ciencia' | 'resposta' | 'ticket' | 'grupo';

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

/** As cores da legenda das anuidades (mesma lista do CHECK de 20261109120000). */
export const CORES_ETIQUETA: readonly { valor: CorEtiqueta; rotulo: string }[] = [
  { valor: 'verde', rotulo: 'Verde' },
  { valor: 'vermelho', rotulo: 'Vermelho' },
  { valor: 'amarelo', rotulo: 'Amarelo' },
  { valor: 'azul', rotulo: 'Azul' },
  { valor: 'roxo', rotulo: 'Roxo' },
  { valor: 'laranja', rotulo: 'Laranja' },
  { valor: 'rosa', rotulo: 'Rosa' },
  { valor: 'cinza', rotulo: 'Cinza' },
];

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

/**
 * As abas da lista. `tickets` = os que falta abrir no sistema Mundial;
 * `grupos` mostra os grupos (a lista dela é das manifestações em grupo).
 */
export type Visao = 'acompanhamento' | 'todas' | 'historico' | 'tickets' | 'grupos';

export interface Filtros {
  visao: Visao;
  busca: string;
  status: Status | 'todos' | 'abertos';
  assunto: Assunto | 'todos';
  canal: Canal | 'todos';
  retorno: 'todos' | 'com' | 'sem';
  /** `meus` = registrei, foi encaminhada para mim ou agendei o retorno. */
  responsavel: string | 'todos' | 'meus';
  /** Período pela data da manifestação (ISO, vazio = sem limite). */
  de: string;
  ate: string;
}

export const FILTROS_INICIAIS: Filtros = {
  visao: 'acompanhamento', busca: '', status: 'todos', assunto: 'todos', canal: 'todos',
  retorno: 'todos', responsavel: 'todos', de: '', ate: '',
};

/** Registrei, recebi o encaminhamento ou agendei o retorno. */
export function ehMinha(
  m: Pick<Manifestacao, 'criado_por' | 'responsavel_id' | 'retorno_agendado_por'>, meuId: string | null,
): boolean {
  return !!meuId && (m.criado_por === meuId || m.responsavel_id === meuId || m.retorno_agendado_por === meuId);
}

/** Sem acento e em minúsculas, para a busca casar «joao» com «João». */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrar(lista: readonly Manifestacao[], f: Filtros, meuId: string | null): Manifestacao[] {
  const busca = normalizar(f.busca.trim());
  const buscaDigitos = apenasDigitos(f.busca);
  return lista.filter(m => {
    if (f.visao === 'acompanhamento' && !m.acompanhar) return false;
    if (f.visao === 'historico' && m.acompanhar) return false;
    if (f.visao === 'tickets' && m.ticket_status !== 'pendente') return false;
    if (f.visao === 'grupos' && !m.grupo_id) return false;
    if (f.de && m.data_manifestacao < f.de) return false;
    if (f.ate && m.data_manifestacao > f.ate) return false;
    if (f.status === 'abertos' && !estaAberta(m)) return false;
    if (f.status !== 'todos' && f.status !== 'abertos' && m.status !== f.status) return false;
    if (f.assunto !== 'todos' && m.assunto !== f.assunto) return false;
    if (f.canal !== 'todos' && m.canal !== f.canal) return false;
    if (f.retorno === 'com' && !teveRetorno(m)) return false;
    if (f.retorno === 'sem' && teveRetorno(m)) return false;
    if (f.responsavel === 'meus' && !ehMinha(m, meuId)) return false;
    if (f.responsavel !== 'todos' && f.responsavel !== 'meus' && m.responsavel_id !== f.responsavel) return false;
    if (busca) {
      const alvo = normalizar([
        m.codigo, m.nome_profissional, m.descricao, m.providencia ?? '', m.observacoes ?? '',
        m.responsavel_nome ?? '', m.criado_por_nome ?? '', m.anuidades.join(' '), m.ticket_numero ?? '',
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
  if (visao !== 'acompanhamento' && visao !== 'tickets') {
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

// ── Etiquetas das anuidades ──────────────────────────────────────────────────

export interface AnoComEtiqueta { ano: number; etiqueta: Etiqueta | null }

/** Cada ano da manifestação com a sua etiqueta (ou nenhuma). */
export function anosComEtiqueta(
  m: Pick<Manifestacao, 'anuidades' | 'anuidades_etiquetas'>, etiquetas: readonly Etiqueta[],
): AnoComEtiqueta[] {
  const porId = new Map(etiquetas.map(e => [e.id, e]));
  return m.anuidades.map(ano => ({ ano, etiqueta: porId.get(m.anuidades_etiquetas?.[String(ano)] ?? '') ?? null }));
}

/** «2023, 2024 (alegou ter pago), 2022 (alegou ter cancelado)» — os sem etiqueta primeiro. */
export function textoAnuidades(m: Pick<Manifestacao, 'anuidades' | 'anuidades_etiquetas'>, etiquetas: readonly Etiqueta[]): string {
  const anos = anosComEtiqueta(m, etiquetas);
  if (!anos.length) return '';
  const partes: string[] = [];
  const soltos = anos.filter(a => !a.etiqueta).map(a => a.ano);
  if (soltos.length) partes.push(soltos.join(', '));
  // As cores na ordem da legenda, como aparecem na tela.
  for (const e of etiquetas) {
    const deste = anos.filter(a => a.etiqueta?.id === e.id).map(a => a.ano);
    if (deste.length) partes.push(`${deste.join(', ')} (${e.nome.toLowerCase()})`);
  }
  return partes.join('; ');
}

/** As etiquetas usadas em uma ou mais manifestações, para a legenda. */
export function etiquetasUsadas(
  lista: readonly Pick<Manifestacao, 'anuidades' | 'anuidades_etiquetas'>[], etiquetas: readonly Etiqueta[],
): Etiqueta[] {
  const ids = new Set<string>();
  for (const m of lista) for (const a of anosComEtiqueta(m, etiquetas)) if (a.etiqueta) ids.add(a.etiqueta.id);
  return etiquetas.filter(e => ids.has(e.id));
}

// ── Retorno agendado ─────────────────────────────────────────────────────────

/** Quanto antes do horário a aba começa a avisar. */
export const ANTECEDENCIA_MINUTOS = 60;

/**
 *   atrasado  o horário passou e o retorno não foi dado
 *   agora     falta {@link ANTECEDENCIA_MINUTOS} ou menos — o card pisca
 *   hoje      ainda hoje, mais tarde
 *   depois    outro dia
 */
export type UrgenciaRetorno = 'atrasado' | 'agora' | 'hoje' | 'depois';

const BR = 'America/Sao_Paulo';
const diaBr = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: BR, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

export function minutosAte(iso: string, agoraMs: number): number {
  return Math.round((Date.parse(iso) - agoraMs) / 60_000);
}

export function urgenciaRetorno(iso: string, agoraMs: number): UrgenciaRetorno {
  const min = (Date.parse(iso) - agoraMs) / 60_000;
  if (min < 0) return 'atrasado';
  if (min <= ANTECEDENCIA_MINUTOS) return 'agora';
  return diaBr(Date.parse(iso)) === diaBr(agoraMs) ? 'hoje' : 'depois';
}

/** `14:05` no horário de Brasília. */
export function horaBr(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: BR, hour: '2-digit', minute: '2-digit' });
}

/** «hoje às 14:00», «amanhã às 09:00», «12/11 às 14:00». */
export function quandoBr(iso: string, agoraMs: number): string {
  const ms = Date.parse(iso);
  const dia = diaBr(ms);
  const hoje = diaBr(agoraMs);
  const amanha = diaBr(agoraMs + 86_400_000);
  const ontem = diaBr(agoraMs - 86_400_000);
  const rotulo = dia === hoje ? 'hoje' : dia === amanha ? 'amanhã' : dia === ontem ? 'ontem' : dataBr(dia).slice(0, 5);
  return `${rotulo} às ${horaBr(iso)}`;
}

/** «em 45 min», «em 2 h 10 min», «há 12 min» (atrasado). */
export function faltaBr(iso: string, agoraMs: number): string {
  const min = minutosAte(iso, agoraMs);
  const abs = Math.abs(min);
  const texto = abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)} h${abs % 60 ? ` ${abs % 60} min` : ''}`;
  if (min < 0) return `há ${texto}`;
  return min === 0 ? 'agora' : `em ${texto}`;
}

/** Dia e hora escolhidos na tela (Brasília, sem horário de verão desde 2019) → ISO. */
export function isoDeDataHora(dataIso: string, hora: string): string {
  return `${dataIso}T${hora}:00-03:00`;
}

/** Retorno agendado ainda valendo (aberta e em acompanhamento). */
export const temRetornoAgendado = (m: Manifestacao): m is Manifestacao & { retorno_agendado_em: string } =>
  !!m.retorno_agendado_em && m.acompanhar && estaAberta(m);

// ── Encaminhamento ───────────────────────────────────────────────────────────

/**
 *   sem          ninguém acima (ou encaminhou para si mesmo)
 *   aguardando   encaminhada, sem ciência ainda
 *   ciente       o encaminhado viu e está analisando
 *   respondida   o encaminhado respondeu
 */
export type SituacaoEncaminhamento = 'sem' | 'aguardando' | 'ciente' | 'respondida';

export function situacaoEncaminhamento(m: Manifestacao): SituacaoEncaminhamento {
  if (!m.responsavel_id || m.responsavel_id === m.criado_por) return 'sem';
  if (m.responsavel_respondeu_em) return 'respondida';
  if (m.responsavel_ciente_em) return 'ciente';
  return 'aguardando';
}

// ── Os alertas da pessoa ─────────────────────────────────────────────────────

export interface Alertas {
  /** Retornos agendados que são meus, do mais próximo ao mais longe. */
  retornos: (Manifestacao & { retorno_agendado_em: string })[];
  /** Encaminhadas para mim que ainda esperam a minha ciência. */
  paraCiencia: Manifestacao[];
  /** Encaminhadas para mim, com ciência, ainda sem resposta minha. */
  paraResponder: Manifestacao[];
  /** Registrei, encaminhei, e o responsável respondeu: falta eu ver. */
  respostas: Manifestacao[];
}

export function alertasDe(lista: readonly Manifestacao[], meuId: string | null): Alertas {
  const r: Alertas = { retornos: [], paraCiencia: [], paraResponder: [], respostas: [] };
  if (!meuId) return r;
  for (const m of lista) {
    if (temRetornoAgendado(m) && ehMinha(m, meuId)) r.retornos.push(m);
    const enc = situacaoEncaminhamento(m);
    if (m.responsavel_id === meuId && estaAberta(m)) {
      if (enc === 'aguardando') r.paraCiencia.push(m);
      else if (enc === 'ciente') r.paraResponder.push(m);
    }
    if (m.criado_por === meuId && enc === 'respondida' && !m.responsavel_resposta_vista_em) r.respostas.push(m);
  }
  r.retornos.sort((a, b) => a.retorno_agendado_em.localeCompare(b.retorno_agendado_em));
  return r;
}

// ── Ticket (sistema Mundial) ─────────────────────────────────────────────────

export interface ContextoTicket {
  etiquetas: readonly Etiqueta[];
  setorNome: string;
  grupo?: Pick<Grupo, 'codigo' | 'titulo'> | null;
}

const PEDIDO_PADRAO = 'Verificar o caso acima e retornar à Ouvidoria com a solução.';

/**
 * O texto padrão do ticket, para colar no sistema Mundial. Nunca leva CPF
 * (a manifestação não guarda): o profissional vai pelo código do cliente.
 */
export function textoTicket(m: Manifestacao, ctx: ContextoTicket): string {
  const linhas: string[] = [];
  linhas.push(`[OUVIDORIA COFEN] ${m.codigo} — ${rotuloAssunto(m.assunto)}`);
  linhas.push(`Setor: ${ctx.setorNome} · Manifestação em ${dataBr(m.data_manifestacao)} · Canal: ${rotuloCanal(m.canal)}`);
  if (ctx.grupo) linhas.push(`Grupo: ${ctx.grupo.codigo} · ${ctx.grupo.titulo}`);
  linhas.push('');
  linhas.push('PROFISSIONAL');
  linhas.push(`Nome: ${m.nome_profissional}`);
  if (m.codigo_cliente) linhas.push(`Código do cliente: ${m.codigo_cliente}`);
  if (m.conselho_uf) linhas.push(`Conselho: ${rotuloConselho(m.conselho_uf)}`);
  const anuidades = textoAnuidades(m, ctx.etiquetas);
  if (anuidades) linhas.push(`Anuidade(s): ${anuidades}`);
  if (m.situacao_financeira) linhas.push(`Situação financeira: ${rotuloSituacao(m.situacao_financeira)}`);
  linhas.push('');
  linhas.push('RELATO DO PROFISSIONAL');
  linhas.push(m.descricao.trim());
  if (m.providencia?.trim()) {
    linhas.push('');
    linhas.push('PROVIDÊNCIA JÁ ADOTADA');
    linhas.push(m.providencia.trim());
  }
  linhas.push('');
  linhas.push('SOLICITAÇÃO');
  linhas.push(m.ticket_pedido?.trim() || PEDIDO_PADRAO);
  linhas.push('');
  linhas.push([
    `Registrado por: ${m.criado_por_nome ?? '—'}`,
    m.responsavel_nome && m.responsavel_id !== m.criado_por ? `Responsável pela análise: ${m.responsavel_nome}` : null,
  ].filter(Boolean).join(' · '));
  return linhas.join('\n');
}

/** Um ticket só para o grupo inteiro: a reclamação em comum e a lista de profissionais. */
export function textoTicketGrupo(g: Grupo, membros: readonly Manifestacao[], ctx: Omit<ContextoTicket, 'grupo'>): string {
  const linhas: string[] = [];
  linhas.push(`[OUVIDORIA COFEN] ${g.codigo} — ${g.titulo} (${membros.length} ${membros.length === 1 ? 'profissional' : 'profissionais'})`);
  linhas.push(`Setor: ${ctx.setorNome} · Assunto: ${rotuloAssunto(g.assunto)}`);
  linhas.push('');
  linhas.push('RECLAMAÇÃO EM COMUM');
  linhas.push(g.descricao.trim());
  linhas.push('');
  linhas.push('PROFISSIONAIS');
  membros.forEach((m, i) => {
    const anuidades = textoAnuidades(m, ctx.etiquetas);
    linhas.push(`${i + 1}. ${[
      m.nome_profissional,
      m.codigo_cliente ? `Cód. ${m.codigo_cliente}` : null,
      m.conselho_uf ? rotuloConselho(m.conselho_uf) : null,
      anuidades ? `Anuidade ${anuidades}` : null,
      m.codigo,
    ].filter(Boolean).join(' · ')}`);
    if (m.observacoes?.trim()) linhas.push(`   Obs.: ${m.observacoes.trim()}`);
  });
  if (g.providencia?.trim()) {
    linhas.push('');
    linhas.push('PROVIDÊNCIA JÁ ADOTADA');
    linhas.push(g.providencia.trim());
  }
  linhas.push('');
  linhas.push('SOLICITAÇÃO');
  linhas.push('Verificar os casos acima e retornar à Ouvidoria com a solução.');
  return linhas.join('\n');
}

// ── Exportar ─────────────────────────────────────────────────────────────────

/** Linhas para exportar (CSV). */
export function paraLinhas(
  lista: readonly Manifestacao[],
  ctx: { etiquetas?: readonly Etiqueta[]; grupos?: readonly Grupo[] } = {},
): string[][] {
  const grupos = new Map((ctx.grupos ?? []).map(g => [g.id, g]));
  const etiquetas = ctx.etiquetas ?? [];
  return [
    ['Código', 'Data da manifestação', 'Canal', 'Profissional', 'Código do cliente', 'Conselho', 'Assunto', 'Descrição',
      'Anuidade', 'Situação financeira', 'Providência', 'Registrado por', 'Encaminhado para', 'Data da resposta', 'Status',
      'Acompanhamento', 'Grupo', 'Ticket', 'Observações'],
    ...lista.map(m => [
      m.codigo, dataBr(m.data_manifestacao), rotuloCanal(m.canal), m.nome_profissional, m.codigo_cliente ?? '',
      m.conselho_uf ? rotuloConselho(m.conselho_uf) : '', rotuloAssunto(m.assunto), m.descricao,
      textoAnuidades(m, etiquetas), m.situacao_financeira ? rotuloSituacao(m.situacao_financeira) : '',
      m.providencia ?? '', m.criado_por_nome ?? '', m.responsavel_nome ?? '',
      m.data_resposta ? dataBr(m.data_resposta) : '',
      rotuloStatus(m.status), m.acompanhar ? 'Sim' : 'Não',
      m.grupo_id ? (grupos.get(m.grupo_id)?.codigo ?? '') : '',
      m.ticket_status === 'pendente' ? 'Pendente' : m.ticket_status === 'aberto' ? `Aberto${m.ticket_numero ? ` nº ${m.ticket_numero}` : ''}` : '',
      m.observacoes ?? '',
    ]),
  ];
}

/** CSV com «;» (o Excel em português abre direto), aspas onde precisa. */
export function paraCsv(linhas: readonly (readonly string[])[]): string {
  const celula = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return linhas.map(l => l.map(celula).join(';')).join('\r\n') + '\r\n';
}
