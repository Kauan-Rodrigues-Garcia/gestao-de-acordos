/**
 * Metas do Comercial — duas réguas, e só uma decide.
 *
 * ## A régua é a primeira escolha, não a última
 *
 * «Tem setores que a meta são definidas por vendas — fez 10 vendas bateu a meta
 * — e tem setores que são divididos por valores.» Então a linha começa pela
 * pergunta «como este setor é medido?», e os dois campos ficam ao lado: o da
 * régua em destaque, o outro como segunda leitura.
 *
 * Os dois são gravados mesmo assim. Um setor medido por valor que bate o
 * dinheiro com metade das vendas está vendendo caro; um que bate a quantidade e
 * não o valor, barato. Guardar só a régua escolhida apagaria essa leitura.
 *
 * ## Tela própria, e não a Metas da cobrança
 *
 * A de lá tem quartis, dias úteis, metas extras, validação por setor e
 * treinamento de equipe — 1.573 linhas de vocabulário que não é de Vendas.
 * Aqui são três campos por linha.
 *
 * ## Dias úteis e meta por operador (02/10/2026)
 *
 * Pedido: «em metas tem que colocar dias úteis também ser configurado, colocar
 * também para configurar meta de operadores sem ser no geral como está, pois
 * tem operadores também que tem meta proporcional».
 *
 *   - **Dias úteis do mês**: feriados e se o sábado conta
 *     (`vendas_calendario_mes`). Todas as telas do Comercial contam por ele —
 *     ver `useCalendarioVendas`.
 *   - **Operadores**: a meta individual (`metas.tipo = 'operador'`), que o
 *     painel já lia desde a migration 20261002120000 mas ninguém conseguia
 *     gravar pela tela. Com meta em lote para os marcados e a meta
 *     PROPORCIONAL de quem começa no meio do mês: a meta cheia vezes os dias
 *     úteis que sobram desde o início da pessoa.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Target, Building2, Users, TriangleAlert, Info, CalendarDays, X, UserRound, Search, Divide,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { formatDate } from '@/lib/index';
import { partesDoMes, rotuloDoMes } from '@/lib/mesReferencia';
import { formatBRL, parseBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { REGUA_LABEL, type ReguaMeta } from '@/lib/vendasMeta';
import {
  CALENDARIO_PADRAO, diasUteisComercial, diasUteisDesdeComercial, metaProporcional,
  type CalendarioDoMes,
} from '@/lib/vendasCalendario';
import {
  buscarMetasDoMes, buscarMetasIndividuaisDoMes, salvarMeta,
  type MetaDeRecorte, type MetaIndividual,
} from '@/services/vendas/metasVendas.service';
import { buscarCalendario, salvarCalendario } from '@/services/vendas/calendarioVendas.service';
import { buscarPessoasDoPlacar, type PessoaComAusencia } from '@/services/vendas/placar.service';

/** O `Select` do shadcn recusa `value=""`; «sem régua» precisa de um valor. */
const SEM_REGUA = '__sem_regua__';
const TODOS = '__todos__';

type Rascunho = { regua: ReguaMeta | null; quantidade: string; valor: string };

/** Uma linha da tela: setor, equipe ou operador, com a meta gravada (ou zeros). */
type LinhaDeMeta = Pick<MetaDeRecorte, 'referencia_id' | 'nome' | 'setor_id' | 'setor_nome' | 'regua' | 'quantidade' | 'valor'> & {
  tipo: 'setor' | 'equipe' | 'operador';
  /** Só no operador: a equipe, para a linha dizer de onde a pessoa é. */
  equipe_nome?: string | null;
};

function chaveDe(m: Pick<LinhaDeMeta, 'tipo' | 'referencia_id'>): string {
  return `${m.tipo}:${m.referencia_id}`;
}

/**
 * O número no formato que `parseBRL` lê de volta.
 *
 * `String(962136.5)` dá «962136.5», e `parseBRL` lê ponto sem vírgula como
 * milhar: 9.621.365. Escrever com vírgula decimal fecha a volta.
 */
function paraCampo(v: number, decimais: boolean): string {
  if (!(v > 0)) return '';
  return decimais
    ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(Math.trunc(v));
}

function lerRascunho(d: Rascunho): { quantidade: number; valor: number } {
  return {
    quantidade: d.quantidade.trim() === '' ? 0 : Math.trunc(parseBRL(d.quantidade)),
    valor: d.valor.trim() === '' ? 0 : parseBRL(d.valor),
  };
}

function normalizar(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export default function MetasVendas() {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();

  const empresaId = empresa?.id ?? null;
  const podeEditar = temPermissao('editar_metas_vendas');
  const { ano, mes: mesNum } = partesDoMes(mes);

  const [linhas, setLinhas] = useState<MetaDeRecorte[]>([]);
  const [individuais, setIndividuais] = useState<MetaIndividual[]>([]);
  const [pessoas, setPessoas] = useState<PessoaComAusencia[]>([]);
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoIndividual, setAvisoIndividual] = useState<string | null>(null);

  // ── Calendário ──────────────────────────────────────────────────────────
  const [calendario, setCalendario] = useState<CalendarioDoMes>(CALENDARIO_PADRAO);
  const [calSalvo, setCalSalvo] = useState<CalendarioDoMes>(CALENDARIO_PADRAO);
  const [feriadoNovo, setFeriadoNovo] = useState('');
  const [salvandoCal, setSalvandoCal] = useState(false);

  // ── Operadores ──────────────────────────────────────────────────────────
  const [busca, setBusca] = useState('');
  const [filtroSetor, setFiltroSetor] = useState(TODOS);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set());
  const [lote, setLote] = useState<Rascunho>({ regua: 'quantidade', quantidade: '', valor: '' });
  const [aplicandoLote, setAplicandoLote] = useState(false);
  /** Operador com a calculadora de proporcional aberta, e a data de início. */
  const [proporcional, setProporcional] = useState<{ id: string; inicio: string } | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    const [r, ind, placar, cal] = await Promise.all([
      buscarMetasDoMes(empresaId, ano, mesNum),
      buscarMetasIndividuaisDoMes(empresaId, ano, mesNum),
      buscarPessoasDoPlacar(empresaId, mes),
      buscarCalendario(empresaId, ano, mesNum),
    ]);
    setCarregando(false);
    setCalendario(cal);
    setCalSalvo(cal);
    setPessoas(placar.pessoas);
    if (!r.ok) { setErro(r.erro); setLinhas([]); return; }
    setErro(null);
    setLinhas(r.dado ?? []);
    setIndividuais(ind.dado ?? []);
    setAvisoIndividual(ind.ok ? null : ind.erro);
    // O rascunho nasce do que está gravado: editar uma linha não deve exigir
    // redigitar o que já estava lá.
    const base: Record<string, Rascunho> = {};
    for (const l of r.dado ?? []) {
      base[chaveDe(l)] = {
        regua: l.regua,
        quantidade: paraCampo(l.quantidade, false),
        valor: paraCampo(l.valor, true),
      };
    }
    for (const i of ind.dado ?? []) {
      base[chaveDe({ tipo: 'operador', referencia_id: i.perfil_id })] = {
        regua: i.regua,
        quantidade: paraCampo(i.quantidade, false),
        valor: paraCampo(i.valor, true),
      };
    }
    setRascunhos(base);
  }, [empresaId, ano, mesNum, mes]);

  useEffect(() => { void carregar(); }, [carregar]);
  // Trocar de mês esquece o que estava marcado e a calculadora aberta.
  useEffect(() => { setMarcados(new Set()); setProporcional(null); }, [mes]);

  const setores = useMemo(() => linhas.filter(l => l.tipo === 'setor'), [linhas]);
  const equipes = useMemo(() => linhas.filter(l => l.tipo === 'equipe'), [linhas]);

  /** Gente que pode ter meta: nem robô, nem desligado. Com a meta gravada ao lado. */
  const operadores = useMemo((): LinhaDeMeta[] => {
    const porId = new Map(individuais.map(i => [i.perfil_id, i]));
    return pessoas
      .filter(p => !p.robo && p.situacao !== 'desligado')
      .map(p => {
        const i = porId.get(p.id);
        return {
          tipo: 'operador' as const,
          referencia_id: p.id,
          nome: p.nome,
          setor_id: p.setor_id,
          setor_nome: p.setor_nome,
          equipe_nome: p.equipe_nome,
          regua: i?.regua ?? null,
          quantidade: i?.quantidade ?? 0,
          valor: i?.valor ?? 0,
        };
      })
      .sort((a, b) => (a.setor_nome ?? '').localeCompare(b.setor_nome ?? '', 'pt-BR')
        || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [pessoas, individuais]);

  const setoresDosOperadores = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const o of operadores) if (o.setor_id) mapa.set(o.setor_id, o.setor_nome ?? 'Sem nome');
    return [...mapa].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [operadores]);

  const operadoresVisiveis = useMemo(() => {
    const termo = normalizar(busca);
    return operadores.filter(o =>
      (filtroSetor === TODOS || o.setor_id === filtroSetor)
      && (!termo || normalizar(`${o.nome} ${o.equipe_nome ?? ''} ${o.setor_nome ?? ''}`).includes(termo)));
  }, [operadores, busca, filtroSetor]);

  function mudar(k: string, campo: keyof Rascunho, v: string | ReguaMeta | null) {
    setRascunhos(r => ({
      ...r,
      [k]: { ...(r[k] ?? { regua: null, quantidade: '', valor: '' }), [campo]: v } as Rascunho,
    }));
  }

  async function gravar(l: LinhaDeMeta) {
    if (!empresaId) return;
    const k = chaveDe(l);
    const d = rascunhos[k];
    if (!d) return;
    const { quantidade, valor } = lerRascunho(d);

    setSalvando(k);
    const r = await salvarMeta({
      empresaId, tipo: l.tipo, referenciaId: l.referencia_id,
      ano, mes: mesNum, regua: d.regua, quantidade, valor,
    });
    setSalvando(null);

    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar a meta.'); return; }
    toast.success(d.regua === null && quantidade === 0 && valor === 0
      ? `Meta de ${l.nome} removida.`
      : `Meta de ${l.nome} salva.`);
    await carregar();
  }

  // ── Calendário: gravar ──────────────────────────────────────────────────
  const uteisDoMes = useMemo(() => diasUteisComercial(ano, mesNum, calendario), [ano, mesNum, calendario]);
  const calMudou = calendario.sabadoUtil !== calSalvo.sabadoUtil
    || calendario.feriados.join() !== calSalvo.feriados.join();

  function adicionarFeriado() {
    const d = feriadoNovo;
    if (!d) return;
    if (d.slice(0, 7) !== mes) { toast.error(`O feriado tem de ser de ${rotuloDoMes(mes)}.`); return; }
    if (calendario.feriados.includes(d)) { setFeriadoNovo(''); return; }
    setCalendario(c => ({ ...c, feriados: [...c.feriados, d].sort() }));
    setFeriadoNovo('');
  }

  async function gravarCalendario() {
    if (!empresaId) return;
    setSalvandoCal(true);
    const r = await salvarCalendario({ empresaId, ano, mes: mesNum, calendario });
    setSalvandoCal(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar os dias úteis.'); return; }
    setCalSalvo(calendario);
    toast.success(`Dias úteis de ${rotuloDoMes(mes)} salvos: ${uteisDoMes}.`);
  }

  // ── Operadores: lote e proporcional ─────────────────────────────────────
  const todosVisiveisMarcados = operadoresVisiveis.length > 0
    && operadoresVisiveis.every(o => marcados.has(o.referencia_id));

  function alternarTodos() {
    setMarcados(prev => {
      const novo = new Set(prev);
      if (todosVisiveisMarcados) operadoresVisiveis.forEach(o => novo.delete(o.referencia_id));
      else operadoresVisiveis.forEach(o => novo.add(o.referencia_id));
      return novo;
    });
  }

  async function aplicarLote() {
    if (!empresaId || marcados.size === 0) return;
    const { quantidade, valor } = lerRascunho(lote);
    const alvo = operadores.filter(o => marcados.has(o.referencia_id));
    setAplicandoLote(true);
    let ok = 0;
    const falhas: string[] = [];
    for (const o of alvo) {
      const r = await salvarMeta({
        empresaId, tipo: 'operador', referenciaId: o.referencia_id,
        ano, mes: mesNum, regua: lote.regua, quantidade, valor,
      });
      if (r.ok) ok += 1; else falhas.push(`${o.nome}: ${r.erro ?? 'erro'}`);
    }
    setAplicandoLote(false);
    if (falhas.length > 0) toast.error(`${falhas.length} não salvaram. ${falhas[0]}`);
    if (ok > 0) toast.success(`Meta aplicada a ${ok} ${ok === 1 ? 'operador' : 'operadores'}.`);
    setMarcados(new Set());
    await carregar();
  }

  /** A meta cheia que a proporcional reduz: a da própria linha, ou a do lote. */
  function metaCheiaDe(k: string): { regua: ReguaMeta | null; quantidade: number; valor: number } {
    const d = rascunhos[k];
    const daLinha = d ? lerRascunho(d) : { quantidade: 0, valor: 0 };
    if (daLinha.quantidade > 0 || daLinha.valor > 0) return { regua: d?.regua ?? null, ...daLinha };
    return { regua: lote.regua, ...lerRascunho(lote) };
  }

  function aplicarProporcional(o: LinhaDeMeta, inicio: string) {
    const k = chaveDe(o);
    const cheia = metaCheiaDe(k);
    if (cheia.quantidade <= 0 && cheia.valor <= 0) {
      toast.error('Preencha a meta cheia na linha (ou no lote) antes de calcular a proporcional.');
      return;
    }
    const dias = diasUteisDesdeComercial(ano, mesNum, inicio, calendario);
    const prop = metaProporcional(cheia, dias, uteisDoMes);
    setRascunhos(r => ({
      ...r,
      [k]: {
        regua: cheia.regua ?? r[k]?.regua ?? 'quantidade',
        quantidade: paraCampo(prop.quantidade, false),
        valor: paraCampo(prop.valor, true),
      },
    }));
    setProporcional(null);
    toast.info(`${o.nome}: ${dias} de ${uteisDoMes} dias úteis. Confira e clique em Salvar.`);
  }

  /* ── Uma linha de meta ──────────────────────────────────────────────────
   *
   * Função que devolve JSX, e não componente declarado aqui dentro: um
   * componente criado a cada render é OUTRO componente a cada render, e o
   * React desmontava o campo a cada tecla — o cursor saía do campo depois do
   * primeiro dígito.
   */
  function renderLinha(l: LinhaDeMeta) {
    const k = chaveDe(l);
    const d = rascunhos[k] ?? { regua: null, quantidade: '', valor: '' };
    const atual = lerRascunho(d);
    const mudou = d.regua !== l.regua || atual.quantidade !== l.quantidade || atual.valor !== l.valor;
    const ehOperador = l.tipo === 'operador';
    const calcAberta = proporcional?.id === l.referencia_id;

    return (
      <div key={k} className="border-b border-border/60 px-3 py-2.5 last:border-b-0">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          {ehOperador && podeEditar && (
            <Checkbox
              className="mb-2"
              checked={marcados.has(l.referencia_id)}
              aria-label={`Marcar ${l.nome}`}
              onCheckedChange={v => setMarcados(prev => {
                const novo = new Set(prev);
                if (v === true) novo.add(l.referencia_id); else novo.delete(l.referencia_id);
                return novo;
              })}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{l.nome}</p>
            {l.tipo === 'equipe' && (
              <p className="truncate text-[11px] text-muted-foreground">{l.setor_nome ?? 'sem setor'}</p>
            )}
            {ehOperador && (
              <p className="truncate text-[11px] text-muted-foreground">
                {[l.equipe_nome, l.setor_nome].filter(Boolean).join(' · ') || 'sem equipe'}
                {!l.regua && ' · usa a parte dele na meta da equipe'}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] uppercase tracking-wide text-muted-foreground" htmlFor={`regua-${k}`}>
              Medido por
            </label>
            <Select
              value={d.regua ?? SEM_REGUA}
              disabled={!podeEditar}
              onValueChange={v => mudar(k, 'regua', v === SEM_REGUA ? null : (v as ReguaMeta))}>
              <SelectTrigger id={`regua-${k}`} className="h-8 w-[190px] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_REGUA}>Não definido</SelectItem>
                <SelectItem value="quantidade">{REGUA_LABEL.quantidade}</SelectItem>
                <SelectItem value="valor">{REGUA_LABEL.valor}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] uppercase tracking-wide text-muted-foreground" htmlFor={`qtd-${k}`}>
              Vendas
            </label>
            <Input
              id={`qtd-${k}`} value={d.quantidade} inputMode="numeric" disabled={!podeEditar}
              onChange={e => mudar(k, 'quantidade', e.target.value)}
              placeholder={ehOperador ? '12' : '161'}
              className={cn('h-8 w-24 text-[12px]', d.regua === 'quantidade' && 'border-primary/50 bg-primary/[0.04]')}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] uppercase tracking-wide text-muted-foreground" htmlFor={`val-${k}`}>
              Faturamento
            </label>
            <Input
              id={`val-${k}`} value={d.valor} inputMode="decimal" disabled={!podeEditar}
              onChange={e => mudar(k, 'valor', e.target.value)}
              placeholder={ehOperador ? '70.000,00' : '962.136,00'}
              className={cn('h-8 w-32 text-[12px]', d.regua === 'valor' && 'border-primary/50 bg-primary/[0.04]')}
            />
          </div>

          <div className="flex items-center gap-2">
            {podeEditar ? (
              <>
                {ehOperador && (
                  <Button
                    size="sm" variant="outline" className="h-8 gap-1 text-[12px]"
                    title="Meta proporcional aos dias úteis a partir do início da pessoa"
                    onClick={() => setProporcional(calcAberta ? null : { id: l.referencia_id, inicio: `${mes}-01` })}>
                    <Divide className="h-3.5 w-3.5" /> Proporcional
                  </Button>
                )}
                <Button size="sm" className="h-8 text-[12px]" disabled={!mudou || salvando === k} onClick={() => void gravar(l)}>
                  {salvando === k ? 'Salvando…' : 'Salvar'}
                </Button>
              </>
            ) : l.regua ? (
              <Badge variant="outline" className="text-[10px]">
                {l.regua === 'quantidade' ? `${l.quantidade} vendas` : formatBRL(l.valor)}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30 text-[10px]">
                Sem meta
              </Badge>
            )}
          </div>
        </div>

        {calcAberta && proporcional && (
          <div className="mt-2 flex flex-wrap items-end gap-3 rounded-lg border border-primary/30 bg-primary/[0.03] px-3 py-2">
            <div className="space-y-1">
              <label className="block text-[10px] uppercase tracking-wide text-muted-foreground" htmlFor={`ini-${k}`}>
                Começa a contar em
              </label>
              <Input
                id={`ini-${k}`} type="date" className="h-8 w-40 text-[12px]"
                value={proporcional.inicio}
                min={`${mes}-01`} max={`${mes}-31`}
                onChange={e => setProporcional({ id: l.referencia_id, inicio: e.target.value })}
              />
            </div>
            <p className="pb-1.5 text-[11px] text-muted-foreground">
              {proporcional.inicio
                ? `${diasUteisDesdeComercial(ano, mesNum, proporcional.inicio, calendario)} de ${uteisDoMes} dias úteis`
                : 'Escolha a data'}
              {' · '}base: {(() => {
                const c = metaCheiaDe(k);
                if (c.quantidade <= 0 && c.valor <= 0) return 'preencha a meta cheia';
                return [c.quantidade > 0 ? `${c.quantidade} vendas` : null, c.valor > 0 ? formatBRL(c.valor) : null]
                  .filter(Boolean).join(' / ');
              })()}
            </p>
            <Button size="sm" className="h-8 text-[12px]" disabled={!proporcional.inicio}
              onClick={() => aplicarProporcional(l, proporcional.inicio)}>
              Calcular
            </Button>
          </div>
        )}
      </div>
    );
  }

  const semRegua = linhas.filter(l => !l.regua).length;
  const comMetaIndividual = operadores.filter(o => o.regua).length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <Target className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Metas de vendas</h1>
            <p className="text-[12px] text-muted-foreground">{rotuloDoMes(mes)}</p>
          </div>
        </div>
        <SeletorMes mes={mes} onChange={setMes} desabilitado={carregando} />
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div>{erro}</div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <strong className="text-foreground">Só a régua escolhida decide</strong> se a meta
          bateu. A outra continua sendo calculada e aparece ao lado: um setor que bate o
          faturamento com metade das vendas está vendendo caro; um que bate a quantidade e não o
          valor, barato.
          {semRegua > 0 && (
            <p className="mt-1">
              <strong className="text-foreground">{semRegua}</strong>{' '}
              {semRegua === 1 ? 'recorte ainda não tem' : 'recortes ainda não têm'} régua
              definida — {semRegua === 1 ? 'ele não bate' : 'eles não batem'} meta nenhuma até
              alguém escolher.
            </p>
          )}
        </div>
      </div>

      {/* ── Dias úteis do mês ─────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-[13px] font-semibold">Dias úteis</h2>
          <Badge variant="outline" className="text-[10px]">{uteisDoMes} em {rotuloDoMes(mes)}</Badge>
          <p className="ml-auto text-[11px] text-muted-foreground">
            Divide a meta por dia em Vendas, nos painéis e no Dashboard.
          </p>
        </header>
        <div className="space-y-3 px-3 py-3">
          <label className="flex items-center gap-2 text-[12px]">
            <Checkbox
              checked={calendario.sabadoUtil} disabled={!podeEditar}
              onCheckedChange={v => setCalendario(c => ({ ...c, sabadoUtil: v === true }))}
            />
            Sábado conta como dia útil
          </label>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Feriados e dias sem expediente</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {calendario.feriados.length === 0 && (
                <span className="text-[12px] text-muted-foreground">Nenhum neste mês.</span>
              )}
              {calendario.feriados.map(f => (
                <span key={f} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[12px]">
                  {formatDate(f)}
                  {podeEditar && (
                    <button
                      type="button" aria-label={`Tirar ${formatDate(f)}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setCalendario(c => ({ ...c, feriados: c.feriados.filter(x => x !== f) }))}>
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {podeEditar && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date" value={feriadoNovo} className="h-8 w-40 text-[12px]"
                  min={`${mes}-01`} max={`${mes}-31`}
                  onChange={e => setFeriadoNovo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') adicionarFeriado(); }}
                />
                <Button size="sm" variant="outline" className="h-8 text-[12px]" disabled={!feriadoNovo} onClick={adicionarFeriado}>
                  Adicionar
                </Button>
                <Button size="sm" className="ml-auto h-8 text-[12px]" disabled={!calMudou || salvandoCal}
                  onClick={() => void gravarCalendario()}>
                  {salvandoCal ? 'Salvando…' : 'Salvar dias úteis'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-[13px] font-semibold">Setores</h2>
          <Badge variant="outline" className="text-[10px]">{setores.length}</Badge>
        </header>
        {setores.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            {carregando ? 'Carregando…' : 'Nenhum setor ativo nesta empresa.'}
          </p>
        ) : setores.map(l => renderLinha(l))}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-[13px] font-semibold">Equipes</h2>
          <Badge variant="outline" className="text-[10px]">{equipes.length}</Badge>
        </header>
        {equipes.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            {carregando ? 'Carregando…' : 'Nenhuma equipe cadastrada ainda.'}
          </p>
        ) : equipes.map(l => renderLinha(l))}
      </section>

      {/* ── Operadores ────────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-[13px] font-semibold">Operadores</h2>
          <Badge variant="outline" className="text-[10px]">{comMetaIndividual} com meta própria</Badge>
          <p className="ml-auto text-[11px] text-muted-foreground">
            Quem não tem meta própria é medido pela parte dele na meta da equipe.
          </p>
        </header>

        {avisoIndividual && (
          <div className="flex items-start gap-2 border-b border-border bg-amber-500/5 px-3 py-2 text-[12px]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div>{avisoIndividual}</div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar operador"
              className="h-8 pl-8 text-[12px]" />
          </div>
          {setoresDosOperadores.length > 1 && (
            <Select value={filtroSetor} onValueChange={setFiltroSetor}>
              <SelectTrigger className="h-8 w-44 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os setores</SelectItem>
                {setoresDosOperadores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {podeEditar && operadoresVisiveis.length > 0 && (
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Checkbox checked={todosVisiveisMarcados} onCheckedChange={alternarTodos} />
              Marcar os {operadoresVisiveis.length} da lista
            </label>
          )}
        </div>

        {podeEditar && marcados.size > 0 && (
          <div className="flex flex-wrap items-end gap-3 border-b border-border/60 bg-primary/[0.03] px-3 py-2.5">
            <p className="w-full text-[12px] font-medium">
              Meta para os {marcados.size} {marcados.size === 1 ? 'marcado' : 'marcados'}
            </p>
            <Select value={lote.regua ?? SEM_REGUA}
              onValueChange={v => setLote(l => ({ ...l, regua: v === SEM_REGUA ? null : (v as ReguaMeta) }))}>
              <SelectTrigger className="h-8 w-[190px] text-[12px]" aria-label="Régua do lote"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_REGUA}>Não definido (remove)</SelectItem>
                <SelectItem value="quantidade">{REGUA_LABEL.quantidade}</SelectItem>
                <SelectItem value="valor">{REGUA_LABEL.valor}</SelectItem>
              </SelectContent>
            </Select>
            <Input value={lote.quantidade} inputMode="numeric" placeholder="Vendas" aria-label="Vendas do lote"
              onChange={e => setLote(l => ({ ...l, quantidade: e.target.value }))} className="h-8 w-24 text-[12px]" />
            <Input value={lote.valor} inputMode="decimal" placeholder="Faturamento" aria-label="Faturamento do lote"
              onChange={e => setLote(l => ({ ...l, valor: e.target.value }))} className="h-8 w-32 text-[12px]" />
            <Button size="sm" className="h-8 text-[12px]" disabled={aplicandoLote} onClick={() => void aplicarLote()}>
              {aplicandoLote ? 'Aplicando…' : 'Aplicar aos marcados'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-[12px]" onClick={() => setMarcados(new Set())}>
              Desmarcar
            </Button>
          </div>
        )}

        {operadoresVisiveis.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            {carregando ? 'Carregando…' : operadores.length === 0 ? 'Nenhum operador no seu alcance.' : 'Ninguém com esse filtro.'}
          </p>
        ) : operadoresVisiveis.map(o => renderLinha(o))}
      </section>
    </div>
  );
}
