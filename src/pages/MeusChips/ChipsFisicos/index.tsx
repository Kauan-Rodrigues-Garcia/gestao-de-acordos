/**
 * ChipsFisicos — a separação da aba Meus Chips com os chips que cada pessoa tem.
 *
 * ## Uma tela, três alcances
 *
 *   proprios .. a lista da própria pessoa;
 *   setor ..... um bloco por pessoa do setor, e quem ainda não cadastrou nada;
 *   todos ..... os blocos agrupados por setor, com filtro de setor.
 *
 * O alcance vem do painel (`useChipsFisicos`), e o banco recorta de novo.
 *
 * ## Os contadores são o filtro
 *
 * A faixa de cima conta Ativos, Restrição, Banidos, Recuperar e os de
 * tempo encerrado, e cada contador filtra a lista. É a primeira pergunta de
 * quem cuida do setor («quantos banidos temos?») e a resposta já leva à lista.
 *
 * ## Separado dos números do Núcleo
 *
 * Nada aqui lê ou escreve `numeros_whatsapp`. Ver a migration 20260921160000.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Database, Plus, Search, Smartphone, UserX } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAgora } from '@/hooks/useAgora';
import { useChipsFisicos } from '@/hooks/useChipsFisicos';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  STATUS_CHIP, agruparPorPessoa, estadoDoTempo, filtrarChips, resumir, rotuloContagem,
  type BlocoPessoa, type FiltroChips, type FiltroStatusChip, type StatusChip,
} from '@/services/chipsFisicos/chipsFisicosRegras';
import {
  excluirChipFisico, type ChipFisicoRow, type PessoaChipRow,
} from '@/services/chipsFisicos/chipsFisicos.service';
import { PONTO_STATUS_CHIP, PONTO_TEMPO_ENCERRADO } from './coresStatusChip';
import { DialogoChipFisico } from './DialogoChipFisico';
import { DialogoStatusChip } from './DialogoStatusChip';
import { LinhaChip } from './LinhaChip';

const ROTULO_CONTADOR: Record<StatusChip, string> = {
  ativo: 'Ativos', restricao: 'Restrição', banido: 'Banidos', recuperar: 'Recuperar',
};

const TODOS_OS_SETORES = 'todos';
const SEM_SETOR = 'sem_setor';

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? '' : '';
  return (primeira + ultima).toUpperCase();
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

interface EstadoCadastro {
  aberto: boolean;
  chip: ChipFisicoRow | null;
  dono: string | null;
}

const CADASTRO_FECHADO: EstadoCadastro = { aberto: false, chip: null, dono: null };

export function ChipsFisicos() {
  const {
    habilitado, alcance, podeCuidarColegas, chips, pessoas, setores,
    meuId, meuSetorId, instalado, loading, erro, recarregar,
  } = useChipsFisicos();
  const agora = useAgora();

  const [filtro, setFiltro] = useState<FiltroChips>({ status: 'todos', busca: '' });
  const [setorFiltro, setSetorFiltro] = useState<string>(TODOS_OS_SETORES);
  const [paraStatus, setParaStatus] = useState<ChipFisicoRow | null>(null);
  const [cadastro, setCadastro] = useState<EstadoCadastro>(CADASTRO_FECHADO);
  const [paraExcluir, setParaExcluir] = useState<ChipFisicoRow | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const visaoDeGrupo = alcance !== 'proprios';

  const nomeDe = useCallback(
    (id: string) => pessoas.get(id)?.nome ?? '',
    [pessoas],
  );
  const setorDe = useCallback(
    (id: string) => pessoas.get(id)?.setor_id ?? null,
    [pessoas],
  );
  const nomeDoSetor = useMemo(() => {
    const mapa = new Map(setores.map(s => [s.id, s.nome]));
    return (id: string | null) => (id ? mapa.get(id) ?? 'Setor removido' : 'Sem setor');
  }, [setores]);

  // O setor escolhido no filtro (só no alcance «todos»).
  const chipsNoRecorte = useMemo(() => {
    if (alcance !== 'todos' || setorFiltro === TODOS_OS_SETORES) return chips;
    const alvo = setorFiltro === SEM_SETOR ? null : setorFiltro;
    return chips.filter(c => setorDe(c.operador_id) === alvo);
  }, [chips, alcance, setorFiltro, setorDe]);

  // O relógio só mexe na lista quando um tempo acaba. `encerrados` muda nesse
  // segundo e em nenhum outro — a lista não é refeita a cada batida.
  const resumo = resumir(chipsNoRecorte, agora);
  const encerrados = chipsNoRecorte
    .filter(c => estadoDoTempo(c, agora).tipo === 'encerrado')
    .map(c => c.id)
    .join(',');
  const idsEncerrados = useMemo(() => new Set(encerrados.split(',')), [encerrados]);
  const visiveis = useMemo(
    () => filtrarChips(chipsNoRecorte, filtro, nomeDe, c => idsEncerrados.has(c.id)),
    [chipsNoRecorte, filtro, nomeDe, idsEncerrados],
  );
  const filtrando = filtro.status !== 'todos' || filtro.busca.trim() !== '';

  const blocos = useMemo(() => agruparPorPessoa(visiveis, pessoas), [visiveis, pessoas]);

  /** O setor que a tela está olhando: o próprio, ou o escolhido no filtro. */
  const setorOlhado: string | null | undefined =
    alcance === 'setor' ? meuSetorId
    : alcance === 'todos' && setorFiltro !== TODOS_OS_SETORES
      ? (setorFiltro === SEM_SETOR ? null : setorFiltro)
      : undefined;

  // Quem está no setor olhado, ativo, e sem chip nenhum cadastrado.
  const semChip = useMemo(() => {
    if (setorOlhado === undefined) return [];
    const comChip = new Set(chips.map(c => c.operador_id));
    return [...pessoas.values()]
      .filter(p => p.ativo && p.setor_id === setorOlhado && !comChip.has(p.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [setorOlhado, chips, pessoas]);

  // Para quem o chip pode ir no cadastro. Na correção entram os inativos também:
  // o dono atual precisa estar na lista.
  const pessoasDoRecorte = useMemo(() => {
    if (!podeCuidarColegas || !visaoDeGrupo) return null;
    return [...pessoas.values()]
      .filter(p => setorOlhado === undefined || p.setor_id === setorOlhado)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [podeCuidarColegas, visaoDeGrupo, pessoas, setorOlhado]);

  const escolhiveis = useMemo<PessoaChipRow[] | null>(() => {
    if (!pessoasDoRecorte) return null;
    if (cadastro.chip) {
      const lista = [...pessoasDoRecorte];
      const dono = pessoas.get(cadastro.chip.operador_id);
      if (dono && !lista.some(p => p.id === dono.id)) lista.unshift(dono);
      return lista;
    }
    return pessoasDoRecorte.filter(p => p.ativo);
  }, [pessoasDoRecorte, cadastro.chip, pessoas]);

  const podeCuidar = useCallback(
    (chip: ChipFisicoRow) => chip.operador_id === meuId || podeCuidarColegas,
    [meuId, podeCuidarColegas],
  );

  const abrirStatus   = useCallback((c: ChipFisicoRow) => setParaStatus(c), []);
  const abrirCorrecao = useCallback((c: ChipFisicoRow) => setCadastro({ aberto: true, chip: c, dono: null }), []);
  const abrirExclusao = useCallback((c: ChipFisicoRow) => setParaExcluir(c), []);
  const aoMudar       = useCallback(() => { void recarregar(); }, [recarregar]);

  function adicionar(dono: string | null) {
    // Sem dono indicado, o chip é de quem cadastra — se essa pessoa estiver entre
    // as escolhíveis. Fora delas (outro setor no filtro), o seletor abre vazio.
    const eu = meuId && (!escolhiveis || escolhiveis.some(p => p.id === meuId)) ? meuId : null;
    setCadastro({ aberto: true, chip: null, dono: dono ?? eu });
  }

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    const r = await excluirChipFisico(paraExcluir.id);
    setExcluindo(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir o chip.'); return; }
    toast.success(`Chip ${mascararNumero(paraExcluir.numero)} excluído.`);
    setParaExcluir(null);
    void recarregar();
  }

  function filtrarStatus(s: FiltroStatusChip) {
    setFiltro(f => ({ ...f, status: f.status === s ? 'todos' : s }));
  }

  if (!habilitado) return null;

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!instalado) {
    return (
      <Card className="border-dashed">
        <CardContent className="space-y-2 py-12 text-center">
          <Database className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">Chips Físicos ainda não está no banco.</p>
          <p className="text-xs text-muted-foreground">
            Falta aplicar a migration <span className="font-mono">20260921160000_chips_fisicos.sql</span>.
          </p>
        </CardContent>
      </Card>
    );
  }

  const linha = (c: ChipFisicoRow) => (
    <LinhaChip
      key={c.id}
      chip={c}
      podeCuidar={podeCuidar(c)}
      onStatus={abrirStatus}
      onCorrigir={abrirCorrecao}
      onExcluir={abrirExclusao}
    />
  );

  const blocoDePessoa = (b: BlocoPessoa<ChipFisicoRow>, mostrarSetor: boolean) => (
    <BlocoPessoaChips
      key={b.pessoa.id}
      bloco={b}
      setorNome={mostrarSetor ? nomeDoSetor(b.pessoa.setor_id) : null}
      podeAdicionar={podeCuidarColegas || b.pessoa.id === meuId}
      onAdicionar={() => adicionar(b.pessoa.id)}
    >
      {b.chips.map(linha)}
    </BlocoPessoaChips>
  );

  // No alcance «todos» sem setor escolhido, os blocos vêm separados por setor.
  const porSetor = alcance === 'todos' && setorFiltro === TODOS_OS_SETORES
    ? agruparBlocosPorSetor(blocos, nomeDoSetor)
    : null;

  return (
    <div className="space-y-5">
      {/* ── Contadores (são o filtro) ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Filtrar por status">
        <Contador rotulo="Todos" valor={resumo.total} marcado={filtro.status === 'todos'}
                  onClick={() => setFiltro(f => ({ ...f, status: 'todos' }))} />
        {STATUS_CHIP.map(s => (
          <Contador
            key={s}
            rotulo={ROTULO_CONTADOR[s]}
            valor={resumo[s]}
            ponto={PONTO_STATUS_CHIP[s]}
            marcado={filtro.status === s}
            onClick={() => filtrarStatus(s)}
          />
        ))}
        <Contador
          rotulo="Tempo encerrado"
          valor={resumo.tempoEncerrado}
          ponto={PONTO_TEMPO_ENCERRADO}
          marcado={filtro.status === 'tempo_encerrado'}
          destaque={resumo.tempoEncerrado > 0}
          onClick={() => filtrarStatus('tempo_encerrado')}
        />
      </div>

      {/* ── Busca, setor e cadastro ───────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={filtro.busca}
            onChange={e => setFiltro(f => ({ ...f, busca: e.target.value }))}
            placeholder={visaoDeGrupo ? 'Buscar por número ou pessoa' : 'Buscar por número'}
            aria-label="Buscar chip"
            className="pl-8"
          />
        </div>
        {alcance === 'todos' && (
          <Select value={setorFiltro} onValueChange={setSetorFiltro}>
            <SelectTrigger className="sm:w-56" aria-label="Setor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_OS_SETORES}>Todos os setores</SelectItem>
              {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              <SelectItem value={SEM_SETOR}>Sem setor</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button onClick={() => adicionar(null)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> Adicionar chip
        </Button>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {/* ── A lista ───────────────────────────────────────────────────────── */}
      {visiveis.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="space-y-3 py-12 text-center">
            <Smartphone className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            {filtrando ? (
              <>
                <p className="text-sm text-muted-foreground">Nenhum chip com esse filtro.</p>
                <Button variant="outline" size="sm" onClick={() => setFiltro({ status: 'todos', busca: '' })}>
                  Limpar filtro
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {visaoDeGrupo
                    ? 'Ninguém cadastrou chip físico aqui ainda.'
                    : 'Você ainda não cadastrou nenhum chip físico.'}
                </p>
                <Button size="sm" onClick={() => adicionar(null)}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden /> Adicionar chip
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : !visaoDeGrupo ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Seus chips <span className="font-normal text-muted-foreground">({visiveis.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {blocos.flatMap(b => b.chips).map(linha)}
          </CardContent>
        </Card>
      ) : porSetor ? (
        <div className="space-y-6">
          {porSetor.map(g => (
            <section key={g.setorId ?? SEM_SETOR} className="space-y-3">
              <div className="flex items-baseline gap-2 border-b pb-1.5">
                <h2 className="text-base font-semibold">{g.nome}</h2>
                <span className="text-sm text-muted-foreground">
                  {plural(g.totalChips, 'chip', 'chips')} · {plural(g.blocos.length, 'pessoa', 'pessoas')}
                </span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {g.blocos.map(b => blocoDePessoa(b, false))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {blocos.map(b => blocoDePessoa(b, false))}
        </div>
      )}

      {/* ── Quem ainda não cadastrou ──────────────────────────────────────── */}
      {!filtrando && semChip.length > 0 && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <UserX className="h-4 w-4 text-muted-foreground" aria-hidden />
              Sem chip cadastrado ({semChip.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            {semChip.map(p => (
              podeCuidarColegas ? (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => adicionar(p.id)}
                  className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={`Adicionar chip para ${p.nome}`}
                >
                  <MiniAvatar nome={p.nome} foto={p.foto_url} />
                  {p.nome}
                  <Plus className="h-3 w-3 text-muted-foreground" aria-hidden />
                </button>
              ) : (
                <span key={p.id} className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs">
                  <MiniAvatar nome={p.nome} foto={p.foto_url} />
                  {p.nome}
                </span>
              )
            ))}
          </CardContent>
        </Card>
      )}

      <DialogoChipFisico
        aberto={cadastro.aberto}
        chip={cadastro.chip}
        donoInicial={cadastro.dono}
        pessoasEscolhiveis={escolhiveis}
        onFechar={() => setCadastro(CADASTRO_FECHADO)}
        onSalvo={aoMudar}
      />

      <DialogoStatusChip chip={paraStatus} onFechar={() => setParaStatus(null)} onSalvo={aoMudar} />

      <AlertDialog open={paraExcluir !== null} onOpenChange={a => { if (!a && !excluindo) setParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir chip?</AlertDialogTitle>
            <AlertDialogDescription>
              {paraExcluir
                ? `${mascararNumero(paraExcluir.numero)}${paraExcluir.operador_id !== meuId && nomeDe(paraExcluir.operador_id)
                    ? ` (${nomeDe(paraExcluir.operador_id)})` : ''} sai da lista e não volta. `
                  + 'Use quando o chip não está mais com a pessoa.'
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); void excluir(); }}
              disabled={excluindo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir chip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Peças ───────────────────────────────────────────────────────────────────

function Contador({
  rotulo, valor, ponto, marcado, destaque, onClick,
}: {
  rotulo: string; valor: number; ponto?: string; marcado: boolean;
  destaque?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={marcado}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start rounded-lg border bg-card px-3 py-2 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        marcado ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted/60',
      )}
    >
      <span className="text-2xl font-semibold leading-tight tabular-nums">{valor}</span>
      <span className={cn(
        'flex items-center gap-1.5 text-xs',
        destaque ? 'font-medium text-sky-700 dark:text-sky-300' : 'text-muted-foreground',
      )}>
        {ponto && <span className={cn('h-2 w-2 rounded-full', ponto)} aria-hidden />}
        {rotulo}
      </span>
    </button>
  );
}

function MiniAvatar({ nome, foto }: { nome: string; foto: string | null }) {
  return (
    <Avatar className="h-5 w-5">
      {foto && <AvatarImage src={foto} alt="" />}
      <AvatarFallback className="bg-primary/10 text-[9px] font-semibold text-primary">
        {iniciaisDe(nome)}
      </AvatarFallback>
    </Avatar>
  );
}

function BlocoPessoaChips({
  bloco, setorNome, podeAdicionar, onAdicionar, children,
}: {
  bloco: BlocoPessoa<ChipFisicoRow>;
  setorNome: string | null;
  podeAdicionar: boolean;
  onAdicionar: () => void;
  children: ReactNode;
}) {
  const { pessoa, chips } = bloco;
  const conta: Record<StatusChip, number> = { ativo: 0, restricao: 0, banido: 0, recuperar: 0 };
  for (const c of chips) conta[c.status] += 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            {pessoa.foto_url && <AvatarImage src={pessoa.foto_url} alt={pessoa.nome} />}
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {iniciaisDe(pessoa.nome)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{pessoa.nome}</CardTitle>
            <p className="flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground">
              {setorNome && <span>{setorNome}</span>}
              {STATUS_CHIP.filter(s => conta[s] > 0).map(s => (
                <span key={s} className="flex items-center gap-1 tabular-nums">
                  <span className={cn('h-1.5 w-1.5 rounded-full', PONTO_STATUS_CHIP[s])} aria-hidden />
                  {conta[s]} {rotuloContagem(s, conta[s])}
                </span>
              ))}
            </p>
          </div>
          {podeAdicionar && (
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onAdicionar}
                    aria-label={`Adicionar chip para ${pessoa.nome}`} title="Adicionar chip">
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">{children}</CardContent>
    </Card>
  );
}

interface GrupoSetor {
  setorId: string | null;
  nome: string;
  totalChips: number;
  blocos: BlocoPessoa<ChipFisicoRow>[];
}

function agruparBlocosPorSetor(
  blocos: BlocoPessoa<ChipFisicoRow>[],
  nomeDoSetor: (id: string | null) => string,
): GrupoSetor[] {
  const grupos = new Map<string, GrupoSetor>();
  for (const b of blocos) {
    const id = b.pessoa.setor_id;
    const chave = id ?? SEM_SETOR;
    let g = grupos.get(chave);
    if (!g) {
      g = { setorId: id, nome: nomeDoSetor(id), totalChips: 0, blocos: [] };
      grupos.set(chave, g);
    }
    g.blocos.push(b);
    g.totalChips += b.chips.length;
  }
  // «Sem setor» por último; os demais por nome.
  return [...grupos.values()].sort((a, z) =>
    (a.setorId === null ? 1 : 0) - (z.setorId === null ? 1 : 0)
    || a.nome.localeCompare(z.nome, 'pt-BR'));
}
