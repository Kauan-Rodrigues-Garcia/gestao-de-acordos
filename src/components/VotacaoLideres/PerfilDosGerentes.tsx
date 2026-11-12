/**
 * PerfilDosGerentes — o resultado da votação dos gerentes (12/11/2026).
 *
 * Ali o operador marcou, para o gerente dele, a opção que mais se encaixa.
 * Então o resultado não é «quem ganhou cada categoria»: é o PERFIL de cada
 * gerente — o que a equipe dele mais marcou, em % dos votos que ele recebeu
 * (setor grande e pequeno se comparam igual).
 *
 * Usado na apuração (diretoria, com «Liberar o resultado»), no resultado
 * liberado e na demonstração.
 */
import { useMemo } from 'react';
import { Eye, Unlock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { perfilDosGerentes, type Candidato, type ResultadoDaPergunta } from './cedula';
import { FotoLider } from './FotoLider';

interface Props {
  resultados: ResultadoDaPergunta[];
  pessoas: ReadonlyMap<string, Candidato>;
  /** Só na apuração: o botão de liberar (a diretoria). */
  onLiberar?: () => void;
  /** Texto acima, ex.: «Só a diretoria vê». */
  selo?: string;
}

export function PerfilDosGerentes({ resultados, pessoas, onLiberar, selo }: Props) {
  const perfis = useMemo(() => {
    const ids = [...pessoas.keys()];
    return perfilDosGerentes(resultados, ids)
      .sort((a, b) => (pessoas.get(a.id)?.nome ?? '').localeCompare(pessoas.get(b.id)?.nome ?? '', 'pt-BR'));
  }, [resultados, pessoas]);
  const votos = perfis.reduce((a, p) => a + p.total, 0);

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-4 px-4 pb-28 pt-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {selo && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Eye className="h-3 w-3" /> {selo}
            </span>
          )}
          <h2 className="mt-2 text-2xl font-bold tracking-tight">Como a equipe vê o seu gerente</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada pessoa marcou a opção que mais se encaixa com o gerente dela. Em cada gerente, a % é de quem votou nele.
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm">
          <Users className="h-4 w-4 text-primary" /> <strong className="tabular-nums">{votos}</strong> {votos === 1 ? 'voto' : 'votos'}
          {perfis.length > 1 && <span className="text-xs text-muted-foreground">· {perfis.length} gerentes</span>}
        </span>
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {perfis.map(p => {
          const g = pessoas.get(p.id);
          return (
            <li key={p.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <FotoLider lider={g} className="h-14 w-14 rounded-xl text-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold">{g?.nome ?? 'Gerente'}</p>
                  <p className="truncate text-xs text-muted-foreground">{g?.setor} · {p.total} {p.total === 1 ? 'voto' : 'votos'}</p>
                </div>
              </div>
              {p.destaque.length > 0 ? (
                <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm">
                  A equipe vê como{' '}
                  <strong className="text-primary">{p.destaque.map(d => `${d.emoji} ${d.texto}`).join(' e ')}</strong>
                  {' '}<span className="text-muted-foreground">({p.opcoes[0].pct}%)</span>
                </p>
              ) : (
                <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Ainda sem votos.</p>
              )}
              <ul className="mt-3 space-y-1.5">
                {p.opcoes.filter(o => o.votos > 0).map(o => (
                  <li key={o.pergunta.id} className="text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate">{o.pergunta.emoji} {o.pergunta.texto}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{o.votos} · {o.pct}%</span>
                    </div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className={cn('h-full rounded-full', p.destaque.some(d => d.id === o.pergunta.id) ? 'bg-primary' : 'bg-primary/40')}
                        style={{ width: `${o.pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      {onLiberar && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background px-4 py-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Nada a decidir: cada gerente tem o seu perfil. Libere quando quiser mostrar.</p>
            <Button className="shrink-0 gap-2" onClick={onLiberar}><Unlock className="h-4 w-4" /> Liberar o resultado</Button>
          </div>
        </div>
      )}
    </div>
  );
}
