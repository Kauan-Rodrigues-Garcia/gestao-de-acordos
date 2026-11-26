/**
 * CartaoTicket — o ticket como ele aparece na fila e no quadro.
 *
 * ## Linha, não cartão
 *
 * Na fila o ticket é uma LINHA de uma lista contínua, não um cartão solto: a
 * versão anterior gastava uns 110 px por ticket e cabiam cinco numa tela de
 * notebook. A fila é varrida com o olho, e varrer pede densidade. A geometria
 * (`tickets.css`) muda com a largura da LISTA: larga, é linha de tabela;
 * estreita (com o ticket aberto ao lado), empilha em três linhas. As perguntas
 * de quem varre continuam na mesma ordem:
 *
 *   1. **O que é e em que pé está** — número, estado, prioridade;
 *   2. **Do que se trata** — o assunto, o texto mais forte da linha;
 *   3. **De quem veio** — quem abriu e a categoria;
 *   4. **Quem está com isso** — a pessoa, ou o aviso de que ninguém está.
 *
 * ## A faixa e o pavio
 *
 * A **faixa** à esquerda é prioridade e só aparece em alta e urgente: se
 * "normal" também pintasse, a tela inteira ficaria listrada.
 *
 * O **pavio** é a própria divisória da linha queimando: a parte acesa é quanto
 * do tempo sem movimento que a prioridade tolera já passou (`fracaoDoPavio`).
 * Neutro em dia, âmbar perto do limite, vermelho e cheio quando passou. É o
 * sinal que responde "o que está apodrecendo?" sem ninguém abrir nada — e,
 * morando na divisória, não ocupa espaço nenhum a mais.
 *
 * ## Por que ele recebe URL de foto e não o mapa
 *
 * `buscarFotosDosPerfis` devolve um `Map` novo a cada leitura. Passá-lo ao
 * cartão faria `React.memo` errar em todos os cartões a cada evento de tempo
 * real. Recebendo strings, a comparação do `memo` é de primitivos.
 *
 * ## 2.0 (26/11/2026)
 *
 * O quadro deixou de reaproveitar a grade da linha: é um cartão de verdade,
 * com número, selo de prioridade e idade em cima, o assunto em até duas linhas
 * e, embaixo, de quem veio (ícone da categoria + foto de quem abriu) contra
 * quem está com ele. Na última coluna (encerrados) o cartão leva o selo do
 * desfecho, porque ali convivem concluído, recusado e cancelado. A linha da
 * lista ganhou o ícone da categoria e a foto de quem abriu na linha de origem.
 */
import { memo, type CSSProperties } from 'react';
import { Users, Check, X, Ban } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  STATUS_TICKET, PRIORIDADES, FAIXA_PRIORIDADE, rotuloCategoria, type StatusTicket,
} from './categorias';
import {
  temperatura, tempoSemMovimento, textoDeIdade, textoDoLimite, iniciais, fracaoDoPavio,
  estaFechado, type Temperatura,
} from './fila';
import { iconeDaCategoria } from './icones';
import type { Ticket } from '@/services/tickets.service';
import './tickets.css';

export interface CartaoTicketProps {
  ticket: Ticket;
  /** Foto de quem abriu. String — nunca o `Map`, ver o cabeçalho. */
  fotoAutor: string | null;
  fotoResponsavel: string | null;
  selecionado: boolean;
  onAbrir: (id: string) => void;
  /** Carimbo do relógio lento. Estável entre minutos, para o `memo` funcionar. */
  agora: number;
  /** Nome da empresa, só para quem enxerga as duas filas ao mesmo tempo. */
  nomeEmpresa?: string | null;
  /** No quadro o cartão dispensa o estado (é a coluna). */
  variante?: 'fila' | 'quadro';
  /** Handlers de arrastar. Só o quadro passa. */
  arrastavel?: boolean;
  onArrastarInicio?: (id: string) => void;
  onArrastarFim?: () => void;
}

/** Cor da parte acesa do pavio. «Em dia» é neutro: não pede atenção. */
const COR_PAVIO: Record<Temperatura, string> = {
  em_dia:  'bg-foreground/20',
  atencao: 'bg-amber-500',
  parado:  'bg-destructive',
};

/** O selo de prioridade do quadro: só alta e urgente falam. */
const SELO_PRIORIDADE: Partial<Record<Ticket['prioridade'], string>> = {
  urgente: 'bg-destructive/12 text-destructive ring-destructive/25',
  alta:    'bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-300',
};

/** O selo do desfecho, na coluna dos encerrados. */
const DESFECHO: Partial<Record<StatusTicket, { Icone: typeof Check; classe: string }>> = {
  concluido: { Icone: Check, classe: 'text-emerald-700 bg-emerald-500/12 ring-emerald-500/25 dark:text-emerald-300' },
  recusado:  { Icone: X,     classe: 'text-rose-700 bg-rose-500/12 ring-rose-500/25 dark:text-rose-300' },
  cancelado: { Icone: Ban,   classe: 'text-muted-foreground bg-muted ring-border' },
};

function frasePavio(t: Ticket, temp: Temperatura, agora: number): string {
  if (temp === 'parado') return 'Sem movimento além do limite desta prioridade';
  if (temp === 'atencao') return `Chegando no limite: ${textoDeIdade(tempoSemMovimento(t, agora))} sem movimento, de ${textoDoLimite(t.prioridade)}`;
  return `${textoDeIdade(tempoSemMovimento(t, agora))} sem movimento — esta prioridade tolera ${textoDoLimite(t.prioridade)}`;
}

function Pessoa({ foto, nome, tamanho = 'w-5 h-5' }: { foto: string | null; nome: string | null; tamanho?: string }) {
  return (
    <Avatar className={cn(tamanho, 'shrink-0 ring-1 ring-border')}>
      <AvatarImage src={foto ?? undefined} />
      <AvatarFallback className="text-[8px]">{iniciais(nome)}</AvatarFallback>
    </Avatar>
  );
}

function CartaoTicketBase({
  ticket: t, fotoAutor, fotoResponsavel, selecionado, onAbrir, agora,
  nomeEmpresa, variante = 'fila',
  arrastavel = false, onArrastarInicio, onArrastarFim,
}: CartaoTicketProps) {
  const temp = temperatura(t, agora);
  const pavio = fracaoDoPavio(t, agora);
  const noQuadro = variante === 'quadro';
  const status = STATUS_TICKET[t.status];
  const IconeCategoria = iconeDaCategoria(t.categoria);
  const idade = textoDeIdade(tempoSemMovimento(t, agora));
  const corIdade = temp === 'parado' ? 'text-destructive'
    : temp === 'atencao' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
  const tituloIdade = `Último movimento: ${new Date(t.atualizadoEm || t.criadoEm).toLocaleString('pt-BR')}`;

  const participantes = !!t.participantes?.length && (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"
      title={`Participam: ${t.participantes.map(p => p.nome).join(', ')}`}>
      <Users className="w-3 h-3" />{t.participantes.length}
    </span>
  );

  const pavioEl = (
    <span aria-hidden={pavio === 0 ? true : undefined} className={cn('tk-pavio', noQuadro ? 'bg-muted' : 'bg-border')}>
      {pavio > 0 && (
        <i
          title={frasePavio(t, temp, agora)}
          className={COR_PAVIO[temp]}
          style={{ '--pavio': pavio.toFixed(3) } as CSSProperties}
        />
      )}
    </span>
  );

  return (
    <button
      type="button"
      onClick={() => onAbrir(t.id)}
      draggable={arrastavel}
      onDragStart={e => {
        // `setData` é obrigatório no Firefox: sem ele o arrasto nem começa.
        e.dataTransfer.setData('text/plain', t.id);
        e.dataTransfer.effectAllowed = 'move';
        onArrastarInicio?.(t.id);
      }}
      onDragEnd={() => onArrastarFim?.()}
      aria-current={selecionado ? 'true' : undefined}
      className={cn(
        'group relative block w-full text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        noQuadro
          ? cn(
            'tk-quadro rounded-lg border bg-card pb-3 shadow-sm',
            'transition-[transform,box-shadow,border-color] duration-150',
            'hover:-translate-y-px hover:shadow-md hover:border-primary/40',
            selecionado ? 'border-primary' : 'border-border/80',
            estaFechado(t) && 'opacity-80 hover:opacity-100',
          )
          : cn('pb-0.5 transition-colors duration-150', selecionado ? 'bg-primary/[0.07]' : 'hover:bg-accent/50'),
        arrastavel && 'cursor-grab active:cursor-grabbing',
      )}
    >
      {/* Faixa de prioridade: 3 px, e só quando quer dizer algo. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-0 bottom-0 w-[3px]',
          noQuadro && 'rounded-l-lg',
          FAIXA_PRIORIDADE[t.prioridade],
        )}
      />

      {noQuadro ? (
        <div className="flex flex-col gap-1.5 px-3 pt-2.5">
          {/* 1 — número, prioridade (ou desfecho) e idade */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">#{t.numero}</span>
            {SELO_PRIORIDADE[t.prioridade] && !estaFechado(t) && (
              <span className={cn('rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset', SELO_PRIORIDADE[t.prioridade])}>
                {PRIORIDADES[t.prioridade].label}
              </span>
            )}
            {DESFECHO[t.status] && (() => {
              const { Icone, classe } = DESFECHO[t.status]!;
              return (
                <span className={cn('inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[10px] font-medium ring-1 ring-inset', classe)}>
                  <Icone className="w-3 h-3" />{status.label}
                </span>
              );
            })()}
            <span className={cn('ml-auto text-[11px] tabular-nums whitespace-nowrap', corIdade)} title={tituloIdade}>
              {idade}
            </span>
          </div>

          {/* 2 — do que se trata */}
          <span className="text-[13px] font-medium leading-snug text-foreground line-clamp-2">{t.assunto}</span>

          {/* 3 — de quem veio, contra quem está com ele */}
          <div className="flex items-center gap-2 pt-0.5 min-w-0">
            <span className="flex items-center gap-1.5 min-w-0 flex-1 text-[11px] text-muted-foreground"
              title={`${t.abertoPorNome ?? 'alguém'} · ${rotuloCategoria(t.categoria)}${nomeEmpresa ? ` · ${nomeEmpresa}` : ''}`}>
              <IconeCategoria className="w-3.5 h-3.5 shrink-0 opacity-70" aria-label={rotuloCategoria(t.categoria)} />
              <Pessoa foto={fotoAutor} nome={t.abertoPorNome} tamanho="w-4 h-4" />
              <span className="truncate">
                {t.abertoPorNome ?? 'alguém'}{nomeEmpresa ? ` · ${nomeEmpresa}` : ''}
              </span>
            </span>
            {participantes}
            {t.responsavelId ? (
              <span className="flex items-center gap-1 shrink-0 max-w-[45%]" title={`Com ${t.responsavelNome ?? 'alguém'}`}>
                <Pessoa foto={fotoResponsavel} nome={t.responsavelNome} />
                <span className="text-[11px] text-foreground/80 truncate">{t.responsavelNome}</span>
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-amber-500/12 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:text-amber-300">
                Sem responsável
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="tk-linha-grade px-4 py-2.5 md:pl-5">
          {/* 1 — o que é e em que pé está */}
          <span className="tk-num font-mono text-[11px] text-muted-foreground tabular-nums">#{t.numero}</span>

          <span className="tk-estado inline-flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
            <span aria-hidden="true" className={cn('w-1.5 h-1.5 rounded-full shrink-0', status.ponto)} />
            {status.label}
          </span>

          <span className="tk-prio min-w-0 text-[11px] leading-none">
            {t.prioridade !== 'normal' && (
              <span className={cn('font-medium', PRIORIDADES[t.prioridade].cor)}>
                {PRIORIDADES[t.prioridade].label}
              </span>
            )}
          </span>

          <span className={cn('tk-idade text-[11px] tabular-nums whitespace-nowrap', corIdade)} title={tituloIdade}>
            {idade}
          </span>

          {/* 2 — do que se trata */}
          <span className="tk-assunto text-sm font-medium leading-snug text-foreground truncate">{t.assunto}</span>

          {/* 3 — de quem veio */}
          <span className="tk-origem flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground">
            <IconeCategoria className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
            <Pessoa foto={fotoAutor} nome={t.abertoPorNome} tamanho="w-4 h-4" />
            <span className="truncate">
              {t.abertoPorNome ?? 'alguém'} · {rotuloCategoria(t.categoria)}
              {nomeEmpresa ? ` · ${nomeEmpresa}` : ''}
            </span>
          </span>

          {/* 4 — quem está com isso */}
          <span className="tk-dono flex items-center gap-1.5 min-w-0">
            {t.responsavelId ? (
              <>
                <Pessoa foto={fotoResponsavel} nome={t.responsavelNome} />
                <span className="text-xs text-foreground/80 truncate">{t.responsavelNome}</span>
              </>
            ) : (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
                Sem responsável
              </span>
            )}
            {participantes}
          </span>
        </div>
      )}

      {/* O pavio, na própria divisória. Encerrado mostra só a divisória. */}
      {pavioEl}
    </button>
  );
}

export const CartaoTicket = memo(CartaoTicketBase);

export default CartaoTicket;
