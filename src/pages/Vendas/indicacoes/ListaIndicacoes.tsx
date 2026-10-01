/**
 * ListaIndicacoes — as indicações do mês, um cartão por escola.
 *
 * Era uma tabela com células mescladas e sem busca: achar «aquela escola»
 * era rolar a página. Agora cada contato (escola + gestora) é um cartão, com
 * os telefones como etiquetas e quem indicou embaixo, e uma busca que ignora
 * acento e acha telefone pelos dígitos.
 *
 * Corrigir e excluir continuam por TELEFONE — cada número é uma indicação, e
 * é ele que sai do ranking. Por isso os botões ficam em cada etiqueta, e não
 * no cartão.
 */
import { useMemo, useState } from 'react';
import { Search, Building2, UserRound, Phone, Pencil, Trash2, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { agruparPorContato } from '@/lib/indicacoes';
import { casaComBusca, iniciais } from '@/lib/indicacoesResumo';
import type { Indicacao } from '@/services/vendas/indicacoes.service';

const PASSO = 12;

function diaCurto(iso: string): string {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}

interface Props {
  itens: readonly Indicacao[];
  mesRotulo: string;
  carregando: boolean;
  /** Mostra quem indicou em cada cartão — some na visão «só as minhas». */
  mostrarQuem: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  onCorrigir: (item: Indicacao) => void;
  onExcluir: (item: Indicacao) => void;
}

export function ListaIndicacoes({
  itens, mesRotulo, carregando, mostrarQuem, podeEditar, podeExcluir, onCorrigir, onExcluir,
}: Props) {
  const [busca, setBusca] = useState('');
  // Um mês cheio passa de cem contatos; no celular isso é uma rolagem sem fim.
  // Abre com 12 e cresce de 12 em 12 — buscar sempre procura em todos.
  const [limite, setLimite] = useState(PASSO);

  const filtrados = useMemo(() => itens.filter(i => casaComBusca(i, busca)), [itens, busca]);
  // O mais recente primeiro: é o que a pessoa acabou de gravar e quer conferir.
  const grupos = useMemo(
    () => agruparPorContato(filtrados).sort((a, b) => (
      (b[0].data_indicacao + b[0].criado_em).localeCompare(a[0].data_indicacao + a[0].criado_em)
    )),
    [filtrados],
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <ListChecks className="h-4 w-4 text-primary" aria-hidden />
          Indicações de {mesRotulo}
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {itens.length}
          </span>
        </h2>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)}
                 placeholder="Buscar escola, gestora, telefone ou quem indicou"
                 className="h-9 pl-8 text-xs" />
        </div>
      </div>

      {itens.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground/50" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {carregando ? 'Carregando…' : `Nenhuma indicação em ${mesRotulo} ainda.`}
          </p>
        </div>
      ) : grupos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nada encontrado para «{busca}».</p>
      ) : (
        <>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {grupos.slice(0, limite).map(grupo => {
            const primeiro = grupo[0];
            const quem = [...new Set(grupo.map(g => g.perfis?.nome).filter(Boolean))] as string[];
            return (
              <article key={primeiro.id}
                       className="group flex flex-col rounded-xl border border-border bg-background p-3 transition-colors hover:border-primary/30">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold" title={primeiro.instituicao}>{primeiro.instituicao}</h3>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <UserRound className="h-3 w-3 shrink-0" aria-hidden />
                      {primeiro.gestora ?? 'sem gestora informada'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                    {diaCurto(primeiro.data_indicacao)}
                  </span>
                </div>

                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {grupo.map(item => (
                    <li key={item.id}
                        className="flex items-center gap-1 rounded-full border border-border bg-muted/30 py-0.5 pl-2 pr-1 text-xs">
                      <Phone className="h-3 w-3 text-muted-foreground" aria-hidden />
                      <span className="tabular-nums">{item.telefone ?? 'sem telefone'}</span>
                      {(podeEditar || podeExcluir) && (
                        <span className="flex items-center opacity-60 transition-opacity group-hover:opacity-100">
                          {podeEditar && (
                            <button type="button" aria-label="Corrigir" onClick={() => onCorrigir(item)}
                                    className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-muted">
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                          )}
                          {podeExcluir && (
                            <button type="button" aria-label="Excluir" onClick={() => onExcluir(item)}
                                    className="flex h-5 w-5 items-center justify-center rounded-full text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {(mostrarQuem && quem.length > 0) || grupo.length > 1 ? (
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
                    {mostrarQuem && quem.length > 0 ? (
                      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground">
                          {iniciais(quem[0])}
                        </span>
                        <span className="truncate">{quem.join(', ')}</span>
                      </span>
                    ) : <span />}
                    {grupo.length > 1 && (
                      <span className={cn('shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary')}>
                        {grupo.length} indicações
                      </span>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
        {grupos.length > limite && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setLimite(l => l + PASSO)}>
              Mostrar mais {Math.min(PASSO, grupos.length - limite)} de {grupos.length - limite} contatos
            </Button>
          </div>
        )}
        </>
      )}
    </section>
  );
}
