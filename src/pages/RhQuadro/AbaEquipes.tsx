/**
 * AbaEquipes — o setor em organograma: ele no topo, as equipes penduradas, em
 * cada uma quem lidera e quem faz parte. O modo lista mostra o mesmo em blocos,
 * para quem prefere ler de cima para baixo (e para telas estreitas).
 *
 * Buscar uma pessoa destaca onde ela está e apaga o resto; vir da busca do
 * topo da tela abre o setor dela e a faz piscar.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ChevronsDownUp, ChevronsUpDown, Copy, Crown, GraduationCap, Network, Rows3, Search, Users,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { normalizar, type Equipe, type Pessoa, type Quadro, type SetorQuadro } from '@/services/rh/quadroPessoal';
import { BarraComposicao, CartaoPessoa, Foto, PilhaDeFotos, SeloAlternativo, SeloFerias, SeloNovata } from './partes';
import { GRUPO_META, lugarTexto, plural, rotuloCargo } from './formato';
import { lerPreferencia, salvarPreferencia } from './preferencias';
import './quadro.css';

type Modo = 'organograma' | 'lista';

/** Quantas pessoas cada equipe mostra fechada. */
const LIMITE = 8;

interface Realce {
  busca: string;
  destaque: string | null;
}

function casa(p: Pessoa, r: Realce): boolean {
  return p.id === r.destaque || (!!r.busca && normalizar(p.nome).includes(r.busca));
}

export default function AbaEquipes({
  quadro, setores, setorId, onSetor, destaque,
}: {
  quadro: Quadro;
  /** Os setores do quadro e, no fim, o balde «Sem setor» quando há alguém nele. */
  setores: SetorQuadro[];
  setorId: string | null;
  onSetor: (id: string) => void;
  destaque: string | null;
}) {
  const [busca, setBusca] = useState('');
  // Sem escolha guardada, o celular abre na lista: o organograma é largo.
  const [modo, setModoBruto] = useState<Modo>(() =>
    lerPreferencia('equipes-modo', window.innerWidth < 640 ? 'lista' : 'organograma') as Modo);
  const setModo = (m: Modo) => { setModoBruto(m); salvarPreferencia('equipes-modo', m); };
  const [tudoAberto, setTudoAberto] = useState(false);

  const setor = setores.find(s => s.id === setorId) ?? setores[0] ?? null;
  const buscaNormal = normalizar(busca);
  const realce: Realce = useMemo(() => ({ busca: buscaNormal, destaque }), [buscaNormal, destaque]);

  // Trocar de setor limpa a busca: ela era do setor anterior.
  useEffect(() => { setBusca(''); }, [setor?.id]);

  // Quem veio da busca do topo: rola até a pessoa, depois que o setor desenhou.
  useEffect(() => {
    if (!destaque) return;
    const t = window.setTimeout(() => {
      document.querySelector(`[data-pessoa="${destaque}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 180);
    return () => window.clearTimeout(t);
  }, [destaque, setor?.id, modo]);

  const achados = useMemo(() => {
    if (!setor || !realce.busca) return null;
    const ids = new Set<string>();
    for (const e of setor.equipes) for (const p of [...e.lideres, ...e.membros]) if (casa(p, realce)) ids.add(p.id);
    for (const p of setor.semEquipe) if (casa(p, realce)) ids.add(p.id);
    return ids.size;
  }, [setor, realce]);

  const porCidade = useMemo(() => {
    const grupos: { nome: string; setores: SetorQuadro[] }[] = [];
    for (const s of setores) {
      const nome = s.id === '__sem_setor__' ? 'Sem lugar' : s.cidade.nome;
      const g = grupos.find(x => x.nome === nome);
      if (g) g.setores.push(s); else grupos.push({ nome, setores: [s] });
    }
    return grupos;
  }, [setores]);

  if (!setor) {
    return <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">Nenhum setor no quadro.</p>;
  }

  return (
    <div className="space-y-5">
      {/* Escolha do setor, por cidade */}
      <div className="space-y-2">
        {porCidade.map(g => (
          <div key={g.nome} className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.nome}</span>
            {g.setores.map(s => {
              const ativo = s.id === setor.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSetor(s.id)}
                  aria-pressed={ativo}
                  className={cn(
                    'inline-flex h-8 items-center gap-2 rounded-full border pl-3 pr-1 text-xs font-medium transition',
                    ativo
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-foreground hover:border-primary/40',
                    s.id === '__sem_setor__' && !ativo && 'border-dashed border-warning/50 text-warning',
                  )}
                >
                  {s.nome}
                  {s.alternativo && <Copy className={cn('size-3', ativo ? 'opacity-80' : 'text-info')} aria-label="Setor alternativo" />}
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                    ativo ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
                  )}>
                    {s.numeros.pessoas + s.numeros.clones}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Ferramentas */}
      <div className="flex flex-wrap items-center gap-2 border-y border-border py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder={`Destacar alguém em ${setor.nome}…`}
            className="h-8 w-64 max-w-full pl-8 text-xs"
          />
        </div>
        {achados !== null && (
          <span className={cn('text-xs', achados ? 'text-foreground' : 'text-muted-foreground')}>
            {achados ? plural(achados, 'encontrada', 'encontradas') : 'ninguém com esse nome aqui'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTudoAberto(v => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {tudoAberto ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
            {tudoAberto ? 'Recolher equipes' : 'Mostrar todos'}
          </button>
          <div className="inline-flex rounded-md border border-input p-0.5" role="group" aria-label="Modo de ver">
            {([['organograma', 'Organograma', Network], ['lista', 'Lista', Rows3]] as const).map(([k, r, Icone]) => (
              <button
                key={k}
                type="button"
                onClick={() => setModo(k)}
                aria-pressed={modo === k}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition',
                  modo === k ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icone className="size-3.5" /><span className="hidden sm:inline">{r}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {modo === 'organograma'
        ? <Organograma quadro={quadro} setor={setor} realce={realce} tudoAberto={tudoAberto} />
        : <Lista quadro={quadro} setor={setor} realce={realce} />}
    </div>
  );
}

// ── Organograma ──────────────────────────────────────────────────────────────

function Organograma({
  quadro, setor, realce, tudoAberto,
}: { quadro: Quadro; setor: SetorQuadro; realce: Realce; tudoAberto: boolean }) {
  const lideres = [...new Map(setor.equipes.flatMap(e => e.lideres).map(l => [l.id, l])).values()];
  const temFilhos = setor.equipes.length > 0 || setor.semEquipe.length > 0;

  // Quando a fileira não cabe, abre com o setor no meio da tela — e não no
  // canto esquerdo, onde ele ficaria fora da vista num celular.
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caixa.current;
    if (el && !realce.destaque) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [setor.id]); // eslint-disable-line react-hooks/exhaustive-deps -- só ao trocar de setor

  return (
    <div ref={caixa} className="qp-org overflow-x-auto pb-4">
      <div className="inline-flex min-w-full flex-col items-center px-2 pt-1">
        {/* O setor */}
        <div className={cn(temFilhos && 'qp-org-raiz')}>
          <div className="w-72 rounded-2xl border-2 border-primary/40 bg-card p-4 text-center shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {[quadro.empresas.length > 1 ? setor.empresa : null, setor.cidade.nome, setor.regra].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-0.5 text-xl font-bold tracking-tight text-foreground">{setor.nome}</p>
            {setor.alternativo && <div className="mt-1.5 flex justify-center"><SeloAlternativo grande /></div>}
            <p className="mt-1 text-xs text-muted-foreground">
              {setor.alternativo
                ? <>{plural(setor.numeros.clones, 'clone', 'clones')} de outros setores · {plural(setor.numeros.pessoas, 'do cadastro', 'do cadastro')}</>
                : plural(setor.numeros.pessoas, 'pessoa', 'pessoas')}
              {' · '}{plural(setor.numeros.equipes, 'equipe', 'equipes')}
            </p>
            <BarraComposicao numeros={setor.numeros} className="mt-3" />
            {lideres.length > 0 && (
              <div className="mt-3 flex justify-center"><PilhaDeFotos pessoas={lideres} max={6} tamanho="xs" /></div>
            )}
          </div>
        </div>

        {temFilhos && (
          <ul className="qp-org-filhos">
            {setor.equipes.map(e => (
              <li key={e.id}>
                <NoEquipe quadro={quadro} equipe={e} realce={realce} tudoAberto={tudoAberto} alternativo={setor.alternativo} />
              </li>
            ))}
            {setor.semEquipe.length > 0 && (
              <li>
                <NoSemEquipe quadro={quadro} pessoas={setor.semEquipe} realce={realce} tudoAberto={tudoAberto} balde={setor.id === '__sem_setor__'} />
              </li>
            )}
          </ul>
        )}
        {!temFilhos && (
          <p className="mt-6 text-sm text-muted-foreground">Este setor não tem equipe nem gente hoje.</p>
        )}
      </div>
    </div>
  );
}

function LinhaPessoa({
  quadro, pessoa, realce, mostrarOrigem,
}: { quadro: Quadro; pessoa: Pessoa; realce: Realce; mostrarOrigem?: boolean }) {
  const achado = casa(pessoa, realce);
  /** No clone, o setor do cadastro: «de Play 4». */
  const origem = mostrarOrigem ? lugarTexto(quadro, pessoa).setor : null;
  const apagado = !!realce.busca && !achado;
  return (
    <CartaoPessoa pessoa={pessoa} lugar={lugarTexto(quadro, pessoa)}>
      <button
        type="button"
        data-pessoa={pessoa.id}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-muted',
          achado && 'bg-primary/10 ring-1 ring-primary/40',
          pessoa.id === realce.destaque && 'qp-achado',
          apagado && 'opacity-35',
        )}
      >
        <Foto pessoa={pessoa} tamanho="xs" />
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
          {pessoa.nome}
          {origem && <span className="block truncate text-[10px] text-info">de {origem}</span>}
        </span>
        {pessoa.grupo !== 'operador' && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{GRUPO_META[pessoa.grupo].um}</span>
        )}
        <SeloFerias pessoa={pessoa} compacto />
      </button>
    </CartaoPessoa>
  );
}

function ListaLimitada({
  quadro, pessoas, realce, aberto, mostrarOrigem,
}: { quadro: Quadro; pessoas: Pessoa[]; realce: Realce; aberto: boolean; mostrarOrigem?: boolean }) {
  const [mais, setMais] = useState(false);
  const temAchado = pessoas.some(p => casa(p, realce));
  const tudo = aberto || mais || temAchado || pessoas.length <= LIMITE + 1;
  const vis = tudo ? pessoas : pessoas.slice(0, LIMITE);
  return (
    <div className="space-y-0.5">
      {vis.map(p => <LinhaPessoa key={p.id} quadro={quadro} pessoa={p} realce={realce} mostrarOrigem={mostrarOrigem} />)}
      {!tudo && (
        <button
          type="button"
          onClick={() => setMais(true)}
          className="mt-1 w-full rounded-md py-1 text-center text-[11px] font-medium text-primary hover:bg-primary/10"
        >
          + {plural(pessoas.length - LIMITE, 'pessoa', 'pessoas')}
        </button>
      )}
    </div>
  );
}

function NoEquipe({
  quadro, equipe, realce, tudoAberto, alternativo,
}: { quadro: Quadro; equipe: Equipe; realce: Realce; tudoAberto: boolean; alternativo: boolean }) {
  const temAchado = [...equipe.lideres, ...equipe.membros, ...(alternativo ? equipe.apoio : [])].some(p => casa(p, realce));
  const apagada = !!realce.busca && !temAchado;
  return (
    <article
      className={cn(
        'w-64 rounded-xl border border-border bg-card shadow-sm transition',
        temAchado && 'border-primary/60 shadow-md',
        apagada && 'opacity-60',
      )}
    >
      <header className="flex items-start gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground" title={equipe.nome}>{equipe.nome}</p>
          <p className="text-[11px] text-muted-foreground">
            {plural(equipe.membros.length, 'pessoa', 'pessoas')}
            {equipe.subgrupos.length > 0 && ` · ${plural(equipe.subgrupos.length, 'subgrupo', 'subgrupos')}`}
          </p>
        </div>
        {equipe.treinamento && (
          <span title="Equipe de treinamento" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
            <GraduationCap className="size-3" /> Treino
          </span>
        )}
      </header>

      <div className="space-y-1.5 px-2 pt-2">
        {equipe.lideres.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-2 py-1.5 text-center text-[11px] italic text-muted-foreground">Sem líder registrado</p>
        )}
        {equipe.lideres.map(l => {
          const achado = casa(l, realce);
          return (
            <CartaoPessoa key={l.id} pessoa={l} lugar={lugarTexto(quadro, l)}>
              <button
                type="button"
                data-pessoa={l.id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg bg-info/10 p-1.5 text-left transition hover:bg-info/15',
                  achado && 'ring-2 ring-primary/50',
                  l.id === realce.destaque && 'qp-achado',
                  !!realce.busca && !achado && 'opacity-40',
                )}
              >
                <Foto pessoa={l} className="ring-info/40" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">{l.nome}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-info"><Crown className="size-2.5" /> Líder</span>
                </span>
                <SeloFerias pessoa={l} compacto />
              </button>
            </CartaoPessoa>
          );
        })}
      </div>

      <div className="space-y-2 p-2">
        {equipe.subgrupos.map(sg => (
          <div key={sg.id} className="rounded-lg border border-border/70 bg-muted/30 p-1.5">
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {sg.nome} · {sg.membros.length}
            </p>
            {sg.membros.length
              ? <ListaLimitada quadro={quadro} pessoas={sg.membros} realce={realce} aberto={tudoAberto} />
              : <p className="px-1 text-[11px] text-muted-foreground">Ninguém neste subgrupo.</p>}
          </div>
        ))}
        {equipe.semSubgrupo.length > 0 && (
          <ListaLimitada quadro={quadro} pessoas={equipe.semSubgrupo} realce={realce} aberto={tudoAberto} />
        )}
        {equipe.membros.length === 0 && !(alternativo && equipe.apoio.length > 0) && (
          <p className="px-1 py-2 text-center text-[11px] text-muted-foreground">Equipe sem ninguém hoje.</p>
        )}
        {/* Alternativo: os clones SÃO a equipe — lista inteira, com a origem de cada um. */}
        {alternativo && equipe.apoio.length > 0 && (
          <div className="rounded-lg border border-info/30 bg-info/5 p-1.5">
            <p className="flex items-center gap-1 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-info">
              <Copy className="size-3" /> Clones de outros setores · {equipe.apoio.length}
            </p>
            <ListaLimitada quadro={quadro} pessoas={equipe.apoio} realce={realce} aberto={tudoAberto} mostrarOrigem />
          </div>
        )}
        {!alternativo && equipe.apoio.length > 0 && (
          <div className="flex items-center gap-2 border-t border-border px-1 pt-2" title={equipe.apoio.map(p => p.nome).join(', ')}>
            <span className="text-[10px] text-muted-foreground">Também contam aqui</span>
            <PilhaDeFotos pessoas={equipe.apoio} max={4} tamanho="xs" />
          </div>
        )}
      </div>
    </article>
  );
}

function NoSemEquipe({
  quadro, pessoas, realce, tudoAberto, balde,
}: { quadro: Quadro; pessoas: Pessoa[]; realce: Realce; tudoAberto: boolean; balde: boolean }) {
  return (
    <article className="w-64 rounded-xl border border-dashed border-warning/60 bg-warning/5">
      <header className="flex items-center gap-2 border-b border-dashed border-warning/40 px-3 py-2.5">
        <AlertTriangle className="size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{balde ? 'Sem setor' : 'Sem equipe'}</p>
          <p className="text-[11px] text-muted-foreground">{plural(pessoas.length, 'pessoa', 'pessoas')}</p>
        </div>
      </header>
      <div className="p-2">
        <ListaLimitada quadro={quadro} pessoas={pessoas} realce={realce} aberto={tudoAberto} />
      </div>
    </article>
  );
}

// ── Lista ────────────────────────────────────────────────────────────────────

function Lista({ quadro, setor, realce }: { quadro: Quadro; setor: SetorQuadro; realce: Realce }) {
  const blocos: { chave: string; titulo: string; lideres: Pessoa[]; pessoas: Pessoa[]; alerta?: boolean; treinamento?: boolean }[] = [
    ...setor.equipes.map(e => ({ chave: e.id, titulo: e.nome, lideres: e.lideres, pessoas: e.membros, treinamento: e.treinamento })),
    ...(setor.semEquipe.length
      ? [{ chave: 'sem', titulo: setor.id === '__sem_setor__' ? 'Sem setor' : 'Sem equipe', lideres: [], pessoas: setor.semEquipe, alerta: true }]
      : []),
  ];
  return (
    <div className="space-y-3">
      {blocos.map(b => (
        <section key={b.chave} className={cn('rounded-xl border bg-card', b.alerta ? 'border-dashed border-warning/60' : 'border-border')}>
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
            <h4 className="text-sm font-semibold text-foreground">{b.titulo}</h4>
            {b.treinamento && <span className="rounded-full bg-warning/15 px-1.5 text-[10px] font-semibold text-warning">Treinamento</span>}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Users className="size-3.5" />{b.pessoas.length}</span>
            {b.lideres.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Crown className="size-3.5 text-info" />
                {b.lideres.map(l => l.nome).join(', ')}
              </span>
            )}
          </header>
          <div className="grid gap-1 p-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,14rem),1fr))]">
            {[...b.lideres, ...b.pessoas].map(p => {
              const achado = casa(p, realce);
              const lider = b.lideres.some(l => l.id === p.id);
              return (
                <CartaoPessoa key={p.id} pessoa={p} lugar={lugarTexto(quadro, p)}>
                  <button
                    type="button"
                    data-pessoa={p.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-muted',
                      lider && 'bg-info/10',
                      achado && 'bg-primary/10 ring-1 ring-primary/40',
                      p.id === realce.destaque && 'qp-achado',
                      !!realce.busca && !achado && 'opacity-35',
                    )}
                  >
                    <Foto pessoa={p} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">{p.nome}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{lider ? 'Líder' : rotuloCargo(p.cargo)}</span>
                    </span>
                    <SeloNovata pessoa={p} />
                    <SeloFerias pessoa={p} compacto />
                  </button>
                </CartaoPessoa>
              );
            })}
            {b.pessoas.length === 0 && b.lideres.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">Ninguém aqui hoje.</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
