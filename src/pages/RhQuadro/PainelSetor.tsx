/**
 * PainelSetor — o setor aberto, na própria tela e em largura inteira.
 *
 * Substituiu a gaveta lateral em 20/10/2026: «abre de lado, é ruim e não
 * informativo». A gaveta escurecia o quadro atrás e espremia tudo numa coluna
 * de 36rem. Aqui o setor ganha a tela.
 *
 * Refeito em 13/11/2026 («muito simples, faz algo mais dinâmico»): um cabeçalho
 * com a composição em rosca, a estrutura (equipes, liderança) e os pontos de
 * atenção (sem equipe, sem crachá, afastados, férias, clones, novos) — cada um
 * filtra a tabela —, as equipes em cartões com líder e fotos, e a tabela
 * inteira das pessoas embaixo.
 *
 * Só leitura, como o resto do Quadro.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle, ArrowLeft, ArrowUpDown, CheckCircle2, Copy, Crown, Download, GraduationCap, HeartPulse, IdCard, Network, Search,
  Sparkles, Sun, UsersRound, X, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  GRUPOS_CARGO, normalizar, type CloneQuadro, type GrupoCargo, type Pessoa, type Quadro, type SetorQuadro,
} from '@/services/rh/quadroPessoal';
import { CrachaEditavel } from './CrachaEditavel';
import { Foto, PilhaDeFotos, SeloAlternativo, SeloClone } from './partes';
import { GRUPO_META, dataCurta, lugarTexto, plural, rotuloCargo } from './formato';

/** Filtro de equipe da tabela: id da equipe, `SEM` (sem equipe) ou `null` (todas). */
const SEM = '__sem__';

type Coluna = 'nome' | 'cargo' | 'equipe' | 'cracha' | 'desde';

/** Recortes rápidos da tabela, pelos números do topo. */
type Recorte = 'semCracha' | 'afastados' | 'ferias' | 'clones';

const ROTULO_RECORTE: Record<Recorte, string> = {
  semCracha: 'Sem crachá', afastados: 'Afastados', ferias: 'De férias', clones: 'Clones',
};

export default function PainelSetor({
  quadro, setor, onVoltar, onVerOrganograma, onExportar, podeEditarCracha, onCrachaSalvo,
}: {
  quadro: Quadro;
  setor: SetorQuadro;
  onVoltar: () => void;
  onVerOrganograma: (setorId: string) => void;
  onExportar: (setor: SetorQuadro) => void;
  /** Chave `rh_editar_cracha`: sem ela, o crachá aparece mas não edita. */
  podeEditarCracha: boolean;
  onCrachaSalvo: (pessoaId: string, cracha: string | null) => void;
}) {
  const n = setor.numeros;
  const ehBalde = setor.id === '__sem_setor__';
  const [grupo, setGrupo] = useState<GrupoCargo | null>(null);
  const [equipe, setEquipe] = useState<string | null>(null);
  const [recorte, setRecorte] = useState<Recorte | null>(null);
  const [busca, setBusca] = useState('');
  const [coluna, setColuna] = useState<Coluna>('nome');
  const [desc, setDesc] = useState(false);
  const semMovimento = useReducedMotion();

  const lideresDoSetor = useMemo(
    () => [...new Map(setor.equipes.flatMap(e => e.lideres).map(l => [l.id, l])).values()],
    [setor.equipes],
  );
  /** No alternativo, a equipe é feita de clones: eles contam no tamanho dela. */
  const tamanho = (e: SetorQuadro['equipes'][number]) => e.membros.length + (setor.alternativo ? e.apoio.length : 0);
  const maiorEquipe = Math.max(1, ...setor.equipes.map(tamanho), setor.semEquipe.length);

  /**
   * Cada pessoa com o lugar dela já resolvido, para a tabela filtrar e ordenar.
   * No alternativo entram também os clones, marcados com o setor de origem.
   */
  const linhas = useMemo(() => {
    const doCadastro = setor.pessoas.map(p => {
      const lugar = lugarTexto(quadro, p);
      const eq = setor.equipes.find(e => e.id === quadro.local.get(p.id)?.equipeId) ?? null;
      return {
        p, lugar: { equipe: lugar.equipe, subgrupo: lugar.subgrupo },
        equipeIds: eq ? [eq.id] : [], lider: !!eq?.lideres.some(l => l.id === p.id), clone: null as CloneQuadro | null,
      };
    });
    const clones = setor.clones.map(c => ({
      p: c.pessoa,
      lugar: { equipe: c.equipes.join(', ') as string | null, subgrupo: null as string | null },
      equipeIds: setor.equipes.filter(e => e.apoio.some(a => a.id === c.pessoa.id)).map(e => e.id),
      lider: false,
      clone: c as CloneQuadro | null,
    }));
    return [...doCadastro, ...clones];
  }, [quadro, setor]);

  const visiveis = useMemo(() => {
    const b = normalizar(busca);
    const noRecorte = (l: typeof linhas[number]): boolean => {
      switch (recorte) {
        case 'semCracha': return !l.p.cracha;
        case 'afastados': return l.p.afastado;
        case 'ferias': return l.p.emFerias;
        case 'clones': return !!l.clone;
        default: return true;
      }
    };
    const lista = linhas.filter(l =>
      (grupo === null || l.p.grupo === grupo)
      && (equipe === null || (equipe === SEM ? l.equipeIds.length === 0 : l.equipeIds.includes(equipe)))
      && noRecorte(l)
      && (!b || normalizar(l.p.nome).includes(b) || normalizar(l.p.email).includes(b) || (l.p.cracha ?? '').includes(b)));
    const valor = (l: typeof lista[number]): string => {
      switch (coluna) {
        case 'cargo': return `${GRUPOS_CARGO.indexOf(l.p.grupo)}${rotuloCargo(l.p.cargo)}`;
        case 'equipe': return l.lugar.equipe ?? '';
        case 'cracha': return l.p.cracha ? l.p.cracha.padStart(8, '0') : '~';
        case 'desde': return l.p.criadoEm ?? '';
        default: return l.p.nome;
      }
    };
    return [...lista].sort((a, z) => {
      const r = valor(a).localeCompare(valor(z), 'pt-BR') || a.p.nome.localeCompare(z.p.nome, 'pt-BR');
      return desc ? -r : r;
    });
  }, [linhas, grupo, equipe, recorte, busca, coluna, desc]);

  const filtrar = (f: { grupo?: GrupoCargo | null; equipe?: string | null; recorte?: Recorte | null }) => {
    if ('grupo' in f) setGrupo(f.grupo ?? null);
    if ('equipe' in f) setEquipe(f.equipe ?? null);
    if ('recorte' in f) setRecorte(f.recorte ?? null);
    // Sem rolar a página (13/11/2026, pedido do Cleber): a tabela troca no
    // lugar, com animação, e quem decide ir até ela é a pessoa.
  };
  const ordenar = (c: Coluna) => {
    if (coluna === c) setDesc(d => !d); else { setColuna(c); setDesc(c === 'desde'); }
  };
  /** «BOOKPLAY · BIRIGUI · BOOKPLAY»: a marca costuma ser a empresa — sem repetir, sem olhar caixa. */
  const trilha = [...new Map([setor.empresa, setor.cidade.nome, setor.cidade.marca]
    .filter((t): t is string => !!t).map(t => [normalizar(t), t])).values()];

  /** O que pede ação, em ordem de urgência. Só aparece o que tem alguém. */
  const base = Math.max(1, n.pessoas + (setor.alternativo ? n.clones : 0));
  const atencao = ([
    { chave: 'semEquipe', Icone: AlertTriangle, rotulo: 'Sem equipe', valor: ehBalde ? 0 : n.semEquipe, cor: 'var(--warning)', base,
      ativo: equipe === SEM, onClick: () => filtrar({ equipe: equipe === SEM ? null : SEM, grupo: null, recorte: null }) },
    { chave: 'semCracha', Icone: IdCard, rotulo: 'Sem crachá', valor: n.semCracha, cor: 'var(--chart-5)', base,
      ativo: recorte === 'semCracha', onClick: () => filtrar({ recorte: recorte === 'semCracha' ? null : 'semCracha', equipe: null, grupo: null }) },
    { chave: 'afastados', Icone: HeartPulse, rotulo: 'Afastados', valor: n.afastados, cor: 'var(--chart-3)', base,
      ativo: recorte === 'afastados', onClick: () => filtrar({ recorte: recorte === 'afastados' ? null : 'afastados', equipe: null, grupo: null }) },
    { chave: 'ferias', Icone: Sun, rotulo: 'De férias', valor: n.emFerias, cor: 'var(--warning)', base,
      ativo: recorte === 'ferias', onClick: () => filtrar({ recorte: recorte === 'ferias' ? null : 'ferias', equipe: null, grupo: null }) },
    { chave: 'clones', Icone: Copy, rotulo: 'Clones de outros setores', valor: setor.alternativo ? n.clones : 0, cor: 'var(--info)', base,
      ativo: recorte === 'clones', onClick: () => filtrar({ recorte: recorte === 'clones' ? null : 'clones', equipe: null, grupo: null }) },
    { chave: 'novos', Icone: Sparkles, rotulo: 'Novos (30 dias)', valor: n.novatos, cor: 'var(--chart-2)', base,
      ativo: false, onClick: () => filtrar({ equipe: null, grupo: null, recorte: null }) },
  ]).filter(a => a.valor > 0);

  /** Muda quando o recorte da tabela muda (não a busca: digitar não anima). */
  const assinatura = `${grupo ?? ''}|${equipe ?? ''}|${recorte ?? ''}`;
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

      {/* ── Cabeçalho: quem é o setor, o tamanho, a composição e o que pede atenção ── */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(60rem 18rem at 0% 0%, color-mix(in oklch, ${setor.alternativo ? 'var(--info)' : 'var(--primary)'} 12%, transparent), transparent 70%)`,
          }}
        />
        <div className="relative p-5 md:p-7">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {trilha.map(t => (
                  <span key={t} className="rounded-full border border-border bg-background/70 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {t}
                  </span>
                ))}
              </div>
              <h2 className="mt-2 text-4xl font-bold tracking-tight text-foreground md:text-5xl">{setor.nome}</h2>
              {(setor.descricao || ehBalde) && (
                <p className="mt-1.5 max-w-2xl text-sm text-foreground/75">
                  {ehBalde ? 'Pessoas sem setor no cadastro, ou num setor que foi desativado.' : setor.descricao}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {setor.alternativo && <SeloAlternativo grande />}
                {setor.regra && <Etiqueta>Regra {setor.regra}</Etiqueta>}
                {setor.nucleo && <Etiqueta>Núcleo</Etiqueta>}
              </div>
            </div>
            {!ehBalde && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-1.5 bg-background/80" onClick={() => onVerOrganograma(setor.id)}>
                  <Network className="size-4" /> Ver organograma
                </Button>
                <Button className="gap-1.5" onClick={() => onExportar(setor)}>
                  <Download className="size-4" /> Exportar este setor
                </Button>
              </div>
            )}
          </div>

          {setor.alternativo && (
            <div className="mt-5 flex gap-3 rounded-2xl border border-info/30 bg-info/5 p-3.5 text-sm">
              <Copy className="mt-0.5 size-4 shrink-0 text-info" />
              <p className="text-foreground/85">
                <strong className="font-semibold text-foreground">Setor alternativo.</strong>{' '}
                As pessoas das equipes daqui são, na maioria, <strong className="font-semibold text-foreground">clones</strong> de
                operadores de outros setores: o cadastro, o crachá e o dinheiro de cada um ficam no setor de origem, que aparece
                ao lado do nome. {plural(setor.clones.length, 'clone', 'clones')}
                {n.pessoas > 0 && <> e {plural(n.pessoas, 'pessoa', 'pessoas')} com cadastro aqui</>}.
              </p>
            </div>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {/* Tamanho e composição */}
            <div className="flex items-center gap-5 rounded-2xl border border-border bg-background/70 p-4 backdrop-blur">
              <Rosca
                fatias={GRUPOS_CARGO.filter(g => n.porGrupo[g] > 0).map(g => ({ chave: g, valor: n.porGrupo[g], cor: COR_GRUPO[g] }))}
                ativa={grupo}
                onFatia={g => filtrar({ grupo: grupo === g ? null : g as GrupoCargo })}
              >
                <span className="text-3xl font-bold leading-none tabular-nums text-foreground">{setor.alternativo ? n.clones + n.pessoas : n.pessoas}</span>
                <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{setor.alternativo ? 'com clones' : 'pessoas'}</span>
              </Rosca>
              <ul className="min-w-0 flex-1 space-y-1">
                {GRUPOS_CARGO.filter(g => n.porGrupo[g] > 0).map(g => {
                  const ativo = grupo === g;
                  const pct = n.pessoas ? Math.round((n.porGrupo[g] / n.pessoas) * 100) : 0;
                  return (
                    <li key={g}>
                      <button
                        type="button"
                        onClick={() => filtrar({ grupo: ativo ? null : g })}
                        aria-pressed={ativo}
                        className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm transition hover:bg-muted', ativo && 'bg-primary/10 ring-1 ring-primary/30')}
                      >
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: COR_GRUPO[g] }} />
                        <span className="min-w-0 flex-1 truncate text-foreground">{GRUPO_META[g].rotulo}</span>
                        <strong className="tabular-nums text-foreground">{n.porGrupo[g]}</strong>
                        <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
                      </button>
                    </li>
                  );
                })}
                {n.pessoas === 0 && <li className="px-2 text-sm text-muted-foreground">Ninguém com cadastro aqui.</li>}
              </ul>
            </div>

            {/* Estrutura */}
            <div className="grid grid-cols-2 gap-3">
              <Destaque Icone={UsersRound} valor={n.equipes} rotulo={n.equipes === 1 ? 'equipe' : 'equipes'} />
              <Destaque Icone={Crown} valor={lideresDoSetor.length} rotulo={lideresDoSetor.length === 1 ? 'líder' : 'líderes'} />
              <div className="col-span-2 flex items-center gap-3 rounded-2xl border border-border bg-background/70 p-3.5 backdrop-blur">
                {lideresDoSetor.length > 0 ? (
                  <>
                    <PilhaDeFotos pessoas={lideresDoSetor} max={5} />
                    <p className="min-w-0 flex-1 text-xs text-foreground/80">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Liderança</span>
                      <span className="line-clamp-2">{lideresDoSetor.map(l => l.nome.split(' ')[0]).join(', ')}</span>
                    </p>
                  </>
                ) : (
                  <p className="text-xs italic text-muted-foreground">Sem líder registrado.</p>
                )}
              </div>
            </div>

            {/* O que pede atenção */}
            <div className="rounded-2xl border border-border bg-background/70 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pontos de atenção</p>
              {atencao.length === 0 ? (
                <p className="mt-3 flex items-center gap-2 text-sm font-medium text-success">
                  <CheckCircle2 className="size-4" /> Tudo em ordem neste setor.
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {atencao.map(a => (
                    <li key={a.chave}>
                      <button
                        type="button"
                        onClick={a.onClick}
                        className={cn('group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-muted', a.ativo && 'bg-primary/10 ring-1 ring-primary/30')}
                      >
                        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg" style={tingir(a.cor)}>
                          <a.Icone className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate text-foreground">{a.rotulo}</span>
                            <strong className="tabular-nums text-foreground">{a.valor}</strong>
                          </span>
                          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (a.valor / Math.max(1, a.base)) * 100)}%`, backgroundColor: a.cor }} />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Equipes em cartões ── */}
      <section className="space-y-3">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Equipes</h3>
            <p className="text-sm text-muted-foreground">
              {setor.equipes.length
                ? 'Da maior para a menor. Clique numa equipe para ver quem está nela.'
                : 'Este setor não tem equipe cadastrada.'}
            </p>
          </div>
          {equipe && <Filtro onTirar={() => setEquipe(null)}>{nomeDaEquipe}</Filtro>}
        </header>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))]">
          {[...setor.equipes].sort((a, b) => tamanho(b) - tamanho(a)).map(e => {
            const ativo = equipe === e.id;
            const gente = setor.alternativo ? [...e.membros, ...e.apoio] : e.membros;
            const lider = e.lideres[0];
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => filtrar({ equipe: ativo ? null : e.id })}
                aria-pressed={ativo}
                className={cn(
                  'group flex flex-col rounded-2xl border bg-card p-4 text-left shadow-sm transition',
                  ativo ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-foreground" title={e.nome}>{e.nome}</p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {e.treinamento && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 text-[10px] font-semibold text-warning">
                          <GraduationCap className="size-3" /> Treinamento
                        </span>
                      )}
                      {setor.alternativo && e.apoio.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-1.5 text-[10px] font-semibold text-info">
                          <Copy className="size-3" /> {plural(e.apoio.length, 'clone', 'clones')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-3xl font-bold leading-none tabular-nums text-foreground">{tamanho(e)}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${(tamanho(e) / maiorEquipe) * 100}%`, backgroundColor: setor.alternativo ? 'var(--info)' : 'var(--primary)' }}
                  />
                </div>
                <div className="mt-3 flex items-center gap-2.5">
                  {lider ? (
                    <>
                      <Foto pessoa={lider} tamanho="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {e.lideres.length > 1 ? `Líderes (${e.lideres.length})` : 'Líder'}
                        </span>
                        <span className="block truncate text-xs font-medium text-foreground">{e.lideres.map(l => l.nome).join(', ')}</span>
                      </span>
                    </>
                  ) : (
                    <span className="flex-1 text-xs italic text-muted-foreground">Sem líder registrado</span>
                  )}
                </div>
                {gente.length > 0 && (
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <PilhaDeFotos pessoas={gente} max={6} tamanho="xs" />
                    {e.subgrupos.length > 0 && (
                      <span className="truncate text-[11px] text-muted-foreground" title={e.subgrupos.map(sg => sg.nome).join(', ')}>
                        {plural(e.subgrupos.length, 'subgrupo', 'subgrupos')}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
          {setor.semEquipe.length > 0 && (
            <button
              type="button"
              onClick={() => filtrar({ equipe: equipe === SEM ? null : SEM })}
              aria-pressed={equipe === SEM}
              className={cn(
                'flex flex-col rounded-2xl border border-dashed border-warning/60 bg-warning/5 p-4 text-left transition hover:bg-warning/10',
                equipe === SEM && 'ring-2 ring-warning/30',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 text-base font-semibold text-warning">
                  <AlertTriangle className="size-4" /> {ehBalde ? 'Sem setor' : 'Sem equipe'}
                </p>
                <span className="text-3xl font-bold leading-none tabular-nums text-foreground">{setor.semEquipe.length}</span>
              </div>
              <p className="mt-2 text-xs text-foreground/75">
                {ehBalde ? 'Sem setor no cadastro.' : 'Pessoas do setor sem equipe no cadastro. Vale conferir com a liderança.'}
              </p>
              <div className="mt-auto pt-3"><PilhaDeFotos pessoas={setor.semEquipe} max={6} tamanho="xs" /></div>
            </button>
          )}
        </div>
      </section>

      {/* Pessoas */}
      <section className="relative scroll-mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Um brilho rápido na borda quando o recorte muda: a tabela avisa que trocou. */}
        <AnimatePresence>
          {!semMovimento && assinatura !== '||' && (
            <motion.span
              key={assinatura}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-primary/50"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>
        <header className="flex flex-wrap items-center gap-3 border-b border-border p-4 md:px-5">
          <div>
            <h3 className="text-base font-semibold text-foreground">{setor.alternativo ? 'Pessoas e clones do setor' : 'Pessoas do setor'}</h3>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={visiveis.length}
                className="text-sm text-muted-foreground"
                initial={semMovimento ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={semMovimento ? undefined : { opacity: 0, y: 4 }}
                transition={{ duration: 0.18 }}
              >
                {visiveis.length === linhas.length
                  ? plural(linhas.length, 'pessoa', 'pessoas')
                  : `${visiveis.length} de ${linhas.length}`}
              </motion.p>
            </AnimatePresence>
          </div>
          <motion.div layout className="flex flex-wrap items-center gap-2">
            <AnimatePresence initial={false}>
              {grupo && <Filtro key="g" onTirar={() => setGrupo(null)}>{GRUPO_META[grupo].rotulo}</Filtro>}
              {equipe && <Filtro key="e" onTirar={() => setEquipe(null)}>{nomeDaEquipe}</Filtro>}
              {recorte && <Filtro key="r" onTirar={() => setRecorte(null)}>{ROTULO_RECORTE[recorte]}</Filtro>}
            </AnimatePresence>
          </motion.div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, e-mail ou crachá…" className="h-9 pl-9" />
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold normal-case tracking-normal text-foreground/80 [&>th]:normal-case">
                <Cabeca ativo={coluna === 'nome'} desc={desc} onClick={() => ordenar('nome')}>Pessoa</Cabeca>
                <Cabeca ativo={coluna === 'cargo'} desc={desc} onClick={() => ordenar('cargo')}>Cargo</Cabeca>
                <Cabeca ativo={coluna === 'cracha'} desc={desc} onClick={() => ordenar('cracha')}>Crachá</Cabeca>
                <Cabeca ativo={coluna === 'equipe'} desc={desc} onClick={() => ordenar('equipe')}>Equipe</Cabeca>
                <th className="px-4 py-2.5">Situação</th>
                <Cabeca ativo={coluna === 'desde'} desc={desc} onClick={() => ordenar('desde')}>No sistema desde</Cabeca>
              </tr>
            </thead>
            {/* A tabela troca no lugar: as linhas entram em cascata curta a cada recorte novo. */}
            <tbody key={assinatura}>
              {visiveis.map(({ p, lugar, lider, clone }, i) => (
                <motion.tr
                  key={p.id}
                  className={cn('border-b border-border/60 last:border-0 hover:bg-muted/40', clone && 'bg-info/[0.03]')}
                  initial={semMovimento ? false : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(i, 14) * 0.025, ease: 'easeOut' }}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Foto pessoa={p} tamanho="md" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium text-foreground">
                          <span className="truncate">{p.nome}</span>
                          {clone && <SeloClone origem={clone.origem} />}
                        </p>
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
                  <td className="px-4 py-2">
                    <CrachaEditavel pessoa={p} podeEditar={podeEditarCracha} onSalvo={onCrachaSalvo} />
                  </td>
                  <td className="px-4 py-2.5 text-foreground">
                    {lugar.equipe && lugar.equipe !== 'Sem equipe'
                      ? <>{lugar.equipe}{lugar.subgrupo && <span className="text-foreground/65"> · {lugar.subgrupo}</span>}</>
                      : <span className="font-medium text-warning">Sem equipe</span>}
                  </td>
                  <td className="px-4 py-2.5"><Situacao pessoa={p} /></td>
                  <td className="px-4 py-2.5 tabular-nums text-foreground">{dataCurta(p.criadoEm) || '—'}</td>
                </motion.tr>
              ))}
              {visiveis.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Ninguém com esse filtro.</td></tr>
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

/** Cor de cada grupo de cargo na rosca: variável de tema crua (oklch), nunca em hsl(). */
const COR_GRUPO: Record<GrupoCargo, string> = {
  operador: 'var(--primary)',
  lider: 'var(--info)',
  elite: 'var(--success)',
  gerencia: 'var(--warning)',
  diretoria: 'color-mix(in oklch, var(--foreground) 60%, transparent)',
  outros: 'color-mix(in oklch, var(--muted-foreground) 45%, transparent)',
};

const tingir = (cor: string): CSSProperties => ({
  backgroundColor: `color-mix(in oklch, ${cor} 15%, transparent)`,
  color: cor,
});

/** A composição em rosca: cada fatia é um grupo de cargo, e clicar filtra a tabela. */
function Rosca({
  fatias, ativa, onFatia, children,
}: {
  fatias: { chave: string; valor: number; cor: string }[];
  ativa: string | null;
  onFatia: (chave: string) => void;
  children: ReactNode;
}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let corrido = 0;
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 128 128" className="size-full -rotate-90" role="img" aria-label="Composição por cargo">
        <circle cx="64" cy="64" r={R} fill="none" strokeWidth="14" style={{ stroke: 'var(--muted)' }} />
        {total > 0 && fatias.map(f => {
          const tam = (f.valor / total) * C;
          const el = (
            <circle
              key={f.chave}
              cx="64" cy="64" r={R} fill="none"
              strokeWidth={ativa === f.chave ? 18 : 14}
              strokeDasharray={`${Math.max(0, tam - (fatias.length > 1 ? 2 : 0))} ${C}`}
              strokeDashoffset={-corrido}
              style={{ stroke: f.cor, opacity: ativa && ativa !== f.chave ? 0.35 : 1, cursor: 'pointer', transition: 'all .3s' }}
              onClick={() => onFatia(f.chave)}
            >
              <title>{String(f.valor)}</title>
            </circle>
          );
          corrido += tam;
          return el;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

function Destaque({ Icone, valor, rotulo }: { Icone: LucideIcon; valor: number; rotulo: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 p-3.5 backdrop-blur">
      <span className="inline-flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icone className="size-4" />
      </span>
      <p className="mt-2.5 text-3xl font-bold leading-none tabular-nums tracking-tight text-foreground">{valor}</p>
      <p className="mt-1 text-xs font-medium text-foreground/70">{rotulo}</p>
    </div>
  );
}

function Filtro({ children, onTirar }: { children: ReactNode; onTirar: () => void }) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.18 }}
      className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-foreground ring-1 ring-primary/30"
    >
      {children}
      <button type="button" onClick={onTirar} className="rounded-full p-0.5 hover:bg-primary/20" aria-label="Tirar filtro">
        <X className="size-3" />
      </button>
    </motion.span>
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
  if (pessoa.afastado) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
        <HeartPulse className="size-3" /> Afastado
      </span>
    );
  }
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
