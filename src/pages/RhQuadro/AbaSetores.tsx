/**
 * AbaSetores — os setores como o RH os lê: por cidade, com o tamanho de cada
 * um, a composição por cargo e quem lidera. Clicar abre a gaveta do setor.
 *
 * Dois jeitos de ver a mesma coisa: cartões (para passear) e tabela (para
 * comparar números lado a lado). A escolha fica guardada no navegador.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, ArrowUpDown, ChevronRight, Crown, HeartPulse, IdCard, LayoutGrid, Rows3, Search, Sun, UsersRound,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Cidade, Numeros, Quadro, SetorQuadro } from '@/services/rh/quadroPessoal';
import { GRUPOS_CARGO, normalizar } from '@/services/rh/quadroPessoal';
import { BarraComposicao, PilhaDeFotos, SeloAlternativo } from './partes';
import { GRUPO_META, plural } from './formato';
import { lerPreferencia, salvarPreferencia } from './preferencias';
import { SeletorFiltro } from './SeletorFiltro';

type Ordem = 'sistema' | 'pessoas' | 'nome';
type Modo = 'cartoes' | 'tabela';

const ORDENS: { k: Ordem; rotulo: string }[] = [
  { k: 'sistema', rotulo: 'Ordem do sistema' },
  { k: 'pessoas', rotulo: 'Mais pessoas' },
  { k: 'nome', rotulo: 'Nome' },
];

function somar(setores: readonly SetorQuadro[]): Numeros {
  const n: Numeros = {
    pessoas: 0,
    porGrupo: { operador: 0, lider: 0, elite: 0, gerencia: 0, diretoria: 0, outros: 0 },
    equipes: 0, lideres: 0, semEquipe: 0, emFerias: 0, afastados: 0, novatos: 0, semCracha: 0, clones: 0,
  };
  for (const s of setores) {
    n.pessoas += s.numeros.pessoas;
    n.equipes += s.numeros.equipes;
    n.lideres += s.numeros.lideres;
    n.semEquipe += s.numeros.semEquipe;
    n.emFerias += s.numeros.emFerias;
    n.afastados += s.numeros.afastados;
    n.novatos += s.numeros.novatos;
    n.semCracha += s.numeros.semCracha;
    n.clones += s.numeros.clones;
    for (const g of Object.keys(n.porGrupo) as (keyof Numeros['porGrupo'])[]) n.porGrupo[g] += s.numeros.porGrupo[g];
  }
  return n;
}

function SeloMarca({ cidade }: { cidade: Cidade }) {
  if (!cidade.marca) return null;
  return (
    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {cidade.marca}
    </span>
  );
}

export default function AbaSetores({
  quadro, semSetor, onAbrir,
}: {
  quadro: Quadro;
  /** O balde «Sem setor», quando há alguém nele. */
  semSetor: SetorQuadro | null;
  onAbrir: (setorId: string) => void;
}) {
  const [ordem, setOrdem] = useState<Ordem>('sistema');
  const [busca, setBusca] = useState('');
  const [modo, setModoBruto] = useState<Modo>(() => lerPreferencia('setores-modo', 'cartoes') as Modo);
  const setModo = (m: Modo) => { setModoBruto(m); salvarPreferencia('setores-modo', m); };

  const filtrados = useMemo(() => {
    const b = normalizar(busca);
    // A cidade já vem recortada pelo topo do Quadro; aqui só a busca.
    let lista = quadro.setores.filter(s => !b || normalizar(s.nome).includes(b));
    if (ordem === 'pessoas') lista = [...lista].sort((a, z) => z.numeros.pessoas - a.numeros.pessoas);
    if (ordem === 'nome') lista = [...lista].sort((a, z) => a.nome.localeCompare(z.nome, 'pt-BR'));
    return lista;
  }, [quadro.setores, ordem, busca]);

  const grupos = useMemo(() => quadro.cidades
    .map(c => ({ cidade: c, setores: filtrados.filter(s => s.cidade.chave === c.chave) }))
    .filter(g => g.setores.length > 0), [quadro.cidades, filtrados]);

  const mostrarSemSetor = !!semSetor && !busca;

  return (
    <div className="space-y-5">
      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {plural(filtrados.length, 'setor', 'setores')}{busca && ' com esse nome'}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar setor pelo nome…"
              className="h-8 w-52 pl-8 text-xs"
            />
          </div>
          <SeletorFiltro
            valor={ordem}
            onTrocar={v => setOrdem((v ?? 'sistema') as Ordem)}
            Icone={ArrowUpDown}
            rotulo="Ordenar setores"
            rotuloTodos="Ordem do sistema"
            semTodos
            largura="w-56"
            className="h-8 text-xs"
            opcoes={ORDENS.map(o => ({ valor: o.k, rotulo: o.rotulo }))}
          />
          <div className="inline-flex rounded-md border border-input p-0.5" role="group" aria-label="Modo de ver">
            <BotaoModo ativo={modo === 'cartoes'} onClick={() => setModo('cartoes')} rotulo="Cartões"><LayoutGrid className="size-3.5" /></BotaoModo>
            <BotaoModo ativo={modo === 'tabela'} onClick={() => setModo('tabela')} rotulo="Tabela"><Rows3 className="size-3.5" /></BotaoModo>
          </div>
        </div>
      </div>

      {grupos.length === 0 && !mostrarSemSetor && (
        <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Nenhum setor com esse filtro.
        </p>
      )}

      {modo === 'tabela' ? (
        <TabelaSetores setores={filtrados} semSetor={mostrarSemSetor ? semSetor : null} onAbrir={onAbrir} />
      ) : (
        <>
          {grupos.map(g => {
            const tot = somar(g.setores);
            return (
              <section key={g.cidade.chave} className="space-y-3">
                <header className="flex flex-wrap items-end gap-x-3 gap-y-1">
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">{g.cidade.nome}</h3>
                  <SeloMarca cidade={g.cidade} />
                  <p className="text-sm text-foreground/75">
                    {plural(g.setores.length, 'setor', 'setores')} · {plural(tot.pessoas, 'pessoa', 'pessoas')} · {plural(tot.equipes, 'equipe', 'equipes')}
                  </p>
                </header>
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
                  {g.setores.map((s, i) => (
                    <CartaoSetor key={s.id} setor={s} indice={i} varias={quadro.empresas.length > 1} onAbrir={() => onAbrir(s.id)} />
                  ))}
                </div>
              </section>
            );
          })}
          {mostrarSemSetor && semSetor && (
            <section className="space-y-3">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">Sem lugar no quadro</h3>
              <button
                type="button"
                onClick={() => onAbrir(semSetor.id)}
                className="group flex w-full max-w-md items-center gap-4 rounded-xl border border-dashed border-warning/50 bg-warning/5 p-4 text-left transition hover:border-warning hover:bg-warning/10"
              >
                <AlertTriangle className="size-6 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{plural(semSetor.numeros.pessoas, 'pessoa sem setor', 'pessoas sem setor')}</p>
                  <p className="text-xs text-muted-foreground">Sem setor no cadastro, ou num setor desativado.</p>
                </div>
                <PilhaDeFotos pessoas={semSetor.pessoas} max={4} />
                <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function BotaoModo({ ativo, onClick, rotulo, children }: { ativo: boolean; onClick: () => void; rotulo: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={rotulo}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition',
        ativo ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}<span className="hidden sm:inline">{rotulo}</span>
    </button>
  );
}

function CartaoSetor({
  setor, indice, varias, onAbrir,
}: { setor: SetorQuadro; indice: number; varias: boolean; onAbrir: () => void }) {
  const n = setor.numeros;
  const lideres = [...new Map(setor.equipes.flatMap(e => e.lideres).map(l => [l.id, l])).values()];
  const composicao = GRUPOS_CARGO.filter(g => n.porGrupo[g] > 0);
  const primeiros = (nomes: string[], max: number) =>
    nomes.length <= max ? nomes.join(', ') : `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`;

  return (
    <motion.button
      type="button"
      onClick={onAbrir}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(indice, 12) * 0.03 }}
      className={cn(
        'group flex flex-col rounded-xl border border-border bg-card p-4 text-left shadow-sm',
        'transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {varias && setor.empresa && (
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{setor.empresa}</p>
          )}
          <p className="truncate font-semibold text-foreground" title={setor.nome}>{setor.nome}</p>
          {setor.descricao && <p className="truncate text-xs text-muted-foreground" title={setor.descricao}>{setor.descricao}</p>}
        </div>
        {setor.regra && (
          <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
            {setor.regra}
          </span>
        )}
        {setor.nucleo && (
          <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">Núcleo</span>
        )}
        {setor.alternativo && <SeloAlternativo />}
      </div>

      {setor.alternativo ? (
        <>
          <p className="mt-4 leading-none">
            <span className="text-4xl font-bold tabular-nums tracking-tight text-foreground">{n.clones}</span>
            <span className="ml-1.5 text-sm font-medium text-foreground/80">{n.clones === 1 ? 'clone' : 'clones'}</span>
            {n.pessoas > 0 && (
              <span className="ml-2 text-sm text-foreground/70">+ {plural(n.pessoas, 'do cadastro', 'do cadastro')}</span>
            )}
          </p>
          <p className="mt-2 rounded-lg bg-info/10 px-2.5 py-1.5 text-xs text-foreground/80">
            Operadores de outros setores replicados aqui. O cadastro (e o dinheiro) de cada um fica no setor de origem.
          </p>
        </>
      ) : (
        <p className="mt-4 leading-none">
          <span className="text-4xl font-bold tabular-nums tracking-tight text-foreground">{n.pessoas}</span>
          <span className="ml-1.5 text-sm font-medium text-foreground/80">{n.pessoas === 1 ? 'pessoa' : 'pessoas'}</span>
        </p>
      )}
      {n.pessoas > 0 && <BarraComposicao numeros={n} className="mt-3" alta />}
      {/* A barra em palavras: quanto de cada cargo, sem precisar passar o mouse. */}
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground">
        {composicao.map(g => (
          <li key={g} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', GRUPO_META[g].cor)} />
            <strong className="font-semibold tabular-nums">{n.porGrupo[g]}</strong>
            <span className="text-foreground/75">{(n.porGrupo[g] === 1 ? GRUPO_META[g].um : GRUPO_META[g].rotulo).toLowerCase()}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border text-center">
        <Dado Icone={UsersRound} valor={n.equipes} rotulo={n.equipes === 1 ? 'equipe' : 'equipes'} />
        <Dado Icone={Crown} valor={n.lideres} rotulo={n.lideres === 1 ? 'líder' : 'líderes'} />
        <Dado Icone={AlertTriangle} valor={n.semEquipe} rotulo="sem equipe" alerta={n.semEquipe > 0} />
      </div>
      {(n.emFerias > 0 || n.afastados > 0 || n.semCracha > 0) && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-foreground/80">
          {n.emFerias > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Sun className="size-3.5 text-warning" /> {plural(n.emFerias, 'de férias', 'de férias')}
            </span>
          )}
          {n.afastados > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <HeartPulse className="size-3.5 text-warning" /> {plural(n.afastados, 'afastado', 'afastados')}
            </span>
          )}
          {n.semCracha > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <IdCard className="size-3.5 text-muted-foreground" /> {plural(n.semCracha, 'sem crachá', 'sem crachá')}
            </span>
          )}
        </div>
      )}

      <div className="min-h-4 flex-1" />
      <div className="flex items-center gap-2.5 border-t border-border pt-3">
        {lideres.length > 0 ? (
          <>
            <PilhaDeFotos pessoas={lideres} max={4} tamanho="xs" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground/80" title={lideres.map(l => l.nome).join(', ')}>
              {primeiros(lideres.map(l => l.nome.split(' ')[0]), 3)}
            </span>
          </>
        ) : (
          <span className="flex-1 text-xs italic text-foreground/60">Sem líder registrado</span>
        )}
        <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary">
          Abrir <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </motion.button>
  );
}

type Coluna = 'nome' | 'cidade' | 'equipes' | 'pessoas' | 'operador' | 'lider' | 'elite' | 'gerencia' | 'semEquipe' | 'emFerias';

const COLUNAS: { k: Coluna; rotulo: string; num?: boolean }[] = [
  { k: 'nome', rotulo: 'Setor' },
  { k: 'cidade', rotulo: 'Cidade' },
  { k: 'equipes', rotulo: 'Equipes', num: true },
  { k: 'pessoas', rotulo: 'Pessoas', num: true },
  { k: 'operador', rotulo: 'Operadores', num: true },
  { k: 'lider', rotulo: 'Líderes', num: true },
  { k: 'elite', rotulo: 'Elite', num: true },
  { k: 'gerencia', rotulo: 'Gerência', num: true },
  { k: 'semEquipe', rotulo: 'Sem equipe', num: true },
  { k: 'emFerias', rotulo: 'Férias', num: true },
];

function valor(s: SetorQuadro, k: Coluna): string | number {
  switch (k) {
    case 'nome': return s.nome;
    case 'cidade': return s.empresa ? `${s.cidade.nome} · ${s.empresa}` : s.cidade.nome;
    case 'equipes': case 'pessoas': case 'semEquipe': case 'emFerias': return s.numeros[k];
    default: return s.numeros.porGrupo[k];
  }
}

function TabelaSetores({
  setores, semSetor, onAbrir,
}: { setores: SetorQuadro[]; semSetor: SetorQuadro | null; onAbrir: (id: string) => void }) {
  const [col, setCol] = useState<Coluna | null>(null);
  const [desc, setDesc] = useState(true);
  const linhas = useMemo(() => {
    if (!col) return setores;
    return [...setores].sort((a, b) => {
      const va = valor(a, col), vb = valor(b, col);
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return desc ? -r : r;
    });
  }, [setores, col, desc]);
  const tot = somar(setores);

  const ordenar = (k: Coluna) => {
    if (col === k) setDesc(d => !d);
    else { setCol(k); setDesc(COLUNAS.find(c => c.k === k)?.num ?? false); }
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            {COLUNAS.map(c => (
              <th key={c.k} className={cn('px-3 py-2 font-medium', c.num ? 'text-right' : 'text-left')}>
                <button type="button" onClick={() => ordenar(c.k)} className="inline-flex items-center gap-1 hover:text-foreground">
                  {c.rotulo}
                  {col === c.k && <span aria-hidden>{desc ? '↓' : '↑'}</span>}
                </button>
              </th>
            ))}
            <th className="px-3 py-2 text-left font-medium">Composição</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(s => (
            <tr key={s.id} onClick={() => onAbrir(s.id)} className="cursor-pointer border-b border-border/60 transition hover:bg-primary/5">
              {COLUNAS.map(c => {
                const v = valor(s, c.k);
                return (
                  <td key={c.k} className={cn('px-3 py-2', c.num ? 'text-right tabular-nums' : '', c.k === 'nome' && 'font-medium text-foreground',
                    c.k === 'semEquipe' && Number(v) > 0 && 'font-semibold text-warning',
                    c.num && v === 0 && 'text-muted-foreground/50')}>
                    {v}
                  </td>
                );
              })}
              <td className="px-3 py-2"><BarraComposicao numeros={s.numeros} className="w-28" /></td>
            </tr>
          ))}
          {semSetor && (
            <tr onClick={() => onAbrir(semSetor.id)} className="cursor-pointer border-b border-border/60 bg-warning/5 transition hover:bg-warning/10">
              <td className="px-3 py-2 font-medium text-warning">Sem setor</td>
              <td className="px-3 py-2 text-muted-foreground">—</td>
              <td className="px-3 py-2 text-right text-muted-foreground/50">0</td>
              <td className="px-3 py-2 text-right tabular-nums">{semSetor.numeros.pessoas}</td>
              <td colSpan={7} />
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 text-xs font-semibold text-foreground">
            <td className="px-3 py-2">Total</td>
            <td />
            <td className="px-3 py-2 text-right tabular-nums">{tot.equipes}</td>
            <td className="px-3 py-2 text-right tabular-nums">{tot.pessoas}</td>
            <td className="px-3 py-2 text-right tabular-nums">{tot.porGrupo.operador}</td>
            <td className="px-3 py-2 text-right tabular-nums">{tot.porGrupo.lider}</td>
            <td className="px-3 py-2 text-right tabular-nums">{tot.porGrupo.elite}</td>
            <td className="px-3 py-2 text-right tabular-nums">{tot.porGrupo.gerencia}</td>
            <td className="px-3 py-2 text-right tabular-nums">{tot.semEquipe}</td>
            <td className="px-3 py-2 text-right tabular-nums">{tot.emFerias}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Dado({
  Icone, valor, rotulo, alerta,
}: { Icone: typeof Crown; valor: number; rotulo: string; alerta?: boolean }) {
  return (
    <div className={cn('px-1 py-2', alerta && 'bg-warning/10')}>
      <p className={cn('inline-flex items-center gap-1 text-lg font-bold tabular-nums leading-none', alerta ? 'text-warning' : 'text-foreground')}>
        <Icone className="size-3.5 opacity-70" />{valor}
      </p>
      <p className={cn('mt-1 text-[11px] font-medium', alerta ? 'text-warning' : 'text-foreground/70')}>{rotulo}</p>
    </div>
  );
}
