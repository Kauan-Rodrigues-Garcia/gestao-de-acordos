/**
 * Etiquetas.tsx — a legenda de cores das anuidades.
 *
 *   SeletorEtiqueta     o chip do ano no formulário: abre a lista de cores do
 *                       setor, «sem cor» e «nova cor» (nome + cor).
 *   GerenciarEtiquetas  renomear, trocar a cor e apagar (apagar: quem gerencia).
 *
 * A legenda é do SETOR, não da manifestação: «verde = alegou ter pago» vale
 * para todo mundo, e a lista fica igual de um caso para o outro.
 */
import { useState } from 'react';
import { Check, Loader2, Palette, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { excluirEtiqueta, salvarEtiqueta } from '@/services/ouvidoriaCofen.service';
import { useOuvidoria } from './contexto';
import { CORES_ETIQUETA, type CorEtiqueta, type Etiqueta } from './ouvidoria';
import { COR_ETIQUETA } from './estilo';

function EscolhaCor({ valor, aoMudar }: { valor: CorEtiqueta; aoMudar: (c: CorEtiqueta) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor">
      {CORES_ETIQUETA.map(c => (
        <button key={c.valor} type="button" role="radio" aria-checked={valor === c.valor} title={c.rotulo}
                onClick={() => aoMudar(c.valor)}
                className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center ring-offset-2 ring-offset-popover transition',
                  COR_ETIQUETA[c.valor].ponto, valor === c.valor ? 'ring-2 ring-foreground' : 'hover:scale-110',
                )}>
          {valor === c.valor && <Check className="h-3 w-3 text-white" />}
        </button>
      ))}
    </div>
  );
}

/** Nome + cor, para criar ou editar. */
function FormEtiqueta({ inicial, aoSalvar, aoCancelar }: {
  inicial?: Etiqueta; aoSalvar: (e: Etiqueta) => void; aoCancelar: () => void;
}) {
  const { setor, recarregar } = useOuvidoria();
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [cor, setCor] = useState<CorEtiqueta>(inicial?.cor ?? 'azul');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim()) { toast.error('Dê um nome para a cor.'); return; }
    setSalvando(true);
    try {
      const e = await salvarEtiqueta(setor.setor_id, inicial?.id ?? null, nome.trim(), cor);
      recarregar();
      aoSalvar(e);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <Input autoFocus value={nome} maxLength={40} onChange={e => setNome(e.target.value)}
             onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void salvar(); } }}
             placeholder="O que a cor quer dizer (ex.: alegou ter pago)" className="h-8 text-sm rounded-lg" />
      <EscolhaCor valor={cor} aoMudar={setCor} />
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={aoCancelar} disabled={salvando}>Cancelar</Button>
        <Button type="button" size="sm" className="h-7 text-xs" onClick={() => void salvar()} disabled={salvando}>
          {salvando && <Loader2 className="h-3 w-3 animate-spin mr-1" />} Salvar
        </Button>
      </div>
    </div>
  );
}

/** O chip de um ano escolhido: mostra a cor e abre a lista para trocar. */
export function SeletorEtiqueta({ ano, valor, aoMudar }: {
  ano: number; valor: string | null; aoMudar: (id: string | null) => void;
}) {
  const { etiquetas } = useOuvidoria();
  const [aberto, setAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const atual = etiquetas.find(e => e.id === valor) ?? null;
  const escolher = (id: string | null) => { aoMudar(id); setAberto(false); setCriando(false); };

  return (
    <Popover open={aberto} onOpenChange={o => { setAberto(o); if (!o) setCriando(false); }}>
      <PopoverTrigger asChild>
        <button type="button" title={atual ? atual.nome : 'Sem cor — clique para escolher'}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-mono font-semibold tabular-nums transition-colors',
                  atual ? COR_ETIQUETA[atual.cor].chip : 'border-dashed text-muted-foreground hover:bg-muted',
                )}>
          {ano}
          {atual ? <span className="font-sans font-medium max-w-[140px] truncate">· {atual.nome}</span> : <Palette className="h-3 w-3" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-2 rounded-xl">
        {criando ? (
          <div className="p-1">
            <p className="text-xs font-semibold mb-2">Nova cor para a legenda</p>
            <FormEtiqueta aoSalvar={e => escolher(e.id)} aoCancelar={() => setCriando(false)} />
          </div>
        ) : (
          <ul className="space-y-0.5">
            <li className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">Cor da anuidade {ano}</li>
            <li>
              <button type="button" onClick={() => escolher(null)}
                      className={cn('w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left hover:bg-accent',
                        !valor && 'bg-primary/10 text-primary font-medium')}>
                <span className="h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground" /> Sem cor
              </button>
            </li>
            {etiquetas.map(e => (
              <li key={e.id}>
                <button type="button" onClick={() => escolher(e.id)}
                        className={cn('w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left hover:bg-accent',
                          valor === e.id && 'bg-primary/10 text-primary font-medium')}>
                  <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', COR_ETIQUETA[e.cor].ponto)} />
                  <span className="truncate">{e.nome}</span>
                  {valor === e.id && <Check className="h-3.5 w-3.5 ml-auto" />}
                </button>
              </li>
            ))}
            <li className="border-t mt-1 pt-1">
              <button type="button" onClick={() => setCriando(true)}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left hover:bg-accent text-primary">
                <Plus className="h-3.5 w-3.5" /> Nova cor
              </button>
            </li>
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** A legenda do setor, com editar e apagar. */
export function GerenciarEtiquetas({ children }: { children: React.ReactNode }) {
  const { etiquetas, setor, meuId, recarregar } = useOuvidoria();
  const [editando, setEditando] = useState<string | 'nova' | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);

  async function apagar(e: Etiqueta) {
    if (!window.confirm(`Apagar a cor «${e.nome}»? Ela sai de todas as anuidades que a usam.`)) return;
    setApagando(e.id);
    try {
      await excluirEtiqueta(e.id);
      toast.success('Cor apagada.');
      recarregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setApagando(null);
    }
  }

  return (
    <Popover onOpenChange={o => { if (!o) setEditando(null); }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-3 rounded-xl space-y-2">
        <p className="text-sm font-semibold">Legenda das anuidades</p>
        <p className="text-[11px] text-muted-foreground">Vale para todo o setor. Quem atende cria; apagar é de quem gerencia.</p>
        <ul className="space-y-1">
          {etiquetas.map(e => (
            <li key={e.id} className="rounded-lg border px-2 py-1.5">
              {editando === e.id ? (
                <FormEtiqueta inicial={e} aoSalvar={() => setEditando(null)} aoCancelar={() => setEditando(null)} />
              ) : (
                <div className="flex items-center gap-2">
                  <span className={cn('h-3 w-3 rounded-full shrink-0', COR_ETIQUETA[e.cor].ponto)} />
                  <span className="text-sm truncate flex-1">{e.nome}</span>
                  {(setor.pode_gerir || e.criado_por === meuId) && (
                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label={`Editar ${e.nome}`}
                            onClick={() => setEditando(e.id)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                  {setor.pode_gerir && (
                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                            aria-label={`Apagar ${e.nome}`} disabled={apagando === e.id} onClick={() => void apagar(e)}>
                      {apagando === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
          {!etiquetas.length && <li className="text-xs text-muted-foreground py-2 text-center">Nenhuma cor ainda.</li>}
        </ul>
        {editando === 'nova' ? (
          <div className="rounded-lg border p-2"><FormEtiqueta aoSalvar={() => setEditando(null)} aoCancelar={() => setEditando(null)} /></div>
        ) : (
          <Button type="button" size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => setEditando('nova')}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova cor
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
