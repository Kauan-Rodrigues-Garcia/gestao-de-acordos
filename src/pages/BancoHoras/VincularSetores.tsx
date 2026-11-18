/**
 * VincularSetoresBH — «Ligar setores» do Banco de Horas.
 *
 * Cada setor do DP ganha um ou mais setores do gestão. É esse vínculo que faz
 * o líder (alcance «setor») ver o banco de horas do setor dele: a RLS
 * (`fn_banco_horas_alcanca`) lê `banco_horas_mapa`. Quem vê todos os setores
 * não depende dele. Só aparece para `banco_horas_gerenciar`.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { empresaCurta, titulo } from '@/lib/bancoHoras/formato';
import { salvarVinculos, type VinculoBH } from '@/services/bancoHoras/bancoHoras.service';
import { sugerirSetor, type SetorDoDp } from '@/services/bancoHoras/vinculos';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  empresaId: string;
  setoresDp: SetorDoDp[];
  vinculos: VinculoBH[];
  setores: { id: string; nome: string }[];
  onSalvo: () => void;
}


export function VincularSetoresBH({ aberto, onFechar, empresaId, setoresDp, vinculos, setores, onSalvo }: Props) {
  const inicial = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const s of setoresDp) m[s.chave] = [];
    for (const v of vinculos) {
      const k = `${v.empresaCodigo}|${v.setorDp}`;
      (m[k] ??= []).push(v.setorId);
    }
    return m;
  }, [setoresDp, vinculos]);

  const [mapa, setMapa] = useState<Record<string, string[]>>(inicial);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (aberto) setMapa(inicial); }, [aberto, inicial]);

  const nomeSetor = useMemo(() => new Map(setores.map(s => [s.id, s.nome])), [setores]);
  const semNenhum = setoresDp.filter(s => !(mapa[s.chave]?.length)).length;
  const mudou = setoresDp.filter(s => {
    const a = [...(mapa[s.chave] ?? [])].sort().join(','), b = [...(inicial[s.chave] ?? [])].sort().join(',');
    return a !== b;
  });

  const sugerir = () => {
    const novo = { ...mapa };
    let n = 0;
    for (const s of setoresDp) {
      if (novo[s.chave]?.length) continue;
      const id = sugerirSetor(s.setorDp, setores);
      if (id) { novo[s.chave] = [id]; n++; }
    }
    setMapa(novo);
    toast(n ? `${n} sugerido(s) pelo nome. Confira antes de salvar.` : 'Nenhum nome sem setor bateu com um setor do gestão.');
  };

  const salvar = async () => {
    if (!mudou.length) { onFechar(); return; }
    setSalvando(true);
    try {
      await salvarVinculos(empresaId, mudou.map(s => ({
        empresaCodigo: s.empresaCodigo, setorDp: s.setorDp, setorIds: mapa[s.chave] ?? [],
      })));
      toast.success('Setores ligados.');
      onSalvo();
      onFechar();
    } catch (e) {
      toast.error('Não foi possível salvar', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a && !salvando) onFechar(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ligar setores do DP aos setores do gestão</DialogTitle>
          <DialogDescription>
            O líder vê o banco de horas dos setores do DP ligados ao setor dele. Quem vê todos os
            setores não depende disto. Um setor do DP pode ir para mais de um setor do gestão.
          </DialogDescription>
        </DialogHeader>

        {setoresDp.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Importe um relatório do DP primeiro: os setores dele aparecem aqui.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
            {setoresDp.map(s => {
              const ligados = mapa[s.chave] ?? [];
              const livres = setores.filter(x => !ligados.includes(x.id));
              return (
                <div key={s.chave} className={cn(
                  'flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2',
                  ligados.length ? 'border-border' : 'border-amber-500/40 bg-amber-500/5',
                )}>
                  <div className="min-w-[180px] flex-1">
                    <div className="text-sm font-medium text-foreground">{titulo(s.setorDp)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {empresaCurta(s.empresaNome)} · {s.pessoas} {s.pessoas === 1 ? 'pessoa' : 'pessoas'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ligados.map(id => (
                      <span key={id} className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-foreground">
                        {nomeSetor.get(id) ?? 'Setor'}
                        <button
                          type="button"
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                          aria-label={`Tirar ${nomeSetor.get(id) ?? 'setor'}`}
                          onClick={() => setMapa(m => ({ ...m, [s.chave]: (m[s.chave] ?? []).filter(x => x !== id) }))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <Select
                      value=""
                      onValueChange={id => setMapa(m => ({ ...m, [s.chave]: [...(m[s.chave] ?? []), id] }))}
                    >
                      <SelectTrigger className="h-7 w-40 rounded-md text-xs">
                        <SelectValue placeholder={ligados.length ? 'Mais um setor' : 'Escolher setor'} />
                      </SelectTrigger>
                      <SelectContent>
                        {livres.map(x => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="flex-wrap items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {semNenhum ? `${semNenhum} sem setor ligado` : 'Todos ligados'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={sugerir} disabled={salvando || !setoresDp.length}>
              <Sparkles className="h-3.5 w-3.5" /> Sugerir pelos nomes
            </Button>
            <Button variant="outline" size="sm" onClick={onFechar} disabled={salvando}>Cancelar</Button>
            <Button size="sm" onClick={() => void salvar()} disabled={salvando || !mudou.length}>
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar{mudou.length ? ` (${mudou.length})` : ''}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
