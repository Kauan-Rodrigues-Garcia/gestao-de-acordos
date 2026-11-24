/**
 * PainelDetalhes — quem está no ticket e as informações dele, num lugar só.
 *
 * ## Por que um painel
 *
 * É o desenho dos help desks que a gente usa como referência (Zendesk,
 * Freshdesk, Jira Service Management): a conversa no meio e, ao lado, a ficha
 * do chamado — solicitante, responsável, quem mais acompanha, estado e datas.
 * Quem lê a conversa não precisa rolar até o topo para lembrar com quem está
 * o ticket.
 *
 * Em tela larga ele fica fixo à direita; em tela menor vira a aba «Detalhes»
 * do ticket. O conteúdo é o mesmo.
 *
 * ## Pessoas em três papéis
 *
 *   • **Quem pediu** — abriu o ticket; pode cancelar e chamar pessoas.
 *   • **Responsável** — uma pessoa só, entre quem atende; resolve o ticket.
 *     Muda por «Assumir», «Transferir» ou «Devolver à fila».
 *   • **Participantes** — várias; veem, conversam e recebem aviso.
 */
import {
  ArrowRightLeft, LogOut, UserCheck, UserMinus, UserPlus, X, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/services/tickets.service';
import { STATUS_TICKET, PRIORIDADES, rotuloCategoria } from './categorias';
import { iconeDaCategoria } from './icones';
import { tempoSemMovimento, textoDeIdade } from './fila';
import { AvatarPessoa } from './pessoas';

export interface PainelDetalhesProps {
  ticket: Ticket;
  fotos: Map<string, string | null>;
  meuId: string | null;
  podeAtender: boolean;
  fechado: boolean;
  ocupado: boolean;
  /** Pode chamar pessoas: quem atende, quem abriu ou quem já participa. */
  podeChamar: boolean;
  /** Pode tirar OUTRA pessoa: quem atende ou quem abriu. Sair sozinho, todo participante pode. */
  podeTirar: boolean;
  agora: number;
  onAssumir: () => void;
  onDevolver: () => void;
  onTransferir: () => void;
  onChamar: () => void;
  onTirar: (perfilId: string, nome: string) => void;
}

export function PainelDetalhes({
  ticket, fotos, meuId, podeAtender, fechado, ocupado, podeChamar, podeTirar, agora,
  onAssumir, onDevolver, onTransferir, onChamar, onTirar,
}: PainelDetalhesProps) {
  const participantes = ticket.participantes ?? [];
  const souResponsavel = !!meuId && ticket.responsavelId === meuId;
  const IconeCategoria = iconeDaCategoria(ticket.categoria);
  const campos = Object.entries(ticket.campos);

  return (
    <div className="space-y-5 p-4 md:p-5">
      {/* ── Quem pediu ─────────────────────────────────────────────────── */}
      <Secao titulo="Quem pediu">
        <LinhaPessoa nome={ticket.abertoPorNome ?? 'Alguém'} foto={fotos.get(ticket.abertoPor) ?? null}
          sub={`abriu ${quandoCurto(ticket.criadoEm)}`} voce={ticket.abertoPor === meuId} />
      </Secao>

      {/* ── Responsável ─────────────────────────────────────────────────── */}
      <Secao titulo="Responsável">
        {ticket.responsavelId ? (
          <LinhaPessoa nome={ticket.responsavelNome ?? 'Alguém'} foto={fotos.get(ticket.responsavelId) ?? null}
            sub="está resolvendo" voce={souResponsavel} />
        ) : (
          <p className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            Ninguém pegou este ticket ainda.
          </p>
        )}

        {podeAtender && !fechado && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!souResponsavel && (
              <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={ocupado} onClick={onAssumir}>
                <UserCheck className="w-3.5 h-3.5" /> {ticket.responsavelId ? 'Assumir para mim' : 'Assumir'}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={ocupado} onClick={onTransferir}>
              <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir
            </Button>
            {ticket.responsavelId && (
              <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-muted-foreground" disabled={ocupado} onClick={onDevolver}>
                <UserMinus className="w-3.5 h-3.5" /> Devolver à fila
              </Button>
            )}
          </div>
        )}
      </Secao>

      {/* ── Participantes ───────────────────────────────────────────────── */}
      <Secao titulo={`Participantes${participantes.length ? ` (${participantes.length})` : ''}`}>
        {participantes.length ? (
          <ul className="space-y-1.5">
            {participantes.map(p => {
              const souEu = p.id === meuId;
              const podeTirarEste = !fechado && (souEu || podeTirar);
              return (
                <li key={p.id} className="group flex items-center gap-2">
                  <LinhaPessoa nome={p.nome} foto={fotos.get(p.id) ?? null} voce={souEu} compacta />
                  {podeTirarEste && (
                    <button type="button" disabled={ocupado}
                      onClick={() => onTirar(p.id, p.nome)}
                      title={souEu ? 'Sair do ticket' : `Tirar ${p.nome} do ticket`}
                      aria-label={souEu ? 'Sair do ticket' : `Tirar ${p.nome} do ticket`}
                      className="ml-auto rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100">
                      {souEu ? <LogOut className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Ninguém além de quem pediu e de quem atende.
          </p>
        )}
        {podeChamar && (
          <Button size="sm" variant="outline" className="mt-2 h-7 gap-1.5 text-xs" disabled={ocupado} onClick={onChamar}>
            <UserPlus className="w-3.5 h-3.5" /> Chamar pessoas
          </Button>
        )}
      </Secao>

      {/* ── Informações ─────────────────────────────────────────────────── */}
      <Secao titulo="Informações">
        <dl className="space-y-2 text-xs">
          <Item rotulo="Estado">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', STATUS_TICKET[ticket.status].ponto)} />
              {STATUS_TICKET[ticket.status].label}
            </span>
          </Item>
          <Item rotulo="Prioridade">
            <span className={PRIORIDADES[ticket.prioridade].cor}>{PRIORIDADES[ticket.prioridade].label}</span>
          </Item>
          <Item rotulo="Categoria">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <IconeCategoria className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{rotuloCategoria(ticket.categoria)}</span>
            </span>
          </Item>
          <Item rotulo="Aberto em">{dataHora(ticket.criadoEm)}</Item>
          <Item rotulo="Último movimento">{textoDeIdade(tempoSemMovimento(ticket, agora))}</Item>
          {ticket.fechadoEm && <Item rotulo="Encerrado em">{dataHora(ticket.fechadoEm)}</Item>}
          {campos.map(([k, v]) => <Item key={k} rotulo={k}>{v}</Item>)}
        </dl>
      </Secao>

      {/* Uma linha de «como funciona»: quem chega na aba pela primeira vez
          entende os papéis sem perguntar. */}
      <p className="flex gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          O <strong className="font-medium text-foreground/80">responsável</strong> resolve e muda o estado.
          {' '}<strong className="font-medium text-foreground/80">Participantes</strong> veem o ticket, conversam e recebem os avisos.
        </span>
      </p>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground capitalize">{rotulo}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  );
}

function LinhaPessoa({ nome, foto, sub, voce, compacta }: {
  nome: string; foto: string | null; sub?: string; voce?: boolean; compacta?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <AvatarPessoa nome={nome} foto={foto} className={compacta ? 'w-6 h-6' : 'w-8 h-8'} />
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {nome}{voce && <span className="ml-1 text-xs font-normal text-muted-foreground">(você)</span>}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function quandoCurto(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
