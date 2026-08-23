/**
 * CartaoTicket — o ticket como ele aparece na fila e no quadro.
 *
 * ## Uma coisa por linha, e a ordem importa
 *
 * A fila é varrida com o olho, não lida. As quatro linhas do cartão respondem,
 * nessa ordem, as quatro perguntas que alguém faz ao varrer:
 *
 *   1. **O que é isso e em que pé está** — número, estado, prioridade;
 *   2. **Do que se trata** — o assunto, na maior fonte do cartão;
 *   3. **De quem veio** — quem abriu e a categoria;
 *   4. **Quem está com isso** — a cara de quem responde, ou o aviso de que
 *      ninguém está.
 *
 * ## A faixa e o ponto
 *
 * A **faixa** à esquerda é prioridade e só aparece em alta e urgente: se
 * "normal" também pintasse, a tela inteira ficaria listrada e a listra deixaria
 * de significar alguma coisa.
 *
 * O **ponto** ao lado da data é temperatura — quanto tempo sem movimento,
 * medido contra o limite da própria prioridade (`fila.ts`). É o sinal que
 * responde "o que está apodrecendo aqui?" sem ninguém precisar abrir nada.
 *
 * ## Por que ele recebe URL de foto e não o mapa
 *
 * `buscarFotosDosPerfis` devolve um `Map` novo a cada leitura. Passá-lo ao
 * cartão faria `React.memo` errar em todos os quarenta cartões a cada evento de
 * tempo real. Recebendo duas strings, a comparação do `memo` é de primitivos e
 * acerta sempre — o cartão só re-renderiza quando o ticket dele muda.
 */
import { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  STATUS_TICKET, PRIORIDADES, FAIXA_PRIORIDADE, rotuloCategoria,
} from './categorias';
import { temperatura, tempoSemMovimento, textoDeIdade, iniciais } from './fila';
import type { Ticket } from '@/services/tickets.service';

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
  /** No quadro o cartão é mais estreito e dispensa o estado (é a coluna). */
  variante?: 'fila' | 'quadro';
  /** Handlers de arrastar. Só o quadro passa. */
  arrastavel?: boolean;
  onArrastarInicio?: (id: string) => void;
  onArrastarFim?: () => void;
}

/** Cor do ponto de temperatura. Verde não existe: "em dia" não pede atenção. */
const COR_TEMPERATURA = {
  em_dia:  'bg-transparent',
  atencao: 'bg-amber-500',
  parado:  'bg-destructive',
} as const;

const TITULO_TEMPERATURA = {
  em_dia:  '',
  atencao: 'Chegando no limite de tempo sem movimento',
  parado:  'Sem movimento além do limite desta prioridade',
} as const;

function CartaoTicketBase({
  ticket: t, fotoAutor, fotoResponsavel, selecionado, onAbrir, agora,
  nomeEmpresa, variante = 'fila',
  arrastavel = false, onArrastarInicio, onArrastarFim,
}: CartaoTicketProps) {
  const temp = temperatura(t, agora);
  const noQuadro = variante === 'quadro';

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
        'group relative w-full text-left rounded-lg border overflow-hidden',
        'transition-colors duration-150 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        selecionado
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card hover:border-primary/40 hover:bg-accent/40',
        arrastavel && 'cursor-grab active:cursor-grabbing',
      )}
    >
      {/* Faixa de prioridade: 3 px, e só quando quer dizer algo. */}
      <span
        aria-hidden="true"
        className={cn('absolute left-0 top-0 bottom-0 w-[3px]', FAIXA_PRIORIDADE[t.prioridade])}
      />

      <div className={cn('flex gap-2.5', noQuadro ? 'p-2.5 pl-3' : 'p-3 pl-3.5')}>
        {!noQuadro && (
          <Avatar className="w-8 h-8 shrink-0 mt-0.5">
            <AvatarImage src={fotoAutor ?? undefined} />
            <AvatarFallback className="text-[10px]">{iniciais(t.abertoPorNome)}</AvatarFallback>
          </Avatar>
        )}

        <div className="flex-1 min-w-0">
          {/* 1 — o que é e em que pé está */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-mono text-muted-foreground">#{t.numero}</span>

            {!noQuadro && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full border leading-none',
                STATUS_TICKET[t.status].cor,
              )}>
                {STATUS_TICKET[t.status].label}
              </span>
            )}

            {t.prioridade !== 'normal' && (
              <span className={cn('text-[10px] font-medium', PRIORIDADES[t.prioridade].cor)}>
                {PRIORIDADES[t.prioridade].label}
              </span>
            )}

            <span className="ml-auto flex items-center gap-1.5 shrink-0">
              {temp !== 'em_dia' && (
                <span
                  title={TITULO_TEMPERATURA[temp]}
                  aria-label={TITULO_TEMPERATURA[temp]}
                  className={cn('w-1.5 h-1.5 rounded-full', COR_TEMPERATURA[temp])}
                />
              )}
              <span
                className="text-[10px] text-muted-foreground tabular-nums"
                title={`Último movimento: ${new Date(t.atualizadoEm || t.criadoEm).toLocaleString('pt-BR')}`}
              >
                {textoDeIdade(tempoSemMovimento(t, agora))}
              </span>
            </span>
          </div>

          {/* 2 — do que se trata */}
          <p className={cn(
            'font-medium leading-snug mt-1 text-foreground',
            noQuadro ? 'text-[13px] line-clamp-2' : 'text-sm truncate',
          )}>
            {t.assunto}
          </p>

          {/* 3 — de quem veio */}
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {t.abertoPorNome ?? 'alguém'} · {rotuloCategoria(t.categoria)}
            {nomeEmpresa ? ` · ${nomeEmpresa}` : ''}
          </p>

          {/* 4 — quem está com isso */}
          <div className="flex items-center gap-1.5 mt-1.5">
            {t.responsavelId ? (
              <>
                <Avatar className="w-4 h-4">
                  <AvatarImage src={fotoResponsavel ?? undefined} />
                  <AvatarFallback className="text-[8px]">
                    {iniciais(t.responsavelNome)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[11px] text-muted-foreground truncate">
                  {t.responsavelNome}
                </span>
              </>
            ) : (
              <span className="text-[11px] text-amber-600 dark:text-amber-500">
                Sem responsável
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/**
 * `memo` sem comparador próprio.
 *
 * Ele basta porque `reconciliarLista` devolve o MESMO objeto `Ticket` quando o
 * conteúdo não mudou, e todas as demais props são primitivos ou funções
 * estáveis. É a peça que faz uma fila de quarenta cartões re-renderizar só o
 * cartão que de fato mudou quando um evento chega.
 */
export const CartaoTicket = memo(CartaoTicketBase);

export default CartaoTicket;
