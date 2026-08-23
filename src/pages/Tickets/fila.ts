/**
 * fila.ts — as perguntas que a fila de tickets responde.
 *
 * Tudo aqui é função pura sobre `Ticket[]`. A tela não decide o que é "parado",
 * o que é "meu" nem em que ordem as coisas aparecem — ela pergunta. É o que
 * permite testar a fila sem montar componente, e é o que impede que a regra de
 * envelhecimento seja escrita de um jeito no cartão e de outro no contador.
 *
 * ## Por que segmento e não só filtro
 *
 * Um filtro responde "me mostre X". Um segmento responde "o que precisa de
 * mim?". São perguntas diferentes, e a segunda é a que faz alguém abrir a aba:
 *
 *   • **Na fila** — tudo que ainda pede alguma coisa de alguém;
 *   • **Comigo** — o que eu assumi e ainda não terminei;
 *   • **Sem dono** — aberto e sem responsável: a pior categoria de todas,
 *     porque ninguém está olhando e o sistema não avisa ninguém;
 *   • **Parados** — tem dono, mas não se move há tempo demais para a prioridade
 *     que tem;
 *   • **Encerrados** — concluído, recusado, cancelado.
 *
 * ## Envelhecimento, e por que ele não é um SLA
 *
 * Não há contrato de prazo aqui, e inventar um produziria uma tela cheia de
 * vermelho que todo mundo aprenderia a ignorar em duas semanas. O que existe é
 * um limiar por prioridade: passou dele sem nenhum movimento, o cartão ganha um
 * aviso discreto. Urgente que não anda há duas horas é notícia; "baixa" que não
 * anda há dois dias não é.
 *
 * O relógio é `atualizadoEm`, não `criadoEm`: um ticket de três semanas que
 * recebeu resposta agora há pouco está sendo tratado, e marcá-lo de vermelho
 * seria punir quem está trabalhando nele.
 */
import type { Ticket } from '@/services/tickets.service';
import {
  STATUS_FECHADOS, type PrioridadeTicket, type StatusTicket,
} from './categorias';

// ── Segmentos ────────────────────────────────────────────────────────────────

export type Segmento = 'fila' | 'meus' | 'sem_dono' | 'parados' | 'encerrados' | 'todos';

export interface DefinicaoSegmento {
  chave: Segmento;
  label: string;
  /** Frase curta para o `title` — a tela tem espaço para o rótulo, não para isto. */
  ajuda: string;
}

/**
 * A ordem é a de leitura, e ela conta uma história: o que existe, o que é meu,
 * o que não é de ninguém, o que apodreceu, o que acabou.
 */
export const SEGMENTOS: DefinicaoSegmento[] = [
  { chave: 'fila',       label: 'Na fila',    ajuda: 'Tudo que ainda pede alguma coisa de alguém' },
  { chave: 'meus',       label: 'Comigo',     ajuda: 'Você assumiu e ainda não encerrou' },
  { chave: 'sem_dono',   label: 'Sem dono',   ajuda: 'Aberto e sem responsável — ninguém está olhando' },
  { chave: 'parados',    label: 'Parados',    ajuda: 'Sem movimento além do limite da prioridade' },
  { chave: 'encerrados', label: 'Encerrados', ajuda: 'Concluído, recusado ou cancelado' },
  { chave: 'todos',      label: 'Todos',      ajuda: 'A fila inteira, sem recorte' },
];

// ── Envelhecimento ───────────────────────────────────────────────────────────

const HORA = 60 * 60 * 1000;

/**
 * Quanto tempo sem movimento até o ticket virar aviso, por prioridade.
 *
 * Os números saíram do uso: urgente é coisa de "estou parado agora", e duas
 * horas é o tempo de alguém almoçar; alta é do dia; normal é do dia útil
 * seguinte; baixa é o que se olha na semana.
 */
export const LIMITE_PARADO_MS: Record<PrioridadeTicket, number> = {
  urgente: 2 * HORA,
  alta:    8 * HORA,
  normal:  24 * HORA,
  baixa:   72 * HORA,
};

/** Está encerrado — não pede mais nada de ninguém. */
export function estaFechado(t: Ticket): boolean {
  return STATUS_FECHADOS.includes(t.status);
}

/** Milissegundos desde o último movimento do ticket. */
export function tempoSemMovimento(t: Ticket, agora = Date.now()): number {
  const carimbo = Date.parse(t.atualizadoEm || t.criadoEm);
  if (Number.isNaN(carimbo)) return 0;
  return Math.max(0, agora - carimbo);
}

/**
 * Passou do limite da própria prioridade?
 *
 * Ticket encerrado nunca está parado: ele chegou onde ia. Sem esta linha, a
 * aba abriria com dezenas de "parados" que são só o histórico do mês passado.
 */
export function estaParado(t: Ticket, agora = Date.now()): boolean {
  if (estaFechado(t)) return false;
  return tempoSemMovimento(t, agora) > LIMITE_PARADO_MS[t.prioridade];
}

/** Três faixas para o cartão: em dia, chegando no limite, passou. */
export type Temperatura = 'em_dia' | 'atencao' | 'parado';

export function temperatura(t: Ticket, agora = Date.now()): Temperatura {
  if (estaFechado(t)) return 'em_dia';
  const decorrido = tempoSemMovimento(t, agora);
  const limite = LIMITE_PARADO_MS[t.prioridade];
  if (decorrido > limite) return 'parado';
  // Dois terços do limite: cedo o bastante para dar tempo de agir, tarde o
  // bastante para não marcar de amarelo um ticket aberto há dez minutos.
  if (decorrido > limite * (2 / 3)) return 'atencao';
  return 'em_dia';
}

// ── Segmentação ──────────────────────────────────────────────────────────────

export function pertenceAoSegmento(
  t: Ticket, segmento: Segmento, meuId: string | null, agora = Date.now(),
): boolean {
  switch (segmento) {
    case 'todos':      return true;
    case 'encerrados': return estaFechado(t);
    case 'fila':       return !estaFechado(t);
    case 'meus':       return !estaFechado(t) && !!meuId && t.responsavelId === meuId;
    case 'sem_dono':   return !estaFechado(t) && !t.responsavelId;
    case 'parados':    return estaParado(t, agora);
  }
}

/**
 * Quantos tickets em cada segmento.
 *
 * Uma passada só na lista: os contadores ficam no topo da tela e recalculá-los
 * seis vezes a cada evento de tempo real seria pagar seis varreduras para
 * mostrar seis números.
 */
export function contarSegmentos(
  tickets: readonly Ticket[], meuId: string | null, agora = Date.now(),
): Record<Segmento, number> {
  const conta: Record<Segmento, number> = {
    fila: 0, meus: 0, sem_dono: 0, parados: 0, encerrados: 0, todos: 0,
  };
  for (const t of tickets) {
    conta.todos++;
    const fechado = estaFechado(t);
    if (fechado) { conta.encerrados++; continue; }
    conta.fila++;
    if (meuId && t.responsavelId === meuId) conta.meus++;
    if (!t.responsavelId) conta.sem_dono++;
    if (estaParado(t, agora)) conta.parados++;
  }
  return conta;
}

// ── Filtro ───────────────────────────────────────────────────────────────────

export interface CriteriosFila {
  segmento: Segmento;
  /** Estado exato. `null` = qualquer um dentro do segmento. */
  status: StatusTicket | null;
  categoria: string | null;
  prioridade: PrioridadeTicket | null;
  /** Id do responsável, `'ninguem'` para os sem dono, `null` para qualquer. */
  responsavel: string | null;
  empresaId: string | null;
  busca: string;
}

export const CRITERIOS_VAZIOS: CriteriosFila = {
  segmento: 'fila', status: null, categoria: null, prioridade: null,
  responsavel: null, empresaId: null, busca: '',
};

/**
 * A busca varre número, assunto, quem abriu, quem responde e a descrição.
 *
 * A descrição entra porque é lá que mora o texto que a pessoa lembra ("aquele
 * do boleto que não gerava"); o número entra sem `#` porque ninguém digita o
 * jogo da velha.
 */
function casaBusca(t: Ticket, termo: string): boolean {
  if (!termo) return true;
  const alvo = termo.replace(/^#/, '');
  return (
    String(t.numero).includes(alvo)
    || t.assunto.toLowerCase().includes(alvo)
    || (t.abertoPorNome ?? '').toLowerCase().includes(alvo)
    || (t.responsavelNome ?? '').toLowerCase().includes(alvo)
    || (t.descricao ?? '').toLowerCase().includes(alvo)
  );
}

export function filtrarFila(
  tickets: readonly Ticket[], criterios: CriteriosFila,
  meuId: string | null, agora = Date.now(),
): Ticket[] {
  const termo = criterios.busca.trim().toLowerCase();
  return tickets.filter(t => {
    if (!pertenceAoSegmento(t, criterios.segmento, meuId, agora)) return false;
    if (criterios.status && t.status !== criterios.status) return false;
    if (criterios.categoria && t.categoria !== criterios.categoria) return false;
    if (criterios.prioridade && t.prioridade !== criterios.prioridade) return false;
    if (criterios.empresaId && t.empresaId !== criterios.empresaId) return false;
    if (criterios.responsavel) {
      if (criterios.responsavel === 'ninguem') {
        if (t.responsavelId) return false;
      } else if (t.responsavelId !== criterios.responsavel) return false;
    }
    return casaBusca(t, termo);
  });
}

// ── Ordenação ────────────────────────────────────────────────────────────────

export type Ordem = 'urgencia' | 'recentes' | 'antigos' | 'movimento';

export const ORDENS: { chave: Ordem; label: string }[] = [
  { chave: 'urgencia',  label: 'Mais urgente' },
  { chave: 'movimento', label: 'Parado há mais tempo' },
  { chave: 'recentes',  label: 'Abertos recentemente' },
  { chave: 'antigos',   label: 'Abertos há mais tempo' },
];

const PESO_PRIORIDADE: Record<PrioridadeTicket, number> = {
  urgente: 0, alta: 1, normal: 2, baixa: 3,
};

/**
 * A ordenação padrão é `urgencia`, e ela tem dois níveis de propósito.
 *
 * Só por prioridade, dez tickets "alta" ficariam em ordem aleatória entre si.
 * O desempate é o tempo sem movimento: dentro da mesma prioridade, o que está
 * há mais tempo parado sobe. É a fila que a liderança precisa ver — não a mais
 * nova, a mais esquecida.
 *
 * Não muta a lista de entrada: ela vem do estado do React e é tratada como
 * imutável em todo o projeto.
 */
export function ordenarFila(
  tickets: readonly Ticket[], ordem: Ordem, agora = Date.now(),
): Ticket[] {
  const copia = [...tickets];
  switch (ordem) {
    case 'urgencia':
      return copia.sort((a, b) =>
        PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade]
        || tempoSemMovimento(b, agora) - tempoSemMovimento(a, agora));
    case 'movimento':
      return copia.sort((a, b) => tempoSemMovimento(b, agora) - tempoSemMovimento(a, agora));
    case 'recentes':
      return copia.sort((a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm));
    case 'antigos':
      return copia.sort((a, b) => Date.parse(a.criadoEm) - Date.parse(b.criadoEm));
  }
}

// ── Agrupamento ──────────────────────────────────────────────────────────────

export type Agrupamento = 'nenhum' | 'status' | 'prioridade' | 'categoria';

export interface GrupoFila {
  chave: string;
  tickets: Ticket[];
}

/**
 * Divide a fila em blocos preservando a ORDEM que ela já tinha.
 *
 * Os grupos aparecem na ordem em que a primeira ocorrência de cada um apareceu
 * na lista ordenada — ou seja, agrupar por prioridade numa fila ordenada por
 * urgência põe "urgente" no topo sem precisar de uma segunda tabela de pesos.
 */
export function agruparFila(tickets: readonly Ticket[], por: Agrupamento): GrupoFila[] {
  if (por === 'nenhum') return [{ chave: '', tickets: [...tickets] }];

  const grupos = new Map<string, Ticket[]>();
  for (const t of tickets) {
    const chave = por === 'status' ? t.status
      : por === 'prioridade' ? t.prioridade
      : t.categoria;
    const atual = grupos.get(chave);
    if (atual) atual.push(t);
    else grupos.set(chave, [t]);
  }
  return [...grupos].map(([chave, lista]) => ({ chave, tickets: lista }));
}

// ── Texto de tempo ───────────────────────────────────────────────────────────

/**
 * "há 3 h", "há 2 d". Curto porque vive dentro do cartão, ao lado do assunto.
 *
 * Abaixo de um minuto é "agora": o cartão que acabou de mudar não deve exibir
 * um contador de segundos correndo, que puxa o olho para o lugar errado.
 */
export function textoDeIdade(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `há ${dias} d`;
  return `há ${Math.floor(dias / 30)} mês`;
}

/**
 * As iniciais que aparecem quando a pessoa não tem foto.
 *
 * Duas letras no máximo: três já não cabem no círculo de 16 px do responsável,
 * e o corte no meio de uma inicial é pior que a inicial que falta. Nome vazio
 * vira "?" em vez de string vazia — um círculo em branco parece defeito de
 * carregamento.
 */
export function iniciais(nome: string | null): string {
  return (nome ?? '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
}
