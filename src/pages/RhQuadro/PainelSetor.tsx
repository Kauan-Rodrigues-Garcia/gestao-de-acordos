/**
 * PainelSetor — o setor aberto, na própria tela e em largura inteira.
 *
 * Substituiu a gaveta lateral em 20/10/2026: «abre de lado, é ruim e não
 * informativo». A gaveta escurecia o quadro atrás e espremia tudo numa coluna
 * de 36rem. Aqui o setor ganha a tela: números grandes, a composição por cargo
 * em barras com quantidade e porcentagem, as equipes comparadas pelo tamanho e
 * a tabela inteira das pessoas, que se filtra clicando numa equipe ou cargo.
 *
 * Só leitura, como o resto do Quadro.
 */
import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowUpDown, Crown, Download, GraduationCap, Network, Search,
  Sparkles, Sun, Users, UsersRound, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  GRUPOS_CARGO, normalizar, type GrupoCargo, type Pessoa, type Quadro, type SetorQuadro,
} from '@/services/rh/quadroPessoal';
import { Foto, PilhaDeFotos } from './partes';
import { GRUPO_META, dataCurta, lugarTexto, plural, rotuloCargo } from './formato';

/** Filtro de equipe da tabela: id da equipe, `SEM` (sem equipe) ou `null` (todas). */
const SEM = '__sem__';

type Coluna = 'nome' | 'cargo' | 'equipe' | 'desde';

export default function PainelSetor({
  quadro, setor, onVoltar, onVerOrganograma, onExportar,
}: {
  quadro: Quadro;
  setor: SetorQuadro;
  onVoltar: () => void;
  onVerOrganograma: (setorId: string) => void;
  onExportar: (setor: SetorQuadro) => void;
}) {
  const n = setor.numeros;
  const ehBalde = setor.id === '__sem_setor__';
  const [grupo, setGrupo] = useState<GrupoCargo | null>(null);
  const [equipe, setEquipe] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [coluna, setColuna] = useState<Coluna>('nome');
  const [desc, setDesc] = useState(false);
  const tabela = useRef<HTMLElement>(null);

  const lideresDoSetor = useMemo(
    () => [...new Map(setor.equipes.flatMap(e => e.lideres).map(l => [l.id, l])).values()],
    [setor.equipes],
  );
  const maiorEquipe = Math.max(1, ...setor.equipes.map(e => e.membros.length), setor.semEquipe.length);

  /** Cada pessoa com o lugar dela já resolvido, para a tabela filtrar e ordenar. */
  const linhas = useMemo(() => setor.pessoas.map(p => {
    const lugar = lugarTexto(quadro, p);
    const eq = setor.equipes.find(e => e.id === quadro.local.get(p.id)?.equipeId) ?? null;
    return { p, lugar, equipeId: eq?.id ?? null, lider: !!eq?.lideres.some(l => l.id === p.id) };
  }), [quadro, setor]);

  const visiveis = useMemo(() => {
    const b = normalizar(busca);
    const lista = linhas.filter(l =>
      (grupo === null || l.p.grupo === grupo)
      && (equipe === null || (equipe === SEM ? !l.equipeId : l.equipeId === equipe))
      && (!b || normalizar(l.p.nome).includes(b) || normalizar(l.p.email).includes(b)));
    const valor = (l: typeof lista[number]): string => {
      switch (coluna) {
        case 'cargo': return `${GRUPOS_CARGO.indexOf(l.p.grupo)}${rotuloCargo(l.p.cargo)}`;
        case 'equipe': return l.lugar.equipe ?? '';
        case 'desde': return l.p.criadoEm ?? '';
        default: return l.p.nome;
      }
    };
    return [...lista].sort((a, z) => {
      const r = valor(a).localeCompare(valor(z), 'pt-BR') || a.p.nome.localeCompare(z.p.nome, 'pt-BR');
      return desc ? -r : r;
    });
  }, [linhas, grupo, equipe, busca, coluna, desc]);

  const filtrar = (f: { grupo?: GrupoCargo | null; equipe?: string | null }) => {
    if ('grupo' in f) setGrupo(f.grupo ?? null);
    if ('equipe' in f) setEquipe(f.equipe ?? null);
    tabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const ordenar = (c: Coluna) => {
    if (coluna === c) setDesc(d => !d); else { setColuna(c); setDesc(c === 'desde'); }
  };
  const nomeDaEquipe = equipe === SEM ? 'Sem equipe' : setor.equipes.find(e => e.id === equipe)?.nome;

  return (
    <div className="space-y-6">
      {/* Volta */}
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Todos os setores
      </button>

      {/* Cabeçalho do setor */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {/* A marca costuma ser o próprio nome da empresa: não repete. */}
              {[...new Set([setor.empresa, setor.cidade.nome, setor.cidade.marca].filter(Boolean))].join(' · ')}
            </p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-foreground">{setor.nome}</h2>
            {(setor.descricao || ehBalde) && (
              <p className="mt-1 text-sm text-foreground/80">
                {ehBalde ? 'Pessoas sem setor no cadastro, ou num setor que foi desativado.' : setor.descricao}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {setor.regra && <Etiqueta>Regra {setor.regra}</Etiqueta>}
              {setor.nucleo && <Etiqueta>Núcleo</Etiqueta>}
              {lideresDoSetor.length > 0 && (
                <span className="inline-flex items-center gap-2 text-sm text-foreground">
                  <PilhaDeFotos pessoas={lideresDoSetor} max={6} />
                  <span>{plural(lideresDoSetor.length, 'líder', 'líderes')}</span>
                </span>
              )}
            </div>
          </div>
          {!ehBalde && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-1.5" onClick={() => onVerOrganograma(setor.id)}>
                <Network className="size-4" /> Ver organograma
              </Button>
              <Button variant="outline" className="gap-1.5" onClick={() => onExportar(setor)}>
                <Download className="size-4" /> Exportar este setor
              </Button>
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Numero Icone={Users} valor={n.pessoas} rotulo="Pessoas" destaque />
          <Numero Icone={UsersRound} valor={n.equipes} rotulo="Equipes" />
          <Numero Icone={Crown} valor={n.lideres} rotulo="Líderes" />
          <Numero
            Icone={AlertTriangle} valor={n.semEquipe} rotulo="Sem equipe"
            tom={n.semEquipe > 0 && !ehBalde ? 'warning' : undefined}
            onClick={n.semEquipe > 0 && !ehBalde ? () => filtrar({ equipe: SEM, grupo: null }) : undefined}
          />
          <Numero Icone={Sun} valor={n.emFerias} rotulo="De férias" />
          <Numero Icone={Sparkles} valor={n.novatos} rotulo="Novos (30 dias)" tom={n.novatos > 0 ? 'success' : undefined} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Composição */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold text-foreground">Quem forma o setor</h3>
          <p className="text-sm text-muted-foreground">Pessoas por cargo. Clique para ver só elas na tabela.</p>
          <ul className="mt-4 space-y-3">
            {GRUPOS_CARGO.filter(g => n.porGrupo[g] > 0).map(g => {
              const qtd = n.porGrupo[g];
              const pct = n.pessoas ? Math.round((qtd / n.pessoas) * 100) : 0;
              const ativo = grupo === g;
              return (
                <li key={g}>
                  <button
                    type="button"
                    onClick={() => filtrar({ grupo: ativo ? null : g })}
                    aria-pressed={ativo}
                    className={cn('w-full rounded-lg p-2 text-left transition hover:bg-muted', ativo && 'bg-primary/10 ring-1 ring-primary/40')}
                  >
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="inline-flex items-center gap-2 font-medium text-foreground">
                        <span className={cn('size-2.5 rounded-full', GRUPO_META[g].cor)} />{GRUPO_META[g].rotulo}
                      </span>
                      <span className="tabular-nums text-foreground">
                        <strong className="font-semibold">{qtd}</strong>
                        <span className="ml-1.5 text-muted-foreground">{pct}%</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn('h-full rounded-full transition-[width] duration-500', GRUPO_META[g].cor)} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                </li>
              );
            })}
            {n.pessoas === 0 && <li className="text-sm text-muted-foreground">Ninguém neste setor hoje.</li>}
          </ul>
        </section>

        {/* Equipes */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold text-foreground">Equipes</h3>
          <p className="text-sm text-muted-foreground">
            {setor.equipes.length
              ? 'Do maior para o menor time. Clique numa equipe para ver quem está nela.'
              : 'Este setor não tem equipe cadastrada.'}
          </p>
          <ul className="mt-4 space-y-1.5">
            {[...setor.equipes].sort((a, b) => b.membros.length - a.membros.length).map(e => {
              const ativo = equipe === e.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => filtrar({ equipe: ativo ? null : e.id })}
                    aria-pressed={ativo}
                    className={cn('grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg p-2.5 text-left transition hover:bg-muted', ativo && 'bg-primary/10 ring-1 ring-primary/40')}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="truncate">{e.nome}</span>
                        {e.treinamento && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-1.5 text-[11px] font-semibold text-warning">
                            <GraduationCap className="size-3" /> Treinamento
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-foreground/75">
                        {e.lideres.length ? <>Líder: {e.lideres.map(l => l.nome).join(', ')}</> : 'Sem líder registrado'}
                        {e.subgrupos.length > 0 && ` · ${e.subgrupos.map(sg => `${sg.nome} (${sg.membros.length})`).join(', ')}`}
                      </span>
                    </span>
                    <span className="text-right text-lg font-bold tabular-nums text-foreground">{e.membros.length}</span>
                    <span className="col-span-2 h-2 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary/80" style={{ width: `${(e.membros.length / maiorEquipe) * 100}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
            {setor.semEquipe.length > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => filtrar({ equipe: equipe === SEM ? null : SEM })}
                  aria-pressed={equipe === SEM}
                  className={cn('grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg border border-dashed border-warning/50 p-2.5 text-left transition hover:bg-warning/10', equipe === SEM && 'bg-warning/10')}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-warning">
                    <AlertTriangle className="size-4" /> {ehBalde ? 'Sem setor' : 'Sem equipe'}
                  </span>
                  <span className="text-right text-lg font-bold tabular-nums text-foreground">{setor.semEquipe.length}</span>
                  <span className="col-span-2 h-2 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-warning" style={{ width: `${(setor.semEquipe.length / maiorEquipe) * 100}%` }} />
                  </span>
                </button>
              </li>
            )}
          </ul>
        </section>
      </div>

      {/* Pessoas */}
      <section ref={tabela} className="scroll-mt-4 rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex flex-wrap items-center gap-3 border-b border-border p-4 md:px-5">
          <div>
            <h3 className="text-base font-semibold text-foreground">Pessoas do setor</h3>
            <p className="text-sm text-muted-foreground">
              {visiveis.length === linhas.length
                ? plural(linhas.length, 'pessoa', 'pessoas')
                : `${visiveis.length} de ${linhas.length}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {grupo && <Filtro onTirar={() => setGrupo(null)}>{GRUPO_META[grupo].rotulo}</Filtro>}
            {equipe && <Filtro onTirar={() => setEquipe(null)}>{nomeDaEquipe}</Filtro>}
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou e-mail…" className="h-9 pl-9" />
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold normal-case tracking-normal text-foreground/80 [&>th]:normal-case">
                <Cabeca ativo={coluna === 'nome'} desc={desc} onClick={() => ordenar('nome')}>Pessoa</Cabeca>
                <Cabeca ativo={coluna === 'cargo'} desc={desc} onClick={() => ordenar('cargo')}>Cargo</Cabeca>
                <Cabeca ativo={coluna === 'equipe'} desc={desc} onClick={() => ordenar('equipe')}>Equipe</Cabeca>
                <th className="px-4 py-2.5">Situação</th>
                <Cabeca ativo={coluna === 'desde'} desc={desc} onClick={() => ordenar('desde')}>No sistema desde</Cabeca>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(({ p, lugar, lider }) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Foto pessoa={p} tamanho="md" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{p.nome}</p>
                        {p.email && <p className="truncate text-xs text-foreground/65">{p.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 text-foreground">
                      <span className={cn('size-2.5 shrink-0 rounded-full', GRUPO_META[p.grupo].cor)} />
                      {lider ? 'Líder da equipe' : rotuloCargo(p.cargo)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-foreground">
                    {lugar.equipe && lugar.equipe !== 'Sem equipe'
                      ? <>{lugar.equipe}{lugar.subgrupo && <span className="text-foreground/65"> · {lugar.subgrupo}</span>}</>
                      : <span className="font-medium text-warning">Sem equipe</span>}
                  </td>
                  <td className="px-4 py-2.5"><Situacao pessoa={p} /></td>
                  <td className="px-4 py-2.5 tabular-nums text-foreground">{dataCurta(p.criadoEm) || '—'}</td>
                </tr>
              ))}
              {visiveis.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">Ninguém com esse filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">{children}</span>;
}

function Numero({
  Icone, valor, rotulo, tom, destaque, onClick,
}: {
  Icone: typeof Users; valor: number; rotulo: string;
  tom?: 'warning' | 'success'; destaque?: boolean; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'rounded-xl border bg-background p-3 text-left',
        destaque ? 'border-primary/40' : 'border-border',
        tom === 'warning' && 'border-warning/50 bg-warning/5',
        tom === 'success' && 'border-success/40',
        onClick && 'transition hover:border-warning hover:bg-warning/10',
      )}
    >
      <Icone className={cn('size-4', destaque ? 'text-primary' : tom === 'warning' ? 'text-warning' : tom === 'success' ? 'text-success' : 'text-foreground/60')} />
      <p className="mt-2 text-3xl font-bold leading-none tabular-nums tracking-tight text-foreground">{valor}</p>
      <p className="mt-1 text-xs font-medium text-foreground/70">{rotulo}</p>
    </Tag>
  );
}

function Filtro({ children, onTirar }: { children: React.ReactNode; onTirar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-foreground ring-1 ring-primary/30">
      {children}
      <button type="button" onClick={onTirar} className="rounded-full p-0.5 hover:bg-primary/20" aria-label="Tirar filtro">
        <X className="size-3" />
      </button>
    </span>
  );
}

function Cabeca({ ativo, desc, onClick, children }: { ativo: boolean; desc: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5">
      <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1 hover:text-foreground', ativo && 'text-foreground')}>
        {children}
        {ativo ? <span aria-hidden>{desc ? '↓' : '↑'}</span> : <ArrowUpDown className="size-3 opacity-40" />}
      </button>
    </th>
  );
}

function Situacao({ pessoa }: { pessoa: Pessoa }) {
  if (pessoa.emFerias) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
        <Sun className="size-3" /> Férias{pessoa.feriasAte && ` até ${dataCurta(pessoa.feriasAte).slice(0, 5)}`}
      </span>
    );
  }
  if (pessoa.novata) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
        <Sparkles className="size-3" /> Nova
      </span>
    );
  }
  return <span className="text-xs font-medium text-foreground/70">Em atividade</span>;
}
