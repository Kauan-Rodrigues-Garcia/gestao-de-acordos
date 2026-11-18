/**
 * O desenho da aba Banco de Horas, a partir do que a página buscou (ver
 * `index.tsx`). Separado para o laboratório poder desenhar a mesma tela com
 * dados fictícios.
 */
import {
  CalendarClock, CalendarDays, Clock, Info, FileSpreadsheet, ImageIcon, LayoutGrid, Link2, Loader2, RefreshCw,
  Search, ShieldCheck, Upload, Users, Building2, TriangleAlert, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { setoresDosFiltros } from '@/lib/setoresDosFiltros';
import { cn } from '@/lib/utils';
import { useSubAbaUso } from '@/providers/RastreioUsoProvider';
import {
  avisos as montarAvisos, montarVisao, ordemNatural, passaSituacao, type FiltroSituacao, type Pessoa,
} from '@/lib/bancoHoras/calculos';
import { abasDoBancoDeHoras, baixarExcel, type AbaExcel } from '@/lib/bancoHoras/excel';
import { data as fmtData, diaMes, mesCurto, normalizar } from '@/lib/bancoHoras/formato';
import type { ModoImagem } from '@/lib/bancoHoras/imagem';
import { montarLote } from '@/lib/bancoHoras/importacao';
import { lerArquivos } from '@/lib/bancoHoras/leitor';
import type { SetorParaGravar } from '@/lib/bancoHoras/tipos';
import { importarBancoHoras, type ResultadoImportacao } from '@/services/bancoHoras/bancoHoras.service';
import { semVinculo, setoresDoDp } from '@/services/bancoHoras/vinculos';
import type { AbaBH, ContextoBH, Periodo } from './contexto';
import { DialogExcel, DialogImagem, DialogImportar, DialogPessoa, type ResultadoDoLote } from './Dialogos';
import { Segmentado } from './partes';
import { Pessoas } from './Pessoas';
import { Relatorios } from './Relatorios';
import { Setores } from './Setores';
import { Situacao } from './Situacao';
import { Vencimentos } from './Vencimentos';
import { VincularSetoresBH } from './VincularSetores';
import type { useBancoHoras } from './useBancoHoras';
import { VisaoGeral } from './VisaoGeral';

const TODOS = '__todos__';
const ABAS_VALIDAS: AbaBH[] = ['geral', 'situacao', 'pessoas', 'setores', 'vencimentos', 'relatorios'];

function lerPeriodo(): Periodo {
  try { return localStorage.getItem('bh.periodo') === 'todos' ? 'todos' : '3'; } catch { return '3'; }
}

function lerLimite(): number {
  try { const v = Number(localStorage.getItem('bh.limite')); return v > 0 ? v : 40; } catch { return 40; }
}

export interface PropsPainel {
  empresaId: string;
  setorProprioId: string | null;
  veTodos: boolean;
  veSetor: boolean;
  temAlcance: boolean;
  gerenciar: boolean;
  carregandoPermissoes: boolean;
  dados: ReturnType<typeof useBancoHoras>;
  fotos: Map<string, string>;
  setoresGestao: { id: string; nome: string; ativo?: boolean | null; tipo?: string | null }[];
}

export function PainelBancoHoras({
  empresaId, setorProprioId, veTodos, veSetor, temAlcance, gerenciar, carregandoPermissoes, dados, fotos, setoresGestao,
}: PropsPainel) {
  const { posicoes, vinculos, recarregar } = dados;
  const [params, setParams] = useSearchParams();
  const abaUrl = params.get('aba') as AbaBH | null;
  const aba: AbaBH = abaUrl && ABAS_VALIDAS.includes(abaUrl) ? abaUrl : 'geral';
  useSubAbaUso(aba);
  const trocarAba = useCallback((k: AbaBH) => {
    setParams(p => { const n = new URLSearchParams(p); if (k === 'geral') n.delete('aba'); else n.set('aba', k); return n; }, { replace: true });
  }, [setParams]);

  const [dataSel, setDataSel] = useState<string | null>(null);
  const [sit, setSit] = useState<FiltroSituacao>('todas');
  const [setorFiltro, setSetorFiltro] = useState('');
  const [busca, setBusca] = useState('');
  // Meses em que as horas foram feitas: «Últimos 3 meses» ou «Todos», e cada
  // mês pode ser tirado e recolocado (`tirados`). Como no painel antigo.
  const [periodo, setPeriodoEstado] = useState<Periodo>(lerPeriodo);
  const [tirados, setTirados] = useState<Set<string>>(new Set());
  const setPeriodo = useCallback((p: Periodo) => {
    setPeriodoEstado(p);
    setTirados(new Set());
    try { localStorage.setItem('bh.periodo', p); } catch { /* vale só nesta visita */ }
  }, []);
  const [limite, setLimiteEstado] = useState(lerLimite);
  const setLimite = useCallback((h: number) => {
    setLimiteEstado(h);
    try { localStorage.setItem('bh.limite', String(h)); } catch { /* sem armazenamento: vale só nesta visita */ }
  }, []);
  const [pessoaAberta, setPessoaAberta] = useState<Pessoa | null>(null);
  const [importarAberto, setImportarAberto] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDoLote | null>(null);
  const [excelAberto, setExcelAberto] = useState(false);
  const [imagem, setImagem] = useState<{ setor: string; modo: ModoImagem } | null>(null);
  const [ligando, setLigando] = useState(false);
  // ── O relatório em tela e o recorte ──────────────────────────────────────
  const pos = useMemo(() => posicoes.find(p => p.date === dataSel) ?? posicoes[posicoes.length - 1] ?? null, [posicoes, dataSel]);
  const anterior = useMemo(() => {
    if (!pos) return null;
    const i = posicoes.findIndex(p => p.date === pos.date);
    return i > 0 ? posicoes[i - 1] : null;
  }, [posicoes, pos]);
  const visao = useMemo(() => (pos ? montarVisao(pos) : null), [pos]);
  // Outro relatório, outros meses: volta a mostrar todos do período.
  const dataEmTela = pos?.date;
  useEffect(() => { setTirados(new Set()); }, [dataEmTela]);
  const mesesDisponiveis = useMemo(() => {
    if (!visao) return [];
    return periodo === '3' ? visao.ult3 : [...new Set([...visao.ult3, ...visao.meses])].sort();
  }, [visao, periodo]);
  const meses = useMemo(() => {
    const m = mesesDisponiveis.filter(x => !tirados.has(x));
    return m.length ? m : mesesDisponiveis;
  }, [mesesDisponiveis, tirados]);
  const alternarMes = useCallback((m: string) => {
    if (!tirados.has(m) && mesesDisponiveis.filter(x => !tirados.has(x)).length <= 1) {
      toast('Deixe pelo menos um mês marcado.');
      return;
    }
    setTirados(t => { const n = new Set(t); if (n.has(m)) n.delete(m); else n.add(m); return n; });
  }, [mesesDisponiveis, tirados]);
  const setoresNaVisao = useMemo(() => (visao ? [...new Set(visao.pessoas.map(p => p.setor))].sort(ordemNatural) : []), [visao]);
  useEffect(() => { if (setorFiltro && !setoresNaVisao.includes(setorFiltro)) setSetorFiltro(''); }, [setorFiltro, setoresNaVisao]);

  const base = useMemo(() => {
    if (!visao) return [];
    const q = normalizar(busca);
    return visao.pessoas.filter(p => (!setorFiltro || p.setor === setorFiltro)
      && (!q || normalizar(p.nome).includes(q) || p.mat.includes(busca.trim())));
  }, [visao, setorFiltro, busca]);
  const F = useMemo(() => base.filter(p => passaSituacao(p, sit)), [base, sit]);

  const fotoDe = useCallback((p: Pessoa) => fotos.get(normalizar(p.nome)) ?? null, [fotos]);
  const filtroTxt = [setorFiltro, busca.trim() && `«${busca.trim()}»`].filter(Boolean).join(' · ');
  const dp = useMemo(() => setoresDoDp(posicoes), [posicoes]);
  const faltando = useMemo(() => (gerenciar ? semVinculo(dp, vinculos) : []), [gerenciar, dp, vinculos]);
  const listaAvisos = useMemo(() => (visao && pos ? montarAvisos(visao, base, pos, anterior, {
    semFoto: base.filter(p => !fotoDe(p)).length, semVinculo: faltando.map(s => s.setorDp),
  }) : []), [visao, base, pos, anterior, fotoDe, faltando]);

  const excel = useCallback((abas: AbaExcel[], nome: string, L?: Pessoa[]) => {
    if (!visao) return;
    baixarExcel(nome, abasDoBancoDeHoras(new Set(abas), visao, L ?? base, sit, limite, filtroTxt, meses));
    toast.success('Excel baixado. Abra pela pasta Downloads.');
  }, [visao, base, sit, limite, filtroTxt, meses]);

  const ir = useCallback<ContextoBH['ir']>((destino, o) => {
    if (o?.sit) setSit(o.sit);
    if (o?.setor !== undefined) setSetorFiltro(o.setor);
    trocarAba(destino);
  }, [trocarAba]);

  // ── Importar ─────────────────────────────────────────────────────────────
  const aoArquivos = useCallback(async (arquivos: File[]) => {
    if (!empresaId || !arquivos.length) return;
    setImportando(true);
    try {
      const lote = montarLote(await lerArquivos(arquivos), new Set(posicoes.map(p => p.date)));
      const porData = new Map<string, SetorParaGravar[]>();
      for (const s of lote.gravar) porData.set(s.date, [...(porData.get(s.date) ?? []), s]);
      const res: Record<string, ResultadoImportacao> = {};
      for (const [dt, lista] of porData) res[dt] = await importarBancoHoras(empresaId, lista);
      await recarregar();
      if (lote.datas.size) setDataSel([...lote.datas.keys()].sort().pop() ?? null);
      setResultado({ lote, porData: res });
    } catch (e) {
      toast.error('Não foi possível importar', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setImportando(false);
    }
  }, [empresaId, posicoes, recarregar]);

  const posicaoPessoas = useCallback((d: string) => {
    const p = posicoes.find(x => x.date === d);
    if (!p) return null;
    return { setores: Object.keys(p.setores).length, pessoas: montarVisao(p).pessoas.length };
  }, [posicoes]);

  const nomeSetorProprio = setoresGestao.find(s => s.id === setorProprioId)?.nome;
  const nDev = F.filter(p => p.saldo < 0).length;
  const nVence = F.filter(p => p.vprox > 0).length;
  const abas: AbaSegmentada<AbaBH>[] = [
    { key: 'geral', label: 'Visão geral', Icon: LayoutGrid },
    { key: 'situacao', label: 'Situação', Icon: Users, badge: nDev },
    { key: 'pessoas', label: 'Pessoas', Icon: Users },
    { key: 'setores', label: 'Setores', Icon: Building2 },
    { key: 'vencimentos', label: 'Vencimentos', Icon: CalendarClock, badge: nVence },
    { key: 'relatorios', label: 'Relatórios', Icon: ShieldCheck, badge: listaAvisos.filter(a => a.tom === 'alerta').length },
  ];

  const ctx: ContextoBH | null = visao && pos ? {
    visao, pos, base, F, sit, limite, setLimite, filtroTxt, setorFiltro, fotoDe,
    meses, mesesPadrao: periodo === '3' && meses.length === mesesDisponiveis.length,
    abrirPessoa: setPessoaAberta, ir, excel,
    imagem: (setor, modo) => setImagem({ setor, modo: modo ?? (sit === 'todas' ? 'todas' : sit) }),
  } : null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Banco de Horas</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {pos ? <>Saldo em <b className="font-semibold text-foreground">{fmtData(pos.date)}</b>{pos.gerado ? `, enviado pelo DP em ${fmtData(pos.gerado)}` : ''}</>
                : 'Horas positivas, negativas e o que vence, por pessoa e por setor'}
              {!veTodos && temAlcance && ` · ${nomeSetorProprio ? `setor ${nomeSetorProprio}` : 'o seu setor'}`}
            </p>
          </div>
        </div>
        {temAlcance && (
          <div className="flex flex-wrap items-center gap-2">
            {posicoes.length > 1 && pos && (
              <Select value={pos.date} onValueChange={setDataSel}>
                <SelectTrigger className="h-8 w-48 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[...posicoes].reverse().map(p => <SelectItem key={p.date} value={p.date}>Relatório de {fmtData(p.date)}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {ctx && (
              <>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => ctx.imagem(setorFiltro)}>
                  <ImageIcon className="h-3.5 w-3.5" /> Imagem para e-mail
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setExcelAberto(true)}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void recarregar()} title="Ler de novo do banco">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {gerenciar && (
              <>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setLigando(true)} disabled={dados.semEstrutura}>
                  <Link2 className="h-3.5 w-3.5" /> Ligar setores
                  {faltando.length > 0 && (
                    <span className="rounded-full bg-warning/15 px-1.5 text-[10.5px] font-semibold text-warning">{faltando.length}</span>
                  )}
                </Button>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setResultado(null); setImportarAberto(true); }} disabled={dados.semEstrutura}>
                  <Upload className="h-3.5 w-3.5" /> Importar relatório
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Sem alcance, sem estrutura, erro, vazio */}
      {!carregandoPermissoes && !temAlcance && (
        <Aviso>{veSetor && !setorProprioId
          ? 'Seu usuário não está em nenhum setor, e o alcance liberado para o seu cargo no Banco de Horas é o do próprio setor.'
          : 'Nenhum alcance de dados está liberado para o seu cargo no Banco de Horas.'}</Aviso>
      )}
      {temAlcance && dados.semEstrutura && (
        <Aviso alerta><b>O Banco de Horas ainda não foi instalado neste banco.</b> Falta aplicar a migration <code>20261118180000_banco_de_horas.sql</code>.</Aviso>
      )}
      {temAlcance && dados.erro && <Aviso alerta>Não foi possível ler o banco de horas: {dados.erro}</Aviso>}

      {temAlcance && dados.carregando && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[78px] rounded-xl" />)}</div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}

      {temAlcance && !dados.carregando && !dados.semEstrutura && !pos && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Clock className="mx-auto h-10 w-10 text-primary" />
          <p className="mt-3 text-base font-semibold text-foreground">
            {veTodos ? 'Ainda não tem banco de horas importado' : `Ainda não tem banco de horas ${nomeSetorProprio ? `do setor ${nomeSetorProprio}` : 'do seu setor'}`}
          </p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            {gerenciar
              ? 'Importe os arquivos que o DP manda por e-mail (os CSV ou o .zip). Depois ligue cada setor do DP ao setor do gestão, para cada líder ver o seu.'
              : 'O relatório vem do DP e é importado pela gestão. Se ele já chegou e não aparece aqui, falta ligar o setor do DP ao seu setor do gestão.'}
          </p>
          {gerenciar && (
            <Button className="mt-4 gap-1.5" onClick={() => { setResultado(null); setImportarAberto(true); }}>
              <Upload className="h-4 w-4" /> Importar relatório
            </Button>
          )}
        </div>
      )}

      {ctx && pos && visao && (
        <>
          <AbasSegmentadas abas={abas} ativa={aba} onTrocar={trocarAba} rotulo="Seção do Banco de Horas" />

          {/* Filtros: valem para todas as abas */}
          <div className="space-y-2.5 rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmentado<FiltroSituacao> rotulo="Situação" valor={sit} onTrocar={setSit} opcoes={[
                { id: 'todas', titulo: 'Todas' },
                { id: 'pos', titulo: 'Só positivas', cor: 'bg-primary' },
                { id: 'neg', titulo: 'Só negativas', cor: 'bg-destructive' },
                { id: 'vence', titulo: `Vence ${diaMes(visao.prox)}`, cor: 'bg-warning' },
              ]} />
              {setoresNaVisao.length > 1 && (
                <Select value={setorFiltro || TODOS} onValueChange={v => setSetorFiltro(v === TODOS ? '' : v)}>
                  <SelectTrigger className={cn('h-8 w-52 rounded-lg text-xs', setorFiltro && 'border-primary/50 bg-primary/[0.05]')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos os setores</SelectItem>
                    {setoresNaVisao.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pessoa ou matrícula"
                  className={cn('h-8 w-64 rounded-lg pl-8 text-xs', busca && 'border-primary/50')} />
              </div>
              {(sit !== 'todas' || setorFiltro || busca || tirados.size > 0) && (
                <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1 text-xs"
                  onClick={() => { setSit('todas'); setSetorFiltro(''); setBusca(''); setTirados(new Set()); }}>
                  <X className="h-3.5 w-3.5" /> Limpar filtros
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                title="O DP não manda o mês em que a hora foi feita, só quando ela vence. A hora vence 12 meses depois de feita: vence em 25/11/2027 = feita em nov/2026.">
                <CalendarDays className="h-3.5 w-3.5" /> Meses das horas
                <Info className="h-3 w-3 opacity-70" />
              </span>
              <Segmentado<Periodo> rotulo="Período" valor={periodo} onTrocar={setPeriodo} opcoes={[
                { id: '3', titulo: 'Últimos 3 meses' }, { id: 'todos', titulo: 'Todos' },
              ]} />
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Meses (clique para tirar ou recolocar)">
                {[...mesesDisponiveis].reverse().map(m => {
                  const ligado = meses.includes(m);
                  return (
                    <button key={m} type="button" aria-pressed={ligado} onClick={() => alternarMes(m)}
                      title={ligado ? 'Tirar este mês' : 'Recolocar este mês'}
                      className={cn('inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[12px] font-medium transition-colors',
                        ligado ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                          : 'border-dashed border-border text-muted-foreground line-through decoration-1 hover:text-foreground')}>
                      {mesCurto(m)}
                      {m === visao.mesAtual && <span className="text-[10px] font-normal opacity-75">até {diaMes(visao.data)}</span>}
                    </button>
                  );
                })}
              </div>
              {tirados.size > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {meses.length} de {mesesDisponiveis.length} {mesesDisponiveis.length === 1 ? 'mês' : 'meses'}
                </span>
              )}
            </div>
          </div>

          {aba === 'geral' && <VisaoGeral c={ctx} />}
          {aba === 'situacao' && <Situacao c={ctx} />}
          {aba === 'pessoas' && <Pessoas c={ctx} />}
          {aba === 'setores' && <Setores c={ctx} />}
          {aba === 'vencimentos' && <Vencimentos c={ctx} />}
          {aba === 'relatorios' && (
            <Relatorios avisos={listaAvisos} dataEmTela={pos.date} posicoes={posicoes} gerenciar={gerenciar}
              empresaId={empresaId} onApagado={() => { setDataSel(null); void recarregar(); }} onAbrir={setDataSel} />
          )}

          <DialogPessoa p={pessoaAberta} visao={visao} sit={sit} limite={limite}
            url={pessoaAberta ? fotoDe(pessoaAberta) : null} meses={meses} onFechar={() => setPessoaAberta(null)} />
          <DialogExcel aberto={excelAberto} onFechar={() => setExcelAberto(false)} filtroTxt={filtroTxt}
            onBaixar={q => excel(q, `Banco de horas ${pos.date.split('-').reverse().join('-')}${filtroTxt ? ` - ${filtroTxt.replace(/[\\/:*?"<>|«»·]/g, '-')}` : ''}.xlsx`)} />
          <DialogImagem aberto={!!imagem} onFechar={() => setImagem(null)} visao={visao} pessoas={base}
            setorInicial={imagem?.setor ?? ''} modoInicial={imagem?.modo ?? 'todas'} limite={limite} fotoDe={fotoDe} />
        </>
      )}

      {gerenciar && (
        <>
          <DialogImportar aberto={importarAberto} onFechar={() => { setImportarAberto(false); setResultado(null); }}
            onArquivos={f => void aoArquivos(f)} importando={importando} resultado={resultado} posicaoPessoas={posicaoPessoas} />
          <VincularSetoresBH aberto={ligando} onFechar={() => setLigando(false)} empresaId={empresaId}
            setoresDp={dp} vinculos={vinculos} setores={setoresDosFiltros(setoresGestao, {})} onSalvo={() => void recarregar()} />
        </>
      )}
      {importando && !importarAberto && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Importando…</p>
      )}
    </div>
  );
}

function Aviso({ children, alerta }: { children: React.ReactNode; alerta?: boolean }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12.5px]',
      alerta ? 'border-warning/40 bg-warning/[0.06] text-foreground' : 'border-dashed border-border text-muted-foreground')}>
      {alerta && <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
      <div>{children}</div>
    </div>
  );
}
