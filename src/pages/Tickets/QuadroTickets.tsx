/**
 * QuadroTickets — a mesma fila, vista como caminho.
 *
 * ## Por que existe um segundo modo
 *
 * A lista responde "o que eu faço agora?". O quadro responde "onde a fila está
 * entupida?" — e essa segunda pergunta é de quem coordena, não de quem executa.
 *
 * ## As colunas dizem o estado; as abas, de quem é
 *
 * Na 1.0 o quadro recebia a lista recortada pelas abas da LISTA, que também
 * cortam por estado: em «Em aberto» a coluna Concluído vinha sempre vazia, em
 * «Encerrados» as outras três. No 2.0 o quadro tem abas próprias, só de pessoa
 * (`SegmentoQuadro` em `fila.ts`), e a tela entrega a lista já recortada por
 * elas. A última coluna junta as três saídas dos últimos 30 dias.
 *
 * ## Arrastar sem biblioteca
 *
 * O arrasto é o do próprio HTML (`draggable` + `dragover` + `drop`). Não há
 * reordenação dentro da coluna — a ordem é da fila, não do gosto de quem
 * arrasta —, e sem reordenação o que sobra é justamente o caso simples.
 *
 * Soltar chama `onMover`, que é `mudarStatus`. Quem pode mover, o BANCO decide:
 * a RLS recusa a alteração de quem não atende, e a tela traduz a recusa.
 *
 * ## Acessibilidade
 *
 * Arrastar não é o único caminho. O mesmo movimento existe no seletor de estado
 * dentro do ticket aberto, que é operável por teclado.
 */
import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CartaoTicket } from './CartaoTicket';
import {
  COLUNAS_DO_QUADRO, colunaDoEstado, type ColunaQuadro, type StatusTicket,
} from './categorias';
import type { Ticket } from '@/services/tickets.service';

export interface QuadroTicketsProps {
  /** Já filtrada (abas do quadro + janela dos encerrados) e ordenada pela tela. */
  tickets: Ticket[];
  fotos: Map<string, string | null>;
  selecionado: string | null;
  onAbrir: (id: string) => void;
  /** `null` quando quem olha não pode mover — o cartão deixa de ser arrastável. */
  onMover: ((id: string, status: StatusTicket) => void) | null;
  /** «Ver todos os encerrados»: leva à lista, na aba Encerrados. */
  onVerEncerrados: () => void;
  agora: number;
  nomeDaEmpresa?: Map<string, string>;
}

export function QuadroTickets({
  tickets, fotos, selecionado, onAbrir, onMover, onVerEncerrados, agora, nomeDaEmpresa,
}: QuadroTicketsProps) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<ColunaQuadro | null>(null);

  const podeMover = onMover !== null;

  function soltar(coluna: ColunaQuadro, id: string): void {
    setArrastando(null);
    setAlvo(null);
    if (!onMover || !id) return;
    const t = tickets.find(x => x.id === id);
    // Soltar na coluna de onde saiu é um gesto sem consequência — e mandá-lo
    // ao banco geraria um evento de trilha dizendo "aberto → aberto".
    if (!t || colunaDoEstado(t.status) === coluna) return;
    const destino = COLUNAS_DO_QUADRO.find(c => c.chave === coluna);
    if (destino) onMover(id, destino.aoSoltar);
  }

  return (
    // As quatro colunas dividem a largura toda; abaixo de 16rem cada, rola
    // para o lado em vez de espremer o assunto.
    <div className="flex-1 min-h-0 grid grid-flow-col auto-cols-[minmax(16rem,1fr)] gap-3 overflow-x-auto pb-1">
      {COLUNAS_DO_QUADRO.map(coluna => {
        const daColuna = tickets.filter(t => coluna.estados.includes(t.status));
        const ehAlvo = alvo === coluna.chave && arrastando !== null;
        const ehEncerrados = coluna.chave === 'encerrados';

        return (
          <section
            key={coluna.chave}
            aria-label={`${coluna.label}: ${daColuna.length}`}
            onDragOver={e => {
              if (!podeMover) return;
              // Sem o `preventDefault` o navegador recusa o `drop`.
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (alvo !== coluna.chave) setAlvo(coluna.chave);
            }}
            onDragLeave={e => {
              // `dragleave` dispara ao passar por cima dos FILHOS também.
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              if (alvo === coluna.chave) setAlvo(null);
            }}
            onDrop={e => {
              e.preventDefault();
              soltar(coluna.chave, e.dataTransfer.getData('text/plain'));
            }}
            className={cn(
              'tk-coluna relative flex flex-col min-h-0 overflow-hidden rounded-xl border transition-[border-color,background-color,box-shadow] duration-150',
              ehAlvo
                ? 'border-primary/70 bg-primary/[0.06] ring-4 ring-primary/10'
                : 'border-border/70 bg-muted/30',
            )}
          >
            {/* O filete da cor da coluna. */}
            <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-[3px] opacity-80', coluna.ponto)} />

            <header className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
              <span aria-hidden="true" className={cn('w-2 h-2 rounded-full', coluna.ponto)} />
              <h2 className="text-[13px] font-semibold tracking-tight">{coluna.label}</h2>
              <span className={cn(
                'ml-auto min-w-[1.5rem] rounded-full px-1.5 text-center font-mono text-[11px] leading-5 tabular-nums',
                daColuna.length ? 'bg-foreground/10 text-foreground' : 'bg-foreground/5 text-muted-foreground',
              )}>
                {daColuna.length}
              </span>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2.5 space-y-2">
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
                <p className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg px-3 py-4 text-center text-[11px] text-muted-foreground/80',
                  ehAlvo && 'text-primary',
                )}>
                  <Check className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  {ehAlvo ? `Soltar em ${coluna.label}` : coluna.vazio}
                </p>
              )}
            </div>

            {ehEncerrados && (
              <button
                type="button"
                onClick={onVerEncerrados}
                className="group flex items-center justify-center gap-1 border-t border-border/70 px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                Ver todos os encerrados
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default QuadroTickets;
