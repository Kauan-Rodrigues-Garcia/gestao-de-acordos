/**
 * As metas do mês de um grupo (equipe ou subgrupo). Só a liderança abre.
 *
 * Em cima a meta do grupo — a de cada operador. Embaixo, uma linha por pessoa:
 * em branco segue a do grupo; com número, é a meta só dela (04/11/2026).
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { PessoaPlacar, TipoJornada } from '@/services/jornada/jornada.service';
import { TEXTOS, iniciais } from './jornada';

export interface MetaIndividual {
  perfil_id: string;
  /** `null` devolve a pessoa à meta do grupo. */
  meta: number | null;
}

const LIMITE = 100000;
const soDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 6);
const valido = (v: string) => v === '' || (Number(v) >= 1 && Number(v) <= LIMITE);

export function DialogMeta({
  aberto, aoFechar, tipo, metaAtual, pessoas, focoPessoa, aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  tipo: TipoJornada;
  metaAtual: number | null;
  /** Quem está no grupo hoje. */
  pessoas: PessoaPlacar[];
  /** Abre com o cursor na meta desta pessoa (clicada no placar). */
  focoPessoa?: string | null;
  /** Grava a meta do grupo (`null` tira) e só as individuais que mudaram. */
  aoSalvar: (meta: number | null, individuais: MetaIndividual[]) => Promise<void>;
}) {
  const textos = TEXTOS[tipo];
  const [grupo, setGrupo] = useState('');
  const [individuais, setIndividuais] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const lista = useRef<HTMLDivElement>(null);

  const iniciaisDe = (ps: PessoaPlacar[]) =>
    Object.fromEntries(ps.map(p => [p.id, p.meta_propria && p.meta ? String(p.meta) : '']));

  useEffect(() => {
    if (!aberto) return;
    setGrupo(metaAtual ? String(metaAtual) : '');
    setIndividuais(iniciaisDe(pessoas));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [aberto]);

  useEffect(() => {
    if (!aberto || !focoPessoa) return;
    const t = window.setTimeout(() => {
      const el = lista.current?.querySelector<HTMLInputElement>(`[data-perfil="${focoPessoa}"]`);
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
      el?.select();
    }, 50);
    return () => window.clearTimeout(t);
  }, [aberto, focoPessoa]);

  const todosValidos = valido(grupo) && Object.values(individuais).every(valido);
  const antes = iniciaisDe(pessoas);
  const mudancas: MetaIndividual[] = pessoas
    .filter(p => (individuais[p.id] ?? '') !== antes[p.id])
    .map(p => ({ perfil_id: p.id, meta: individuais[p.id] ? Number(individuais[p.id]) : null }));
  const grupoMudou = grupo !== (metaAtual ? String(metaAtual) : '');
  const comPropria = Object.values(individuais).filter(Boolean).length;

  async function gravar(e: React.FormEvent) {
    e.preventDefault();
    if (!todosValidos) return;
    setSalvando(true);
    try {
      await aoSalvar(grupo ? Number(grupo) : null, mudancas);
      toast.success('Metas salvas.');
      aoFechar();
    } catch (erro) {
      toast.error((erro as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Metas do mês · {textos.titulo}</DialogTitle>
          <DialogDescription>
            Quantos {textos.unidade} cada operador precisa fazer no mês. Zera no dia 1.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={gravar}>
          <label className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">Meta do grupo</span>
              <span className="block text-xs text-muted-foreground">Vale para todos sem meta própria</span>
            </span>
            <Input
              autoFocus={!focoPessoa}
              inputMode="numeric"
              value={grupo}
              onChange={e => setGrupo(soDigitos(e.target.value))}
              placeholder="Ex.: 100"
              aria-label="Meta do grupo"
              className={cn('h-9 w-24 text-right tabular-nums font-semibold', !valido(grupo) && 'border-destructive')}
            />
          </label>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Meta individual</span>
              <span className="text-xs text-muted-foreground">
                {comPropria ? `${comPropria} com meta própria` : 'em branco = a do grupo'}
              </span>
            </div>
            {pessoas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">Ninguém no grupo ainda.</p>
            ) : (
              <div ref={lista} className="rounded-lg border divide-y max-h-[300px] overflow-y-auto">
                {pessoas.map(p => {
                  const v = individuais[p.id] ?? '';
                  return (
                    <div key={p.id} className={cn('flex items-center gap-2.5 px-3 h-11', v && 'bg-primary/5')}>
                      {p.foto_url ? (
                        <img src={p.foto_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <span className="h-7 w-7 rounded-full bg-muted text-[10px] font-semibold flex items-center justify-center shrink-0">
                          {iniciais(p.nome)}
                        </span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm truncate">{p.nome}</span>
                        <span className="block text-[11px] text-muted-foreground tabular-nums">{p.no_mes} no mês</span>
                      </span>
                      {v && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setIndividuais(s => ({ ...s, [p.id]: '' }))}
                          title="Voltar à meta do grupo"
                          aria-label={`Voltar ${p.nome} à meta do grupo`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <Input
                        data-perfil={p.id}
                        inputMode="numeric"
                        value={v}
                        onChange={e => setIndividuais(s => ({ ...s, [p.id]: soDigitos(e.target.value) }))}
                        placeholder={grupo || '—'}
                        aria-label={`Meta de ${p.nome}`}
                        className={cn(
                          'h-8 w-20 text-right tabular-nums',
                          v && 'border-primary font-semibold',
                          !valido(v) && 'border-destructive',
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
            <Button type="submit" disabled={!todosValidos || salvando || (!grupoMudou && mudancas.length === 0)}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
