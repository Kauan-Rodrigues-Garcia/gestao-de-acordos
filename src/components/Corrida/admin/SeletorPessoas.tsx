/**
 * SeletorPessoas — escolher quem corre, quem assiste e quem recebe o card de
 * divulgação: por setor, por equipe, por cargo ou pessoa a pessoa, com atalhos
 * («todos os da lista», «um por setor», «um por equipe»).
 */
import { useMemo, useState } from 'react';
import { Search, Shuffle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { PessoaDoCadastro } from './pessoas';

interface Props {
  pessoas: PessoaDoCadastro[];
  marcados: Set<string>;
  onChange: (novos: Set<string>) => void;
  /** «12 pessoas correndo», «30 pessoas assistindo»… */
  rotulo: (n: number) => string;
  desabilitado?: boolean;
}

type FiltroCargo = 'todos' | 'operacao' | 'lideranca';
const LIDERANCA = new Set(['lider', 'administrador', 'super_admin', 'gerencia', 'diretoria', 'elite']);
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function SeletorPessoas({ pessoas, marcados, onChange, rotulo, desabilitado }: Props) {
  const [setores, setSetores] = useState<Set<string>>(new Set());
  const [equipes, setEquipes] = useState<Set<string>>(new Set());
  const [grupo, setGrupo] = useState<FiltroCargo>('todos');
  const [busca, setBusca] = useState('');

  const todosSetores = useMemo(() => [...new Set(pessoas.map(p => p.setor))].sort((a, b) => a.localeCompare(b)), [pessoas]);
  const todasEquipes = useMemo(() => [...new Set(pessoas.filter(p => !setores.size || setores.has(p.setor)).map(p => p.equipe).filter((e): e is string => !!e))].sort((a, b) => a.localeCompare(b)), [pessoas, setores]);

  const lista = useMemo(() => pessoas.filter(p =>
    (!setores.size || setores.has(p.setor))
    && (!equipes.size || (p.equipe != null && equipes.has(p.equipe)))
    && (grupo === 'todos' || (grupo === 'lideranca') === LIDERANCA.has(p.perfil))
    && (!busca || semAcento(p.nome).includes(semAcento(busca)))), [pessoas, setores, equipes, grupo, busca]);

  const alterna = <T,>(conj: Set<T>, v: T) => { const n = new Set(conj); if (n.has(v)) n.delete(v); else n.add(v); return n; };
  const marcar = (ids: string[], sim: boolean) => { const n = new Set(marcados); ids.forEach(id => (sim ? n.add(id) : n.delete(id))); onChange(n); };
  const sortearUmPor = (chave: (p: PessoaDoCadastro) => string | null) => {
    const grupos = new Map<string, PessoaDoCadastro[]>();
    for (const p of lista) { const k = chave(p); if (!k) continue; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k)!.push(p); }
    const n = new Set(marcados);
    for (const g of grupos.values()) n.add(g[Math.floor(Math.random() * g.length)].id);
    onChange(n);
  };
  const escolhidos = useMemo(() => pessoas.filter(p => marcados.has(p.id)), [pessoas, marcados]);
  const porSetor = useMemo(() => {
    const m = new Map<string, number>(); for (const p of escolhidos) m.set(p.setor, (m.get(p.setor) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [escolhidos]);

  const chip = (ativo: boolean) => cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/60');

  return (
    <div className={cn('grid gap-3 md:grid-cols-[1fr_220px]', desabilitado && 'pointer-events-none opacity-60')}>
      <div className="space-y-2.5 rounded-lg border p-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Setores">
          <button type="button" className={chip(!setores.size)} onClick={() => { setSetores(new Set()); setEquipes(new Set()); }}>Todos os setores</button>
          {todosSetores.map(s => <button key={s} type="button" className={chip(setores.has(s))} aria-pressed={setores.has(s)} onClick={() => { setSetores(alterna(setores, s)); setEquipes(new Set()); }}>{s}</button>)}
        </div>
        {todasEquipes.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Equipes">
            <button type="button" className={chip(!equipes.size)} onClick={() => setEquipes(new Set())}>Todas as equipes</button>
            {todasEquipes.map(e => <button key={e} type="button" className={chip(equipes.has(e))} aria-pressed={equipes.has(e)} onClick={() => setEquipes(alterna(equipes, e))}>{e}</button>)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Cargo" className="flex overflow-hidden rounded-md border text-xs">
            {([['todos', 'Todos'], ['operacao', 'Operação'], ['lideranca', 'Liderança']] as const).map(([v, t]) => (
              <button key={v} type="button" role="radio" aria-checked={grupo === v} onClick={() => setGrupo(v)} className={cn('px-2.5 py-1', grupo === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{t}</button>
            ))}
          </div>
          <div className="relative min-w-[160px] flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome" className="h-8 pl-7 text-xs" aria-label="Buscar nome" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 text-muted-foreground">{lista.length} na lista · {lista.filter(p => marcados.has(p.id)).length} marcadas</span>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => marcar(lista.map(p => p.id), true)}>Marcar os da lista</Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => marcar(lista.map(p => p.id), false)}>Desmarcar os da lista</Button>
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => sortearUmPor(p => p.setor)}><Shuffle className="h-3 w-3" /> 1 por setor</Button>
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => sortearUmPor(p => p.equipe)}><Shuffle className="h-3 w-3" /> 1 por equipe</Button>
        </div>
        <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
          {lista.map(p => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-muted/50">
                <input type="checkbox" checked={marcados.has(p.id)} onChange={e => marcar([p.id], e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                {p.foto ? <img src={p.foto} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[10px] font-bold">{p.nome.slice(0, 2).toUpperCase()}</span>}
                <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                <span className="truncate text-[11px] text-muted-foreground">{p.setor}{p.equipe ? ` · ${p.equipe}` : ''}</span>
              </label>
            </li>
          ))}
          {lista.length === 0 && <li className="px-3 py-4 text-center text-xs text-muted-foreground">Ninguém com esses filtros.</li>}
        </ul>
      </div>
      <aside className="space-y-2 rounded-lg border p-3">
        <div><strong className="text-2xl tabular-nums">{escolhidos.length}</strong> <span className="text-xs text-muted-foreground">{rotulo(escolhidos.length)}</span></div>
        <ul className="space-y-1 text-xs">
          {porSetor.map(([s, n]) => <li key={s} className="flex justify-between gap-2"><span className="truncate">{s}</span><span className="tabular-nums text-muted-foreground">{n}</span></li>)}
        </ul>
        {escolhidos.length > 0 && (
          <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
            {escolhidos.map(p => (
              <button key={p.id} type="button" onClick={() => marcar([p.id], false)} title={`Tirar ${p.nome}`}
                className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] hover:bg-destructive/15">
                {p.nome.split(' ')[0]} <X className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
