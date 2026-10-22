// src/pages/Analitico/ListaOperadores.tsx
/**
 * A lista de operadores — uma só, para as duas fontes.
 *
 * Ela recebe `LinhaOperadorPainel` e não sabe se o número veio do relatório
 * mensal ou do diário. Foi assim que a segunda tela deixou de precisar existir.
 *
 * ## Por que a posição é na EQUIPE
 *
 * A pergunta que o líder faz olhando esta lista é "quem carrega o grupo", e o
 * grupo em que o operador está desenhado é a equipe. Até 16/10/2026 a resposta
 * era uma barra com «12% da equipe» — a fatia do operador no total do grupo.
 * Ninguém lia: exigia conta de cabeça. Agora é a posição, «3º de 8 na
 * equipe», com o pódio em ouro, prata e bronze; a fatia ficou no passar do
 * mouse para quem quiser o número.
 */
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { fatiaDoGrupo, posicoesNoGrupo, type LinhaOperadorPainel } from './linhaOperador';
/** Ouro, prata e bronze do pódio da equipe — as mesmas do ranking. */
const MEDALHA = ['#C9A227', '#A3ADB8', '#B4743F'];

export interface GrupoOperadores {
  equipeId: string | null;
  equipeNome: string;
  itens: LinhaOperadorPainel[];
}

interface ListaOperadoresProps {
  grupos: GrupoOperadores[];
  mostrarHO: boolean;
  /** operador_id → foto_url. Ausente = iniciais. */
  fotos: Record<string, string | null>;
  expandidos: Set<string>;
  onToggle: (operadorId: string) => void;
  renderExpandido: (l: LinhaOperadorPainel) => ReactNode;
  /** Botões à direita da linha (ex.: "Tirar da equipe"). */
  acoesDaLinha?: (l: LinhaOperadorPainel) => ReactNode;
  /**
   * Selo ao lado do nome (ex.: ⭐ EM DIA). `null` = nada.
   *
   * Ao lado do NOME, e não nas ações da direita: é uma marca para bater o olho
   * descendo a lista, e em tela larga a coluna das ações fica longe do nome.
   */
  seloDoNome?: (l: LinhaOperadorPainel) => ReactNode;
}

function iniciais(nome: string | null, usuario: string): string {
  const base = (nome ?? usuario).trim();
  const partes = base.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function ListaOperadores({
  grupos, mostrarHO, fotos, expandidos, onToggle, renderExpandido, acoesDaLinha,
  seloDoNome,
}: ListaOperadoresProps) {
  return (
    <div className="space-y-5">
      {grupos.map(grupo => {
        const totalDoGrupo = grupo.itens.reduce((s, l) => s + Math.max(0, l.valor), 0);
        const posicoes = posicoesNoGrupo(grupo.itens);
        return (
          <div key={grupo.equipeId ?? '__sem__'} className="space-y-1.5">
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
                {grupo.equipeNome}
              </span>
              <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums text-muted-foreground"
                title={`${grupo.itens.length} operador${grupo.itens.length !== 1 ? 'es' : ''}`}>
                {grupo.itens.length}
              </span>
              <div className="h-px flex-1 bg-border" />
              <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                {formatBRL(totalDoGrupo)}
              </span>
            </div>

            {grupo.itens.map(l => {
              const aberto = expandidos.has(l.operador_id);
              const fatia  = fatiaDoGrupo(l.valor, totalDoGrupo);
              const pos    = posicoes.get(l.operador_id) ?? 0;
              const medalha = pos >= 1 && pos <= 3 ? MEDALHA[pos - 1] : null;
              return (
                <div key={l.operador_id}
                  className={cn(
                    'overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/25',
                    aberto && 'border-primary/40 ring-1 ring-primary/15',
                  )}
                >
                  <div
                    role="button" tabIndex={0}
                    onClick={() => onToggle(l.operador_id)}
                    onKeyDown={e => { if (e.key === 'Enter') onToggle(l.operador_id); }}
                    aria-expanded={aberto}
                    className={cn(
                      'flex cursor-pointer select-none items-center gap-3 px-3 py-2.5 hover:bg-accent/40',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      aberto && 'bg-primary/[0.04]',
                    )}
                  >
                    {aberto
                      ? <ChevronDown  className="w-4 h-4 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}

                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={fotos[l.operador_id] ?? undefined} alt="" />
                      <AvatarFallback className="text-[10px] font-semibold">
                        {iniciais(l.nome, l.usuario)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate text-sm font-semibold leading-tight">
                          {l.nome ?? l.usuario}
                        </p>
                        {seloDoNome?.(l)}
                      </div>
                      {/* As formas de pagamento saíram da linha em 21/10/2026: não
                          eram úteis aqui. Continuam na seção Formas de pagamento. */}
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                        {l.usuario}
                      </p>
                    </div>

                    {grupo.itens.length > 1 && (
                      <div data-testid={`posicao-${l.operador_id}`}
                        className="hidden shrink-0 items-center gap-1.5 sm:flex"
                        title={`${pos}º de ${grupo.itens.length} na equipe · ${(fatia * 100).toFixed(0)}% do que a equipe recebeu`}>
                        <span
                          className={cn(
                            'flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-bold tabular-nums',
                            !medalha && 'bg-muted text-muted-foreground',
                          )}
                          style={medalha ? {
                            background: `color-mix(in oklch, ${medalha} 22%, var(--card))`,
                            color: `oklch(from ${medalha} clamp(var(--sinal-l-min), l, var(--sinal-l-max)) c h)`,
                            boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${medalha} 45%, transparent)`,
                          } : undefined}>
                          {pos}º
                        </span>
                        <span className="w-[4.5rem] text-[10.5px] leading-tight text-muted-foreground">
                          de {grupo.itens.length}<br />na equipe
                        </span>
                      </div>
                    )}

                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-bold text-primary leading-tight">
                        {formatBRL(l.valor)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {l.pagamentos} pgto.
                        {mostrarHO && l.ho !== null && <> · HO {formatBRL(l.ho)}</>}
                        {l.novos > 0 && (
                          <span className="ml-1 font-semibold text-primary">+{l.novos} novos</span>
                        )}
                      </p>
                    </div>

                    {acoesDaLinha && (
                      <div className="shrink-0" onClick={e => e.stopPropagation()}>
                        {acoesDaLinha(l)}
                      </div>
                    )}
                  </div>

                  {aberto && (
                    <div className="border-t border-border bg-background/40">{renderExpandido(l)}</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
