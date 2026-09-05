// src/pages/Analitico/ListaOperadores.tsx
/**
 * A lista de operadores — uma só, para as duas fontes.
 *
 * Ela recebe `LinhaOperadorPainel` e não sabe se o número veio do relatório
 * mensal ou do diário. Foi assim que a segunda tela deixou de precisar existir.
 *
 * ## Por que a barra mede a EQUIPE
 *
 * A pergunta que o líder faz olhando esta lista é "quem carrega o grupo", e o
 * grupo em que o operador está desenhado é a equipe. Medir contra a empresa
 * daria barras de 3% para todo mundo — verdadeiro e inútil.
 */
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { corDaForma } from '@/lib/formasPagamento';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { fatiaDoGrupo, type LinhaOperadorPainel } from './linhaOperador';

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
}: ListaOperadoresProps) {
  return (
    <div className="space-y-5">
      {grupos.map(grupo => {
        const totalDoGrupo = grupo.itens.reduce((s, l) => s + Math.max(0, l.valor), 0);
        return (
          <div key={grupo.equipeId ?? '__sem__'} className="space-y-1.5">
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {grupo.equipeNome}
              </span>
              <div className="h-px flex-1 bg-border" />
              <span className="font-mono text-xs text-muted-foreground">
                {formatBRL(totalDoGrupo)}
              </span>
            </div>

            {grupo.itens.map(l => {
              const aberto = expandidos.has(l.operador_id);
              const fatia  = fatiaDoGrupo(l.valor, totalDoGrupo);
              return (
                <div key={l.operador_id}
                  className={cn(
                    'rounded-xl border border-border bg-card overflow-hidden transition-colors',
                    aberto && 'border-primary/30',
                  )}
                >
                  <div
                    role="button" tabIndex={0}
                    onClick={() => onToggle(l.operador_id)}
                    onKeyDown={e => { if (e.key === 'Enter') onToggle(l.operador_id); }}
                    className="flex cursor-pointer select-none items-center gap-3 px-3 py-2.5 hover:bg-accent/40"
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
                      <p className="truncate text-sm font-semibold leading-tight">
                        {l.nome ?? l.usuario}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {l.usuario}
                        </span>
                        {l.porForma.map(f => (
                          <span key={f.rotulo}
                            title={`${f.rotulo}: ${formatBRL(f.valor)}`}
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                          >
                            <span className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: corDaForma(f.rotulo) }} />
                            {f.rotulo}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="hidden w-28 shrink-0 sm:block">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div data-testid={`barra-${l.operador_id}`}
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${(fatia * 100).toFixed(0)}%` }} />
                      </div>
                      <p className="mt-1 text-right text-[10px] tabular-nums text-muted-foreground">
                        {(fatia * 100).toFixed(0)}% da equipe
                      </p>
                    </div>

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
                    <div className="border-t border-border">{renderExpandido(l)}</div>
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
