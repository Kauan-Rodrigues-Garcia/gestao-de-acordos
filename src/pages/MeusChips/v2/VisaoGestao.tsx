/**
 * VisaoGestao — Meus Chips 2.0 para quem enxerga o setor ou todos.
 *
 *   1. indicadores grandes (filtram);
 *   2. gráficos: rosca da saúde + barras por setor/equipe;
 *   3. «Precisa de atenção agora» (tempos, lembretes, sem ativo, sem chip);
 *   4. os grupos (Setor ou Equipe, à escolha), cada um com a tabela das
 *      pessoas: semáforo e contagem por status. A linha abre os chips.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, Layers, Plus, Radio, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { StatusChip } from '@/services/chipsFisicos/chipsFisicosRegras';
import {
  agruparGestao, contar, pessoasSemAtivo, saude,
  type GrupoPainel, type LinhaPessoa, type ModoGrupo,
} from '@/services/chipsFisicos/chipsPainel';
import type {
  ChipFisicoRow, EquipeChipRow, PessoaChipRow, SetorChipRow,
} from '@/services/chipsFisicos/chipsFisicos.service';
import { Semaforo } from './Semaforo';
import { CartaoChip, type AcoesDoChip } from './CartaoChip';
import { BarrasPorGrupo, RoscaSaude } from './Graficos';
import { Indicadores } from './Indicadores';
import { AvatarPessoa, PainelAgenda } from './PainelAgenda';
import { HEX_STATUS, ORDEM_STATUS, TOM_STATUS } from './cores';

const TODOS = '__todos__';

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export interface VisaoGestaoProps {
  alcance: 'setor' | 'todos';
  chips: ChipFisicoRow[];
  pessoas: Map<string, PessoaChipRow>;
  setores: SetorChipRow[];
  equipes: EquipeChipRow[];
  meuSetorId: string | null;
  recursos2: boolean;
  podeCuidar: (c: ChipFisicoRow) => boolean;
  podeAdicionarPara: (pessoaId: string) => boolean;
  onAdicionar: (pessoaId: string | null, setorId: string | null) => void;
  acoes: AcoesDoChip;
}

export function VisaoGestao({
  alcance, chips, pessoas, setores, equipes, meuSetorId, recursos2,
  podeCuidar, podeAdicionarPara, onAdicionar, acoes,
}: VisaoGestaoProps) {
  const [modo, setModo] = useState<ModoGrupo>(alcance === 'setor' ? 'equipe' : 'setor');
  const [setorFiltro, setSetorFiltro] = useState<string>(TODOS);
  const [status, setStatus] = useState<StatusChip | null>(null);
  const [busca, setBusca] = useState('');
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const nomeDe = (id: string) => pessoas.get(id)?.nome ?? '';

  // O recorte: setor escolhido (visão «todos») — conta nos números e gráficos.
  const noSetor = useMemo(() => {
    if (alcance !== 'todos' || setorFiltro === TODOS) return chips;
    return chips.filter(c => pessoas.get(c.operador_id)?.setor_id === setorFiltro);
  }, [chips, alcance, setorFiltro, pessoas]);

  // Pessoas do recorte (para «sem chip»): o setor da pessoa logada ou o escolhido.
  const pessoasDoRecorte = useMemo(() => {
    const alvo = alcance === 'setor' ? meuSetorId : setorFiltro === TODOS ? null : setorFiltro;
    if (!alvo) return pessoas;
    return new Map([...pessoas].filter(([, p]) => p.setor_id === alvo));
  }, [pessoas, alcance, meuSetorId, setorFiltro]);

  const contagem = useMemo(() => contar(noSetor), [noSetor]);

  // Status e busca filtram a LISTA (os números de cima ficam inteiros).
  const filtrados = useMemo(() => {
    const termo = busca.trim();
    const digitos = termo.replace(/\D/g, '');
    const texto = semAcento(termo);
    return noSetor.filter(c => {
      if (status && c.status !== status) return false;
      if (!termo) return true;
      if (digitos && c.numero.includes(digitos)) return true;
      return semAcento(nomeDe(c.operador_id)).includes(texto);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noSetor, status, busca, pessoas]);

  const filtrando = status !== null || busca.trim() !== '';
  const incluirSemChip = !filtrando && (alcance === 'setor' || setorFiltro !== TODOS);
  const grupos = useMemo(
    () => agruparGestao(filtrados, pessoasDoRecorte, setores, equipes, modo, incluirSemChip),
    [filtrados, pessoasDoRecorte, setores, equipes, modo, incluirSemChip],
  );
  const gruposGrafico = useMemo(
    () => agruparGestao(noSetor, pessoas, setores, equipes, modo, false),
    [noSetor, pessoas, setores, equipes, modo],
  );
  const semAtivo = useMemo(() => pessoasSemAtivo(gruposGrafico), [gruposGrafico]);
  const semChip = useMemo(() => grupos.flatMap(g => g.semChip), [grupos]);

  const alternar = (id: string) => setAbertos(a => {
    const n = new Set(a);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const setoresDoFiltro = setores.filter(s => s.ativo !== false && chips.some(c => pessoas.get(c.operador_id)?.setor_id === s.id));

  return (
    <div className="space-y-6">
      <Indicadores contagem={contagem} filtro={status} onFiltro={setStatus} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Saúde geral</h2>
          <RoscaSaude contagem={contagem} />
          {recursos2 && (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/8 px-3 py-2 text-base">
              <Radio className="h-4 w-4 text-emerald-600" aria-hidden />
              <strong className="tabular-nums">{contagem.movimentando}</strong> chips movimentando agora
            </p>
          )}
        </section>
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Chips por {modo === 'setor' ? 'setor' : 'equipe'}</h2>
          <BarrasPorGrupo grupos={gruposGrafico} />
        </section>
      </div>

      <PainelAgenda
        chips={noSetor}
        nomeDe={nomeDe}
        semAtivo={semAtivo}
        semChip={semChip}
        titulo="Precisa de atenção agora"
        mostrarDono
      />

      {/* ── Controles da lista ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="inline-flex rounded-xl bg-muted p-1" role="tablist" aria-label="Agrupar por">
          {(['setor', 'equipe'] as ModoGrupo[]).map(m => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-base font-medium transition-colors',
                modo === m ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'setor' ? <Layers className="h-4 w-4" aria-hidden /> : <Users className="h-4 w-4" aria-hidden />}
              Por {m}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar pessoa ou número"
            aria-label="Buscar chip"
            className="h-11 pl-9 text-base"
          />
        </div>
        {alcance === 'todos' && (
          <Select value={setorFiltro} onValueChange={setSetorFiltro}>
            <SelectTrigger className="h-11 text-base lg:w-60" aria-label="Setor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os setores</SelectItem>
              {setoresDoFiltro.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button className="h-11 text-base" onClick={() => onAdicionar(null, alcance === 'setor' ? meuSetorId : setorFiltro === TODOS ? null : setorFiltro)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Adicionar chip
        </Button>
      </div>

      {status && (
        <p className="text-base text-muted-foreground">
          Mostrando só <strong className={TOM_STATUS[status].texto}>{status === 'restricao' ? 'restrição' : status}</strong>.{' '}
          <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => setStatus(null)}>
            Ver todos
          </button>
        </p>
      )}

      {/* ── Grupos ─────────────────────────────────────────────────────── */}
      {grupos.length === 0 ? (
        <p className="rounded-2xl border border-dashed py-14 text-center text-base text-muted-foreground">
          {filtrando ? 'Nenhum chip com esse filtro.' : 'Ninguém cadastrou chip aqui ainda.'}
        </p>
      ) : (
        <div className="space-y-5">
          {grupos.map(g => (
            <GrupoCard
              key={g.id}
              grupo={g}
              abertos={abertos}
              forcarAberto={filtrando}
              onAlternar={alternar}
              recursos2={recursos2}
              podeCuidar={podeCuidar}
              podeAdicionarPara={podeAdicionarPara}
              onAdicionar={id => onAdicionar(id, null)}
              acoes={acoes}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BarraStatus({ c, className }: { c: GrupoPainel['contagem']; className?: string }) {
  return (
    <div className={cn('flex h-2.5 overflow-hidden rounded-full bg-muted', className)} aria-hidden>
      {c.total > 0 && ORDEM_STATUS.map(s => (
        <div key={s} style={{ width: `${(c[s] / c.total) * 100}%`, backgroundColor: HEX_STATUS[s] }} />
      ))}
    </div>
  );
}

function Numero({ n, s }: { n: number; s: StatusChip }) {
  return (
    <span className={cn('tabular-nums', n > 0 ? cn('font-semibold', TOM_STATUS[s].texto) : 'text-muted-foreground/50')}>
      {n}
    </span>
  );
}

function GrupoCard({
  grupo, abertos, forcarAberto, onAlternar, recursos2, podeCuidar, podeAdicionarPara, onAdicionar, acoes,
}: {
  grupo: GrupoPainel<ChipFisicoRow>;
  abertos: Set<string>;
  forcarAberto: boolean;
  onAlternar: (id: string) => void;
  recursos2: boolean;
  podeCuidar: (c: ChipFisicoRow) => boolean;
  podeAdicionarPara: (id: string) => boolean;
  onAdicionar: (pessoaId: string) => void;
  acoes: AcoesDoChip;
}) {
  const c = grupo.contagem;
  const pct = saude(c);
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex flex-col gap-3 border-b bg-muted/30 px-5 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">{grupo.nome}</h2>
          <p className="text-sm text-muted-foreground">
            {grupo.detalhe ? `${grupo.detalhe} · ` : ''}
            {grupo.pessoas.length} {grupo.pessoas.length === 1 ? 'pessoa' : 'pessoas'} · {c.total} chips
            {grupo.semChip.length > 0 ? ` · ${grupo.semChip.length} sem chip` : ''}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-40">
            <BarraStatus c={c} />
          </div>
          <div className="text-right">
            <p className={cn('text-2xl font-bold tabular-nums leading-none',
              pct >= 80 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400')}>
              {pct}%
            </p>
            <p className="text-xs text-muted-foreground">ativos</p>
          </div>
        </div>
      </header>

      {grupo.pessoas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-base">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Pessoa</th>
                <th className="px-3 py-2.5 font-medium">Chips</th>
                <th className="px-3 py-2.5 text-center font-medium">Ativos</th>
                <th className="px-3 py-2.5 text-center font-medium">Recuperar</th>
                <th className="px-3 py-2.5 text-center font-medium">Restrição</th>
                <th className="px-3 py-2.5 text-center font-medium">Banidos</th>
                {recursos2 && <th className="px-3 py-2.5 text-center font-medium">Movimentando</th>}
                <th className="w-12 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {grupo.pessoas.map(l => (
                <LinhaDaPessoa
                  key={l.pessoa.id}
                  linha={l}
                  aberto={forcarAberto || abertos.has(l.pessoa.id)}
                  onAlternar={() => onAlternar(l.pessoa.id)}
                  recursos2={recursos2}
                  podeCuidar={podeCuidar}
                  podeAdicionar={podeAdicionarPara(l.pessoa.id)}
                  onAdicionar={() => onAdicionar(l.pessoa.id)}
                  acoes={acoes}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LinhaDaPessoa({
  linha, aberto, onAlternar, recursos2, podeCuidar, podeAdicionar, onAdicionar, acoes,
}: {
  linha: LinhaPessoa<ChipFisicoRow>;
  aberto: boolean;
  onAlternar: () => void;
  recursos2: boolean;
  podeCuidar: (c: ChipFisicoRow) => boolean;
  podeAdicionar: boolean;
  onAdicionar: () => void;
  acoes: AcoesDoChip;
}) {
  const { pessoa, chips, contagem: c } = linha;
  const colunas = recursos2 ? 8 : 7;
  return (
    <>
      <tr
        className={cn('cursor-pointer border-b transition-colors hover:bg-muted/40', aberto && 'bg-muted/30')}
        onClick={onAlternar}
      >
        <td className="px-5 py-3">
          <button
            type="button"
            className="flex items-center gap-3 text-left"
            aria-expanded={aberto}
            title={aberto ? 'Recolher' : 'Ver os chips'}
            onClick={e => { e.stopPropagation(); onAlternar(); }}
          >
            <AvatarPessoa nome={pessoa.nome} foto={pessoa.foto_url} className="h-10 w-10" />
            <span className="font-semibold">{pessoa.nome}</span>
          </button>
        </td>
        <td className="px-3 py-3">
          <span className="flex items-center gap-2">
            <Semaforo chips={chips} tamanho="md" maximo={10} />
            <span className="tabular-nums text-muted-foreground">{c.total}</span>
          </span>
        </td>
        <td className="px-3 py-3 text-center"><Numero n={c.ativo} s="ativo" /></td>
        <td className="px-3 py-3 text-center"><Numero n={c.recuperar} s="recuperar" /></td>
        <td className="px-3 py-3 text-center"><Numero n={c.restricao} s="restricao" /></td>
        <td className="px-3 py-3 text-center"><Numero n={c.banido} s="banido" /></td>
        {recursos2 && (
          <td className="px-3 py-3 text-center">
            <span className={cn('tabular-nums', c.movimentando > 0 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/50')}>
              {c.movimentando}
            </span>
          </td>
        )}
        <td className="px-3 py-3 text-right">
          <ChevronDown className={cn('ml-auto h-5 w-5 text-muted-foreground transition-transform', aberto && 'rotate-180')} aria-hidden />
        </td>
      </tr>
      {aberto && (
        <tr className="border-b bg-muted/20">
          <td colSpan={colunas} className="px-5 py-4">
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {chips.map(ch => (
                <CartaoChip key={ch.id} chip={ch} podeCuidar={podeCuidar(ch)} recursos2={recursos2} acoes={acoes} />
              ))}
              {podeAdicionar && (
                <button
                  type="button"
                  onClick={onAdicionar}
                  className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-base text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <Plus className="h-6 w-6" aria-hidden />
                  Adicionar chip para {pessoa.nome.split(' ')[0]}
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
