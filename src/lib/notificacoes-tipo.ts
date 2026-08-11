/**
 * src/lib/notificacoes-tipo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * O que uma notificação É: categoria, urgência, ícone e cor.
 *
 * ── Por que DERIVAR em vez de gravar uma coluna `tipo` ──────────────────────
 * A tabela `notificacoes` não tem coluna de tipo. Criar uma exigiria migration,
 * backfill e mexer nos ~24 lugares que produzem notificação — cinco triggers em
 * SQL e o resto espalhado em services e componentes.
 *
 * E o backfill teria de adivinhar o tipo das linhas antigas a partir do título,
 * que é exatamente o que este arquivo faz. Ou seja: a coluna daria o mesmo
 * resultado com muito mais peça móvel, e ainda deixaria dois lugares para a
 * mesma verdade divergirem quando alguém criasse um produtor novo e esquecesse
 * de preencher o campo.
 *
 * Derivar tem UMA fraqueza, e ela está declarada aqui: título novo que não casa
 * com nenhuma regra cai em `sistema`. É degradação suave — a notificação
 * aparece, navega e funciona; só não ganha cor própria. O teste deste arquivo
 * cobre todos os títulos que o projeto produz hoje, então a regressão aparece
 * na suíte, não em produção.
 *
 * ── A ordem das regras importa ──────────────────────────────────────────────
 * As regras são testadas de cima para baixo e a primeira que casa vence. As
 * mais específicas vêm antes: "Pix automático — registro excluído" tem de bater
 * em `pix`, não em `acordo` por causa da palavra "excluído".
 */
import type { Notificacao } from '@/lib/supabase';

// ── Categorias ───────────────────────────────────────────────────────────────

/**
 * De onde a notificação veio. Vira o chip de filtro do painel e a cor do
 * ícone — quem já usa o sistema reconhece o assunto antes de ler o título.
 */
export type CategoriaNotificacao =
  | 'chat'        // conversa dentro de uma solicitação (PaguePlay)
  | 'atendimento' // ciclo de vida da solicitação de WhatsApp (PaguePlay)
  | 'pix'         // aba do Pix automático (BookPlay)
  | 'vinculo'     // direto/extra, NR, transferência de titularidade
  | 'acordo'      // o acordo em si: status, atraso, transferência
  | 'importacao'  // planilha, analítico, recebimento diário
  | 'sistema';    // o que não se encaixa — ver o cabeçalho

/**
 * Quanto isso corre.
 *
 *   critica — alguém mexeu no que era seu, ou algo vai vencer. Exige olhar.
 *   atencao — chegou trabalho ou resposta para você.
 *   info    — aconteceu, não pede nada.
 *
 * Manda em três coisas: a cor, quanto tempo o card fica na tela e o volume do
 * som. É por isso que ela é decidida aqui e não em cada componente.
 */
export type UrgenciaNotificacao = 'critica' | 'atencao' | 'info';

export interface TipoNotificacao {
  categoria: CategoriaNotificacao;
  urgencia:  UrgenciaNotificacao;
}

/** Nome da categoria na tela (chips de filtro, cabeçalho de grupo). */
export const CATEGORIA_LABEL: Record<CategoriaNotificacao, string> = {
  chat:        'Conversas',
  atendimento: 'Atendimentos',
  pix:         'Pix automático',
  vinculo:     'Vínculos',
  acordo:      'Acordos',
  importacao:  'Importações',
  sistema:     'Sistema',
};

/**
 * Nome do ícone lucide de cada categoria.
 *
 * Só o NOME, não o componente: este módulo é lógica pura e tem teste que roda
 * sem DOM. Quem desenha resolve o nome no mapa de ícones. Sem isso o teste
 * teria de montar React para perguntar de que cor é uma notificação.
 */
export const CATEGORIA_ICONE: Record<CategoriaNotificacao, string> = {
  chat:        'MessageSquare',
  atendimento: 'Headset',
  pix:         'Zap',
  vinculo:     'Link2',
  acordo:      'FileText',
  importacao:  'Upload',
  sistema:     'Info',
};

/**
 * Classes do tile do ícone, por categoria.
 *
 * Cor por ASSUNTO, não por urgência: a urgência já tem a barra lateral e o
 * ponto de não lida. Se as duas coisas usassem cor, a tela viraria semáforo e
 * nenhuma das duas seria lida.
 */
export const CATEGORIA_COR: Record<CategoriaNotificacao, string> = {
  chat:        'bg-sky-500/12 text-sky-500 ring-sky-500/25',
  atendimento: 'bg-violet-500/12 text-violet-500 ring-violet-500/25',
  pix:         'bg-amber-500/12 text-amber-500 ring-amber-500/25',
  vinculo:     'bg-fuchsia-500/12 text-fuchsia-500 ring-fuchsia-500/25',
  acordo:      'bg-emerald-500/12 text-emerald-500 ring-emerald-500/25',
  importacao:  'bg-teal-500/12 text-teal-500 ring-teal-500/25',
  sistema:     'bg-muted text-muted-foreground ring-border',
};

/** Barra lateral do card. Só a urgência crítica ganha destaque de verdade. */
export const URGENCIA_BARRA: Record<UrgenciaNotificacao, string> = {
  critica: 'bg-destructive',
  atencao: 'bg-amber-500',
  info:    'bg-primary/50',
};

/**
 * Quanto tempo o card temporário fica na tela, por urgência.
 *
 * Os 2 s antigos valiam para todas e não davam para ler duas linhas de texto —
 * a pessoa via o card sair e ia ao sino descobrir o que era, que é o oposto do
 * que um card temporário serve. Os números seguem a régua usada por sistemas
 * profissionais (4 a 8 s), com o crítico ficando mais.
 */
export const DURACAO_POR_URGENCIA: Record<UrgenciaNotificacao, number> = {
  critica: 9_000,
  atencao: 6_500,
  info:    4_500,
};

// ── Classificação ────────────────────────────────────────────────────────────

/** Só o que a classificação lê. */
type Alvo = Pick<Notificacao, 'titulo' | 'rota'> & { acordo_id?: string | null };

/**
 * Marcas de acento que o NFD separa da letra base.
 *
 * `\p{Diacritic}` em vez do intervalo U+0300–U+036F escrito à mão: o intervalo
 * exige caracteres combinantes literais no fonte, que qualquer conversão de
 * codificação do arquivo estraga em silêncio — e o estrago só apareceria como
 * "a busca parou de achar palavra com acento".
 */
const ACENTOS = /\p{Diacritic}/gu;

/**
 * Sem acento e em minúsculas.
 *
 * Os títulos são texto fixo do código, mas passaram por mãos diferentes ao
 * longo de um ano: "analítico" e "analitico" convivem, e uma regra que casasse
 * só a forma acentuada perderia metade das linhas antigas.
 */
function normalizar(v: string): string {
  return v.normalize('NFD').replace(ACENTOS, '').toLowerCase();
}

interface Regra {
  /** Casa pelo título já normalizado. */
  casa: (titulo: string, rota: string) => boolean;
  tipo: TipoNotificacao;
}

/**
 * As regras, na ordem em que são testadas.
 *
 * Cada linha diz qual produtor ela cobre. Produtor novo sem regra cai em
 * `sistema` — e o teste deste arquivo varre a lista de títulos do projeto, então
 * o esquecimento aparece na suíte.
 */
const REGRAS: readonly Regra[] = [
  // ── Conversa (PaguePlay) — trigger fn_wpp_notificar_mensagem, 20260731a ──
  {
    casa: t => t.startsWith('nova mensagem'),
    tipo: { categoria: 'chat', urgencia: 'atencao' },
  },

  // ── Atendimento (PaguePlay) ─────────────────────────────────────────────
  // Excluíram um pedido que estava com você (20260731c): some da sua mesa sem
  // aviso prévio, por isso é crítica.
  {
    casa: t => t.includes('solicitacao excluida'),
    tipo: { categoria: 'atendimento', urgencia: 'critica' },
  },
  // Passou de 5 dias sem concluir (20260811b).
  {
    casa: t => t.includes('nao concluido'),
    tipo: { categoria: 'atendimento', urgencia: 'critica' },
  },

  // ── Pix automático (BookPlay) ───────────────────────────────────────────
  // ANTES das regras de acordo/exclusão: "Pix automático — registro excluído"
  // casaria em 'excluído' e cairia na categoria errada.
  {
    casa: (t, r) => t.includes('pix') || r.includes('tab=pix'),
    tipo: { categoria: 'pix', urgencia: 'critica' },
  },

  // ── Vínculo direto/extra e titularidade do NR (BookPlay) ────────────────
  // Todas críticas: é o acordo de alguém trocando de dono ou de natureza, e é
  // disso que sai discussão de comissão.
  {
    casa: t =>
      t.includes('extra') || t.includes('direto') || t.includes('vinculo')
      || t.includes('reatribuido') || t.includes('transferid')
      || t.includes('transferencia'),
    tipo: { categoria: 'vinculo', urgencia: 'critica' },
  },

  // ── Importações e relatórios ────────────────────────────────────────────
  // O diário vem ANTES do analítico: ele mora dentro do analítico e o título
  // não contém a palavra.
  {
    casa: (t, r) => t.includes('diario') || r.includes('aba=diario'),
    tipo: { categoria: 'importacao', urgencia: 'info' },
  },
  {
    casa: (t, r) => t.includes('analitico') || r.startsWith('/analitico'),
    tipo: { categoria: 'importacao', urgencia: 'info' },
  },
  {
    casa: t => t.includes('importacao'),
    tipo: { categoria: 'importacao', urgencia: 'info' },
  },

  // ── Acordo ──────────────────────────────────────────────────────────────
  // Virou "Não pago" sozinho por vencimento (useMarcarAtrasados): mexe na
  // comissão do mês, precisa de olho, mas ninguém tirou nada de ninguém.
  {
    casa: t => t.includes('nao pago') || t.includes('atrasad') || t.includes('vencid'),
    tipo: { categoria: 'acordo', urgencia: 'atencao' },
  },
  {
    casa: t => t.includes('exclu') || t.includes('lixeira'),
    tipo: { categoria: 'acordo', urgencia: 'critica' },
  },
  {
    casa: t => t.includes('acordo'),
    tipo: { categoria: 'acordo', urgencia: 'atencao' },
  },
];

const PADRAO: TipoNotificacao = { categoria: 'sistema', urgencia: 'info' };

/**
 * Categoria e urgência de uma notificação.
 *
 * `acordo_id` preenchido puxa para `acordo` quando nenhuma regra casou: a
 * notificação aponta para um acordo específico, então de acordo ela é — mesmo
 * que o título não diga.
 */
export function tipoDaNotificacao(n: Alvo): TipoNotificacao {
  const titulo = normalizar(n.titulo ?? '');
  const rota   = (n.rota ?? '').toLowerCase();

  for (const regra of REGRAS) {
    if (regra.casa(titulo, rota)) return regra.tipo;
  }
  if (n.acordo_id) return { categoria: 'acordo', urgencia: 'atencao' };
  return PADRAO;
}

/**
 * As categorias presentes numa lista, na ordem fixa de `CATEGORIA_LABEL`.
 *
 * É daqui que saem os chips de filtro do painel — e é assim que a diferença
 * entre BookPlay e PaguePlay se resolve sozinha: quem está na PaguePlay nunca
 * recebe notificação de Pix automático, então o chip "Pix automático" não
 * aparece para ele. Uma tabela fixa por tenant diria a mesma coisa, mas
 * envelheceria toda vez que um produtor novo nascesse.
 */
export function categoriasPresentes(
  lista: readonly Alvo[],
): CategoriaNotificacao[] {
  const achadas = new Set<CategoriaNotificacao>();
  for (const n of lista) achadas.add(tipoDaNotificacao(n).categoria);
  return (Object.keys(CATEGORIA_LABEL) as CategoriaNotificacao[])
    .filter(c => achadas.has(c));
}

// ── Como a notificação é escrita na tela ─────────────────────────────────────

export interface ApresentacaoNotificacao {
  /** Linha de cima, em destaque. */
  titulo: string;
  /** O texto principal — o que a pessoa precisa ler. */
  corpo: string;
  /** Linha pequena embaixo, ou `null` quando não há o que contextualizar. */
  contexto: string | null;
  /**
   * Mostrar a foto do autor no lugar do ícone da categoria.
   *
   * Só vale quando existe autor E o assunto é conversa: numa notificação de
   * exclusão a cara de quem apagou importa menos que o ícone que diz "isto é
   * do Pix automático".
   */
  usarFotoDoAutor: boolean;
}

/** Só o que a apresentação lê. */
type AlvoApresentacao = Alvo & Pick<Notificacao, 'mensagem'> & {
  autor_nome?: string | null;
};

/**
 * Tira o "Fulano: " que as mensagens de chat carregavam no texto.
 *
 * Até a migration 20260811d o autor era gravado colado no conteúdo
 * ("João: bom dia") porque não havia coluna para ele. As linhas daquela época
 * continuam assim; a tela desmancha o prefixo quando reconhece o nome, para o
 * card não repetir "João" duas vezes.
 *
 * Compara pelo PRIMEIRO nome porque era assim que o trigger antigo gravava.
 */
function semPrefixoDoAutor(mensagem: string, autor: string | null | undefined): string {
  const nome = (autor ?? '').trim().split(/\s+/)[0];
  if (!nome) return mensagem;
  const prefixo = `${nome}: `;
  return mensagem.startsWith(prefixo) ? mensagem.slice(prefixo.length) : mensagem;
}

/**
 * O que vai em cada linha do card.
 *
 * A regra especial é o CHAT: ali o que importa é a frase que a pessoa escreveu,
 * não o cabeçalho do atendimento. Até 11/08/2026 o card mostrava
 * "Nova mensagem — MARIA SILVA" em negrito e a mensagem em cinza pequeno
 * embaixo — exatamente ao contrário do que se quer ler. Agora sai como em
 * qualquer mensageiro: quem falou em cima, a frase em destaque, e o atendimento
 * como contexto discreto.
 *
 * O resto das categorias segue com título e corpo do jeito que o produtor
 * escreveu — ali o título É a informação.
 */
export function apresentacaoDaNotificacao(n: AlvoApresentacao): ApresentacaoNotificacao {
  const { categoria } = tipoDaNotificacao(n);
  const titulo   = n.titulo ?? '';
  const mensagem = n.mensagem ?? '';

  if (categoria === 'chat' && n.autor_nome) {
    // "Nova mensagem — MARIA SILVA" → "MARIA SILVA". O travessão é o separador
    // que o trigger usa; sem ele, o título inteiro vira o contexto, que ainda
    // faz sentido.
    const cliente = titulo.split(' — ').slice(1).join(' — ').trim();
    return {
      titulo:   n.autor_nome,
      corpo:    semPrefixoDoAutor(mensagem, n.autor_nome),
      contexto: cliente || null,
      usarFotoDoAutor: true,
    };
  }

  return { titulo, corpo: mensagem, contexto: null, usarFotoDoAutor: false };
}

// ── Agrupamento por data ─────────────────────────────────────────────────────

export type GrupoData = 'hoje' | 'ontem' | 'semana' | 'anteriores';

export const GRUPO_LABEL: Record<GrupoData, string> = {
  hoje:       'Hoje',
  ontem:      'Ontem',
  semana:     'Últimos 7 dias',
  anteriores: 'Mais antigas',
};

/**
 * Em que bloco do painel a notificação cai.
 *
 * Compara DIAS DE CALENDÁRIO, não diferença em horas: às 00:30 o que chegou às
 * 23:50 é "ontem", e não "há 40 minutos, portanto hoje". É como qualquer caixa
 * de entrada se comporta, e é o que a pessoa espera ao procurar "o de ontem".
 */
export function grupoDaData(iso: string, agora: number): GrupoData {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return 'anteriores';

  const hoje = new Date(agora);
  const diaDe = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((diaDe(hoje) - diaDe(data)) / 86_400_000);

  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias <= 7) return 'semana';
  return 'anteriores';
}

/** "agora", "12min", "3h", "2d", "14/07". */
export function tempoRelativo(iso: string, agora: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';

  const diff = agora - t;
  if (diff < 60_000)    return 'agora';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;

  // Passada uma semana, "8d" não diz nada a ninguém — a data diz.
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
