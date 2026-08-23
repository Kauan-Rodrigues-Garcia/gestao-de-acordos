/**
 * QuadroTickets — a mesma fila, vista como caminho.
 *
 * ## Por que existe um segundo modo
 *
 * A lista responde "o que eu faço agora?". O quadro responde "onde a fila está
 * entupida?" — e essa segunda pergunta é de quem coordena, não de quem executa.
 * São leituras diferentes dos mesmos dados, e é por isso que o quadro não tem
 * filtro próprio: ele recebe a lista JÁ filtrada e ordenada pela tela.
 *
 * ## Arrastar sem biblioteca
 *
 * O arrasto é o do próprio HTML (`draggable` + `dragover` + `drop`). Uma
 * biblioteca de arrastar-e-soltar custaria uns 30 KB no pacote para fazer, aqui,
 * exatamente o que o navegador já faz: pegar um cartão e largar noutra coluna.
 * Não há reordenação dentro da coluna — a ordem é da fila, não do gosto de quem
 * arrasta —, e sem reordenação o que sobra é justamente o caso simples.
 *
 * Soltar chama `onMover`, que é `mudarStatus`. Quem pode mover, o BANCO decide:
 * a RLS recusa a alteração de quem não atende, e a tela traduz a recusa. Esconder
 * o arrasto de quem não atende é conforto, não segurança.
 *
 * ## Acessibilidade
 *
 * Arrastar não é o único caminho — nem seria aceitável que fosse. O mesmo
 * movimento existe no seletor de estado dentro do ticket aberto, que é operável
 * por teclado. O quadro é um atalho, não a única porta.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CartaoTicket } from './CartaoTicket';
import {
  COLUNAS_QUADRO, STATUS_TICKET, VAZIO_DA_COLUNA, type StatusTicket,
} from './categorias';
import type { Ticket } from '@/services/tickets.service';

export interface QuadroTicketsProps {
  /** Já filtrada e ordenada pela tela. */
  tickets: Ticket[];
  fotos: Map<string, string | null>;
  selecionado: string | null;
  onAbrir: (id: string) => void;
  /** `null` quando quem olha não pode mover — o cartão deixa de ser arrastável. */
  onMover: ((id: string, status: StatusTicket) => void) | null;
  agora: number;
  nomeDaEmpresa?: Map<string, string>;
}

export function QuadroTickets({
  tickets, fotos, selecionado, onAbrir, onMover, agora, nomeDaEmpresa,
}: QuadroTicketsProps) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<StatusTicket | null>(null);

  const podeMover = onMover !== null;

  function soltar(status: StatusTicket, id: string): void {
    setArrastando(null);
    setAlvo(null);
    if (!onMover || !id) return;
    const t = tickets.find(x => x.id === id);
    // Soltar na coluna de onde saiu é um gesto sem consequência — e mandá-lo
    // ao banco geraria um evento de trilha dizendo "aberto → aberto".
    if (!t || t.status === status) return;
    onMover(id, status);
  }

  return (
    <div className="flex-1 min-h-0 flex gap-3 overflow-x-auto pb-1">
      {COLUNAS_QUADRO.map(status => {
        const daColuna = tickets.filter(t => t.status === status);
        const ehAlvo = alvo === status && arrastando !== null;

        return (
          <div
            key={status}
            onDragOver={e => {
              if (!podeMover) return;
              // Sem o `preventDefault` o navegador recusa o `drop` — é a linha
              // que todo mundo esquece e faz o arrasto "não funcionar".
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (alvo !== status) setAlvo(status);
            }}
            onDragLeave={e => {
              // `dragleave` dispara ao passar por cima dos FILHOS também. Sem
              // este teste, a coluna pisca a cada cartão que o cursor cruza.
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              if (alvo === status) setAlvo(null);
            }}
            onDrop={e => {
              e.preventDefault();
              soltar(status, e.dataTransfer.getData('text/plain'));
            }}
            className={cn(
              'flex flex-col min-h-0 w-64 md:w-72 shrink-0 rounded-xl border transition-colors',
              ehAlvo
                ? 'border-primary bg-primary/5'
                : 'border-border/70 bg-muted/30',
            )}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/70">
              <span className={cn(
                'text-[11px] px-1.5 py-0.5 rounded-full border leading-none',
                STATUS_TICKET[status].cor,
              )}>
                {STATUS_TICKET[status].label}
              </span>
              <span className="ml-auto text-xs font-mono text-muted-foreground tabular-nums">
                {daColuna.length}
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
              {daColuna.map(t => (
                <CartaoTicket
                  key={t.id}
                  ticket={t}
                  variante="quadro"
                  fotoAutor={fotos.get(t.abertoPor) ?? null}
                  fotoResponsavel={t.responsavelId ? fotos.get(t.responsavelId) ?? null : null}
                  selecionado={t.id === selecionado}
                  onAbrir={onAbrir}
                  agora={agora}
                  nomeEmpresa={nomeDaEmpresa?.get(t.empresaId) ?? null}
                  arrastavel={podeMover}
                  onArrastarInicio={setArrastando}
                  onArrastarFim={() => { setArrastando(null); setAlvo(null); }}
                />
              ))}

              {!daColuna.length && (
                // Coluna vazia sem explicação parece defeito de carregamento.
                <p className="text-[11px] text-muted-foreground/70 text-center px-2 py-6 leading-relaxed">
                  {VAZIO_DA_COLUNA[status]}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default QuadroTickets;
