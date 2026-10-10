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
 */
import { memo, type CSSProperties } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  STATUS_TICKET, PRIORIDADES, FAIXA_PRIORIDADE, rotuloCategoria,
} from './categorias';
import {
  temperatura, tempoSemMovimento, textoDeIdade, textoDoLimite, iniciais, fracaoDoPavio,
  type Temperatura,
} from './fila';
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

function frasePavio(t: Ticket, temp: Temperatura, agora: number): string {
  if (temp === 'parado') return 'Sem movimento além do limite desta prioridade';
  if (temp === 'atencao') return `Chegando no limite: ${textoDeIdade(tempoSemMovimento(t, agora))} sem movimento, de ${textoDoLimite(t.prioridade)}`;
  return `${textoDeIdade(tempoSemMovimento(t, agora))} sem movimento — esta prioridade tolera ${textoDoLimite(t.prioridade)}`;
}

function CartaoTicketBase({
  ticket: t, fotoResponsavel, selecionado, onAbrir, agora,
  nomeEmpresa, variante = 'fila',
  arrastavel = false, onArrastarInicio, onArrastarFim,
}: CartaoTicketProps) {
  const temp = temperatura(t, agora);
  const pavio = fracaoDoPavio(t, agora);
  const noQuadro = variante === 'quadro';
  const status = STATUS_TICKET[t.status];

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
        'group relative block w-full text-left transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        noQuadro
          ? 'tk-quadro rounded-lg border bg-card pb-3 shadow-xs hover:border-primary/40'
          : 'pb-0.5',
        noQuadro && (selecionado ? 'border-primary' : 'border-border'),
        !noQuadro && (selecionado ? 'bg-primary/[0.07]' : 'hover:bg-accent/50'),
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

      <div className={cn('tk-linha-grade', noQuadro ? 'px-3 pt-2.5' : 'px-4 py-2.5 md:pl-5')}>
        {/* 1 — o que é e em que pé está */}
        <span className="tk-num font-mono text-[11px] text-muted-foreground tabular-nums">#{t.numero}</span>

        {!noQuadro && (
          <span className="tk-estado inline-flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
            <span aria-hidden="true" className={cn('w-1.5 h-1.5 rounded-full shrink-0', status.ponto)} />
            {status.label}
          </span>
        )}

        <span className="tk-prio min-w-0 text-[11px] leading-none">
          {t.prioridade !== 'normal' && (
            <span className={cn('font-medium', PRIORIDADES[t.prioridade].cor)}>
              {PRIORIDADES[t.prioridade].label}
            </span>
          )}
        </span>

        <span
          className={cn(
            'tk-idade text-[11px] tabular-nums whitespace-nowrap',
            temp === 'parado' ? 'text-destructive' : temp === 'atencao' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
          )}
          title={`Último movimento: ${new Date(t.atualizadoEm || t.criadoEm).toLocaleString('pt-BR')}`}
        >
          {textoDeIdade(tempoSemMovimento(t, agora))}
        </span>

        {/* 2 — do que se trata */}
        <span className={cn(
          'tk-assunto font-medium leading-snug text-foreground',
          noQuadro ? 'text-[13px] line-clamp-2' : 'text-sm truncate',
        )}>
          {t.assunto}
        </span>

        {/* 3 — de quem veio */}
        <span className="tk-origem text-[11px] text-muted-foreground truncate">
          {t.abertoPorNome ?? 'alguém'} · {rotuloCategoria(t.categoria)}
          {nomeEmpresa ? ` · ${nomeEmpresa}` : ''}
        </span>

        {/* 4 — quem está com isso */}
        <span className={cn('tk-dono flex items-center gap-1.5 min-w-0', noQuadro && 'pt-1')}>
          {t.responsavelId ? (
            <>
              <Avatar className="w-5 h-5 shrink-0">
                <AvatarImage src={fotoResponsavel ?? undefined} />
                <AvatarFallback className="text-[8px]">{iniciais(t.responsavelNome)}</AvatarFallback>
              </Avatar>
              <span className="text-xs text-foreground/80 truncate">{t.responsavelNome}</span>
            </>
          ) : (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
              Sem responsável
            </span>
          )}
        </span>
      </div>

      {/* O pavio, na própria divisória. Encerrado mostra só a divisória. */}
      <span aria-hidden={pavio === 0 ? true : undefined} className={cn('tk-pavio', noQuadro ? 'bg-muted' : 'bg-border')}>
        {pavio > 0 && (
          <i
            title={frasePavio(t, temp, agora)}
            className={COR_PAVIO[temp]}
            style={{ '--pavio': pavio.toFixed(3) } as CSSProperties}
          />
        )}
      </span>
    </button>
  );
}

/**
 * `memo` sem comparador próprio.
 *
 * Ele basta porque `reconciliarLista` devolve o MESMO objeto `Ticket` quando o
 * conteúdo não mudou, e todas as demais props são primitivos ou funções
 * estáveis. É a peça que faz a fila re-renderizar só a linha que mudou quando
 * um evento chega.
 */
export const CartaoTicket = memo(CartaoTicketBase);

export default CartaoTicket;
