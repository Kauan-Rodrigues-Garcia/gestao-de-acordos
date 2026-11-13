/**
 * As metas do mês de um grupo (equipe ou subgrupo). Só a liderança abre.
 *
 * Em cima a meta da EQUIPE — o total do grupo no mês (13/11/2026; até então
 * valia para cada operador). Embaixo, uma linha por pessoa: com número, é a
 * meta individual dela; em branco, ela não tem meta individual.
 *
 * Até QUATRO metas no mês (05/11/2026): a 1ª e mais três faixas acima, como os
 * desafios do Receptivo. Em branco no fim = não tem aquela faixa. Cada uma tem
 * de ser maior que a anterior (`lerMetas`).
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
import { MAX_METAS, ORDINAIS, TEXTOS, iniciais, lerMetas } from './jornada';

export interface MetaIndividual {
  perfil_id: string;
  /** As metas dela, em ordem. `null` tira a meta individual. */
  metas: number[] | null;
}

type Campos = string[];

const soDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 6);
const vazios = (): Campos => Array.from({ length: MAX_METAS }, () => '');
const camposDe = (metas: readonly number[]): Campos =>
  Array.from({ length: MAX_METAS }, (_, i) => (metas[i] ? String(metas[i]) : ''));
const assinatura = (c: Campos) => c.join('|');

export function DialogMeta({
  aberto, aoFechar, tipo, metasAtuais, pessoas, focoPessoa, aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  tipo: TipoJornada;
  /** As metas do grupo hoje (vazia = sem meta). */
  metasAtuais: number[];
  /** Quem está no grupo hoje. */
  pessoas: PessoaPlacar[];
  /** Abre com o cursor na meta desta pessoa (clicada no placar). */
  focoPessoa?: string | null;
  /** Grava as metas do grupo (vazia tira) e só as individuais que mudaram. */
  aoSalvar: (grupo: number[], individuais: MetaIndividual[]) => Promise<void>;
}) {
  const textos = TEXTOS[tipo];
  const [grupo, setGrupo] = useState<Campos>(vazios);
  const [individuais, setIndividuais] = useState<Record<string, Campos>>({});
  const [salvando, setSalvando] = useState(false);
  const lista = useRef<HTMLDivElement>(null);

  const iniciaisDe = (ps: PessoaPlacar[]) =>
    Object.fromEntries(ps.map(p => [p.id, p.meta_propria ? camposDe(p.metas) : vazios()]));

  useEffect(() => {
    if (!aberto) return;
    setGrupo(camposDe(metasAtuais));
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

  const lidoGrupo = lerMetas(grupo);
  const lidas = Object.fromEntries(
    Object.entries(individuais).map(([id, c]) => [id, lerMetas(c)]),
  );
  const primeiroErro = lidoGrupo.erro
    ?? Object.entries(lidas).map(([id, l]) => (l.erro
      ? `${pessoas.find(p => p.id === id)?.nome ?? 'Pessoa'}: ${l.erro}`
      : null)).find(Boolean)
    ?? null;

  const antes = iniciaisDe(pessoas);
  const mudancas: MetaIndividual[] = pessoas
    .filter(p => assinatura(individuais[p.id] ?? vazios()) !== assinatura(antes[p.id]))
    .map(p => {
      const metas = lidas[p.id]?.metas ?? [];
      return { perfil_id: p.id, metas: metas.length ? metas : null };
    });
  const grupoMudou = assinatura(grupo) !== assinatura(camposDe(metasAtuais));
  const comPropria = Object.values(individuais).filter(c => c.some(Boolean)).length;

  function mudarCampo(atual: Campos, i: number, valor: string): Campos {
    const novo = [...atual];
    novo[i] = soDigitos(valor);
    return novo;
  }

  async function gravar(e: React.FormEvent) {
    e.preventDefault();
    if (primeiroErro) return;
    setSalvando(true);
    try {
      await aoSalvar(lidoGrupo.metas, mudancas);
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Metas do mês · {textos.titulo}</DialogTitle>
          <DialogDescription>
            A meta da equipe é o total do grupo no mês; a individual, o de cada pessoa. Até 4 metas,
            cada uma maior que a anterior. Em branco no fim = sem aquela meta. Zera no dia 1.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={gravar}>
          <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">Meta da equipe</span>
                <span className="block text-xs text-muted-foreground">O total de {textos.unidade} do grupo no mês</span>
              </span>
              <div className="flex gap-1.5">
                {grupo.map((v, i) => (
                  <label key={i} className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] font-semibold text-muted-foreground">{ORDINAIS[i]}</span>
                    <Input
                      autoFocus={!focoPessoa && i === 0}
                      inputMode="numeric"
                      value={v}
                      onChange={e => setGrupo(g => mudarCampo(g, i, e.target.value))}
                      placeholder={i === 0 ? 'Ex.: 1200' : '—'}
                      aria-label={`${ORDINAIS[i]} meta da equipe`}
                      className={cn('h-9 w-[4.5rem] text-right tabular-nums font-semibold', lidoGrupo.erro && v && 'border-destructive')}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Metas individuais</span>
              <span className="text-xs text-muted-foreground">
                {comPropria ? `${comPropria} com meta individual` : 'em branco = sem meta individual'}
              </span>
            </div>
            {pessoas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">Ninguém no grupo ainda.</p>
            ) : (
              <div ref={lista} className="rounded-lg border divide-y max-h-[320px] overflow-y-auto">
                {pessoas.map(p => {
                  const campos = individuais[p.id] ?? vazios();
                  const propria = campos.some(Boolean);
                  const erro = lidas[p.id]?.erro;
                  return (
                    <div key={p.id} className={cn('flex items-center gap-2.5 px-3 h-12', propria && 'bg-primary/5')}>
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
                      {propria && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setIndividuais(s => ({ ...s, [p.id]: vazios() }))}
                          title="Tirar a meta individual"
                          aria-label={`Tirar a meta individual de ${p.nome}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <div className="flex gap-1">
                        {campos.map((v, i) => (
                          <Input
                            key={i}
                            data-perfil={i === 0 ? p.id : undefined}
                            inputMode="numeric"
                            value={v}
                            onChange={e => setIndividuais(s => ({
                              ...s, [p.id]: mudarCampo(s[p.id] ?? vazios(), i, e.target.value),
                            }))}
                            placeholder="—"
                            aria-label={`${ORDINAIS[i]} meta de ${p.nome}`}
                            className={cn(
                              'h-8 w-14 text-right tabular-nums px-2',
                              v && 'border-primary font-semibold',
                              erro && v && 'border-destructive',
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {primeiroErro && (
            <p className="text-xs text-destructive">{primeiroErro}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
            <Button type="submit" disabled={!!primeiroErro || salvando || (!grupoMudou && mudancas.length === 0)}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
