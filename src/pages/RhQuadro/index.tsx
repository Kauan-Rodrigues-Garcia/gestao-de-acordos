/**
 * Quadro de Pessoal — a visão do RH sobre setores e equipes (20/10/2026).
 *
 * ## Por que uma tela à parte, e não a aba Usuários
 *
 * Usuários › Setores e › Equipes são telas de ADMINISTRAR: criar, arrastar,
 * escolher líder. O RH só olha, e pediu para olhar de outro jeito — por cidade,
 * em organograma, com exportação e com a planilha dele ao lado. Pôr isso lá
 * dentro misturaria botões que o RH não deve ver com uma leitura que a gestão
 * não precisa.
 *
 * ## Quem abre
 *
 * A chave é a do RH Gestão (`ver_rh_gestao`), e o que decide é o alcance
 * «todos os setores» daquela aba — o alcance do RH. O mesmo alcance é o que faz
 * `perfis_select` entregar a empresa inteira (20261013171000), então a tela
 * nunca pede ao banco mais do que ele já dá a essa pessoa. Não houve migration.
 *
 * ## O que ela NÃO faz
 *
 * Não grava nada. Exportar baixa um Excel montado no navegador; importar lê
 * uma planilha no navegador e compara (ver `AbaConferencia`).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle, Building2, Crown, Download, Eye, FileCheck2, FileUp, History, Network, RefreshCw, Search,
  Sparkles, Sun, Users, UsersRound,
} from 'lucide-react';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useEmpresa } from '@/hooks/useEmpresa';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { produtoDaEmpresa } from '@/lib/produto';
import type { Empresa } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { fetchEmpresasLiberadas } from '@/services/empresas.service';
import { useSubAbaUso } from '@/providers/RastreioUsoProvider';
import { registrarLog } from '@/services/logs.service';
import {
  conferirPlanilha, linhasDaConferencia, linhasDaPlanilha, montarQuadro, normalizar,
  type Numeros, type Pessoa, type Quadro, type SetorQuadro,
} from '@/services/rh/quadroPessoal';
import { carregarQuadro, carregarQuadroDeVarias } from '@/services/rh/quadroPessoal.service';
import { baixarPlanilha, lerPlanilha } from '@/services/rh/quadroPessoalPlanilha';
import AbaSetores from './AbaSetores';
import AbaEquipes from './AbaEquipes';
import AbaConferencia from './AbaConferencia';
import AbaHistorico from './AbaHistorico';
import PainelSetor from './PainelSetor';
import { Foto } from './partes';
import { lugarTexto, rotuloCargo } from './formato';

type Aba = 'setores' | 'equipes' | 'historico' | 'conferencia';
const ABAS_VALIDAS: readonly Aba[] = ['setores', 'equipes', 'historico', 'conferencia'];

const SEM_SETOR = '__sem_setor__';
/** Valor do seletor de empresa para «todas as operações». */
const TODAS = '__todas__';

/** «Receptivo Play 3» → «receptivo_play_3», para o nome do arquivo. */
function paraArquivo(t: string): string {
  return normalizar(t).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'quadro';
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** O balde «Sem setor» com a forma de um setor, para a página do setor e o organograma. */
function baldeSemSetor(quadro: Quadro): SetorQuadro | null {
  if (quadro.semSetor.length === 0) return null;
  const n: Numeros = {
    pessoas: quadro.semSetor.length,
    porGrupo: { operador: 0, lider: 0, elite: 0, gerencia: 0, diretoria: 0, outros: 0 },
    equipes: 0, lideres: 0, semEquipe: quadro.semSetor.length,
    emFerias: quadro.semSetor.filter(p => p.emFerias).length,
    novatos: quadro.semSetor.filter(p => p.novata).length,
  };
  for (const p of quadro.semSetor) n.porGrupo[p.grupo] += 1;
  return {
    id: SEM_SETOR, nome: 'Sem setor', descricao: null,
    cidade: { chave: '~', nome: 'Sem cidade', marca: null },
    regra: null, nucleo: false, empresa: null, equipes: [], semEquipe: quadro.semSetor, pessoas: quadro.semSetor, numeros: n,
  };
}

export default function RhQuadro() {
  const { empresa, tenantSlug } = useEmpresa();
  const { temPermissao, loading: permCarregando } = useCargoPermissoes();
  const podeVer = niveisLiberados('rh', temPermissao).includes('todos_setores');
  const empresaId = empresa?.id ?? null;
  /*
   * Entrando pela empresa Recursos Humanos, não há setor nem equipe dela para
   * mostrar: o que o RH olha é a gente das operações. Ali o quadro abre com
   * TODAS as empresas que a pessoa alcança; numa operação, com a própria.
   */
  const noRh = produtoDaEmpresa(empresa, tenantSlug) === 'rh';

  /** As operações que o quadro pode mostrar (cobrança e Comercial). `null` = carregando. */
  const [operacoes, setOperacoes] = useState<Empresa[] | null>(null);
  useEffect(() => {
    if (!podeVer || !empresa) return;
    let vivo = true;
    const ehOperacao = (e: Empresa) => {
      const p = produtoDaEmpresa(e);
      return p === 'cobranca' || p === 'comercial';
    };
    fetchEmpresasLiberadas()
      .then(lista => {
        if (!vivo) return;
        const ops = lista.filter(ehOperacao);
        if (ehOperacao(empresa) && !ops.some(e => e.id === empresa.id)) ops.unshift(empresa);
        setOperacoes(ops);
      })
      .catch(() => { if (vivo) setOperacoes(ehOperacao(empresa) ? [empresa] : []); });
    return () => { vivo = false; };
  }, [podeVer, empresa]);

  const [alvo, setAlvo] = useState<string | null>(null);
  const alvoEfetivo = alvo ?? (noRh ? TODAS : empresaId);
  const empresasDoAlvo = useMemo(() => {
    if (!operacoes) return null;
    if (alvoEfetivo === TODAS) return operacoes;
    return operacoes.filter(e => e.id === alvoEfetivo);
  }, [operacoes, alvoEfetivo]);
  const rotuloAlvo = alvoEfetivo === TODAS
    ? 'Todas as empresas'
    : empresasDoAlvo?.[0]?.nome ?? empresa?.nome ?? 'Empresa';

  const [params, setParams] = useSearchParams();
  const abaUrl = params.get('aba') as Aba | null;
  const aba: Aba = abaUrl && ABAS_VALIDAS.includes(abaUrl) ? abaUrl : 'setores';
  const setAba = useCallback((a: Aba) => {
    setParams(p => { const n = new URLSearchParams(p); n.set('aba', a); n.delete('setor'); return n; }, { replace: true });
  }, [setParams]);

  /*
   * O setor aberto mora no endereço (`?setor=`): o «voltar» do navegador fecha
   * a página do setor, e o link aberto de novo cai no mesmo lugar.
   */
  const setorAberto = aba === 'setores' ? params.get('setor') : null;
  const topo = useRef<HTMLDivElement>(null);
  const abrirSetor = useCallback((id: string | null) => {
    setParams(p => {
      const n = new URLSearchParams(p);
      n.set('aba', 'setores');
      if (id) n.set('setor', id); else n.delete('setor');
      return n;
    }, { replace: !id });
    topo.current?.scrollIntoView({ block: 'start' });
  }, [setParams]);
  useSubAbaUso(aba);
  /** Prévia do Histórico com dados inventados, sem banco — só em desenvolvimento. */
  const previaHistorico = import.meta.env.DEV && params.get('previa') === 'historico';
  /** Sobe a cada «Atualizar»: o Histórico apaga a memória e relê. */
  const [versao, setVersao] = useState(0);

  const [quadro, setQuadro] = useState<Quadro | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [retratoEm, setRetratoEm] = useState<Date | null>(null);

  const [setorEquipes, setSetorEquipes] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);

  const [planilha, setPlanilha] = useState<{ arquivo: string; aba: string; linhas: Record<string, unknown>[] } | null>(null);
  const [lendo, setLendo] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!empresasDoAlvo) return;
    if (empresasDoAlvo.length === 0) {
      setErro('Nenhuma empresa de operação está liberada para você ver.');
      setCarregando(false);
      return;
    }
    if (silencioso) setAtualizando(true); else setCarregando(true);
    try {
      const dados = empresasDoAlvo.length === 1 && alvoEfetivo !== TODAS
        ? await carregarQuadro(empresasDoAlvo[0].id)
        : await carregarQuadroDeVarias(empresasDoAlvo.map(e => ({ id: e.id, nome: e.nome })));
      setQuadro(montarQuadro(dados));
      setRetratoEm(new Date());
      setErro(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
      setErro(msg);
      if (silencioso) toast.error('Não foi possível atualizar o quadro: ' + msg);
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [empresasDoAlvo, alvoEfetivo]);

  // Trocar de empresa relê sem apagar a tela: o quadro anterior fica até o novo chegar.
  const jaCarregou = useRef(false);
  useEffect(() => {
    if (!podeVer || !empresasDoAlvo) return;
    void carregar(jaCarregou.current);
    jaCarregou.current = true;
  }, [carregar, podeVer, empresasDoAlvo]);

  const trocarEmpresa = useCallback((id: string) => {
    setAlvo(id);
    abrirSetor(null);
    setSetorEquipes(null);
    setDestaque(null);
  }, [abrirSetor]);

  const semSetor = useMemo(() => (quadro ? baldeSemSetor(quadro) : null), [quadro]);
  const setoresComBalde = useMemo(
    () => (quadro ? [...quadro.setores, ...(semSetor ? [semSetor] : [])] : []),
    [quadro, semSetor],
  );
  const setorDoPainel = setoresComBalde.find(s => s.id === setorAberto) ?? null;

  const conferencia = useMemo(() => {
    if (!quadro || !planilha) return null;
    return { arquivo: planilha.arquivo, aba: planilha.aba, conferencia: conferirPlanilha(quadro, planilha.linhas, rotuloCargo) };
  }, [quadro, planilha]);

  // ── Exportar ───────────────────────────────────────────────────────────────

  const exportar = useCallback(async (setor?: SetorQuadro) => {
    if (!quadro) return;
    try {
      const abas = linhasDaPlanilha(quadro, rotuloCargo, setor ? new Set([setor.id]) : undefined);
      const nome = `quadro_pessoal_${paraArquivo(setor?.nome ?? rotuloAlvo)}_${hojeIso()}.xlsx`;
      await baixarPlanilha(abas, nome);
      toast.success(setor ? `Planilha de ${setor.nome} baixada.` : 'Quadro de pessoal baixado.');
      // O banco não vê ninguém baixar arquivo, e é uma lista de gente.
      void registrarLog({
        acao: 'rh_quadro_exportado',
        categoria: 'usuario',
        severidade: 'aviso',
        descricao: setor ? `Exportou o quadro de pessoal do setor ${setor.nome}` : 'Exportou o quadro de pessoal da empresa',
        empresaId,
        alvoTipo: setor ? 'setor' : 'empresa',
        alvoRotulo: setor?.nome ?? rotuloAlvo,
        detalhes: { pessoas: abas.Pessoas.length, setores: abas.Resumo.length, empresas: rotuloAlvo },
      });
    } catch (e) {
      toast.error('Não foi possível gerar a planilha: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, [quadro, rotuloAlvo, empresaId]);

  const exportarConferencia = useCallback(async () => {
    if (!conferencia) return;
    await baixarPlanilha(
      { 'Conferência': linhasDaConferencia(conferencia.conferencia) },
      `conferencia_${paraArquivo(conferencia.arquivo.replace(/\.[^.]+$/, ''))}_${hojeIso()}.xlsx`,
    );
  }, [conferencia]);

  const baixarModelo = useCallback(() => {
    void baixarPlanilha(
      { Pessoas: [{ Nome: '', 'E-mail': '', Setor: '', Equipe: '', Cargo: '' }] },
      'modelo_conferencia_rh.xlsx',
    );
  }, []);

  // ── Importar (conferir) ────────────────────────────────────────────────────

  const lerArquivo = useCallback(async (arquivo: File) => {
    if (!quadro) return;
    if (!/\.(xlsx|xls|csv)$/i.test(arquivo.name)) {
      toast.error('Use uma planilha .xlsx, .xls ou .csv.');
      return;
    }
    setLendo(true);
    try {
      const { aba: abaLida, linhas } = await lerPlanilha(arquivo);
      const teste = conferirPlanilha(quadro, linhas.slice(0, 1), rotuloCargo);
      if (!teste.colunas.nome && !teste.colunas.email) {
        toast.error('Não achei a coluna «Nome» nem «E-mail» na planilha. Baixe o modelo para ver o formato.');
        return;
      }
      setPlanilha({ arquivo: arquivo.name, aba: abaLida, linhas });
      setAba('conferencia');
    } catch {
      toast.error('Não consegui ler este arquivo. Ele está aberto em outro programa ou corrompido?');
    } finally {
      setLendo(false);
      if (inputArquivo.current) inputArquivo.current.value = '';
    }
  }, [quadro, setAba]);

  // ── Navegação entre as partes ──────────────────────────────────────────────

  const irParaPessoa = useCallback((p: Pessoa) => {
    if (!quadro) return;
    const onde = quadro.local.get(p.id);
    setSetorEquipes(onde?.setorId ?? SEM_SETOR);
    setDestaque(p.id);
    setAba('equipes');
  }, [quadro, setAba]);

  const irParaPessoaPorId = useCallback((id: string): boolean => {
    const p = quadro?.todas.find(x => x.id === id);
    if (!p) return false;
    irParaPessoa(p);
    return true;
  }, [quadro, irParaPessoa]);

  const verOrganograma = useCallback((setorId: string) => {
    setDestaque(null);
    setSetorEquipes(setorId);
    setAba('equipes');
  }, [setAba]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (permCarregando) return <Esqueleto />;

  if (!podeVer) {
    return (
      <div className="mx-auto max-w-md space-y-2 px-6 py-16 text-center">
        <Network className="mx-auto size-8 opacity-40" />
        <p className="text-sm font-medium">O Quadro de Pessoal é a visão do RH.</p>
        <p className="text-xs text-muted-foreground">
          Ele abre para quem tem o RH Gestão com o alcance «todos os setores», em Configurações › Permissões.
        </p>
      </div>
    );
  }

  if (carregando && !quadro) return <Esqueleto />;

  if (erro && !quadro) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-6 py-16 text-center">
        <AlertTriangle className="mx-auto size-8 text-warning" />
        <p className="text-sm font-medium">Não foi possível carregar o quadro.</p>
        <p className="text-xs text-muted-foreground">{erro}</p>
        <Button size="sm" variant="outline" onClick={() => void carregar()}>Tentar de novo</Button>
      </div>
    );
  }

  if (!quadro) return null;

  const n = quadro.numeros;
  const abas: AbaSegmentada<Aba>[] = [
    { key: 'setores', label: 'Setores', Icon: Building2 },
    { key: 'equipes', label: 'Equipes', Icon: Network },
    { key: 'historico', label: 'Histórico do mês', Icon: History },
    { key: 'conferencia', label: 'Conferir planilha', Icon: FileCheck2, badge: conferencia?.conferencia.contagem.diferente },
  ];

  return (
    <div ref={topo} className="mx-auto max-w-[1600px] scroll-mt-4 space-y-6 p-4 md:p-6">
      <input
        ref={inputArquivo}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void lerArquivo(f); }}
      />

      {/* Cabeçalho */}
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Quadro de Pessoal</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Eye className="size-3" /> Somente leitura
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {rotuloAlvo} · retrato de {retratoEm
              ? retratoEm.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : 'agora'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {operacoes && operacoes.length > 1 && (
            <label className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm">
              <Building2 className="size-4 text-muted-foreground" />
              <select
                value={alvoEfetivo ?? ''}
                onChange={e => trocarEmpresa(e.target.value)}
                className="bg-transparent text-foreground outline-none"
                aria-label="Empresa do quadro"
              >
                <option value={TODAS}>Todas as empresas</option>
                {operacoes.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </label>
          )}
          <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={() => { setVersao(v => v + 1); void carregar(true); }} disabled={atualizando}>
            <RefreshCw className={cn('size-4', atualizando && 'animate-spin')} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => inputArquivo.current?.click()} disabled={lendo}>
            <FileUp className="size-4" /> Importar planilha
          </Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => void exportar()}>
            <Download className="size-4" /> Exportar Excel
          </Button>
        </div>
      </header>

      {/* Os números */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <Numero Icone={Users} valor={n.pessoas} rotulo="Pessoas" destaque />
        <Numero Icone={Building2} valor={quadro.setores.length} rotulo="Setores" />
        <Numero Icone={UsersRound} valor={n.equipes} rotulo="Equipes" />
        <Numero Icone={Crown} valor={n.lideres} rotulo="Líderes de equipe" />
        <Numero Icone={AlertTriangle} valor={n.semEquipe} rotulo="Sem equipe" tom={n.semEquipe > 0 ? 'warning' : undefined} />
        <Numero Icone={Sun} valor={n.emFerias} rotulo="De férias" />
        <Numero Icone={Sparkles} valor={n.novatos} rotulo="Novos (30 dias)" tom={n.novatos > 0 ? 'success' : undefined} />
      </div>

      {/* Onde está fulano? + abas */}
      <div className="flex flex-wrap items-center gap-3">
        <AbasSegmentadas abas={abas} ativa={aba} onTrocar={setAba} rotulo="Partes do quadro" />
        <BuscaPessoa quadro={quadro} onEscolher={irParaPessoa} />
      </div>

      {aba === 'setores' && (setorDoPainel
        ? (
          <PainelSetor
            key={setorDoPainel.id}
            quadro={quadro}
            setor={setorDoPainel}
            onVoltar={() => abrirSetor(null)}
            onVerOrganograma={verOrganograma}
            onExportar={s => void exportar(s)}
          />
        )
        : <AbaSetores quadro={quadro} semSetor={semSetor} onAbrir={abrirSetor} />)}
      {aba === 'equipes' && (
        <AbaEquipes
          quadro={quadro}
          setores={setoresComBalde}
          setorId={setorEquipes}
          onSetor={id => { setSetorEquipes(id); setDestaque(null); }}
          destaque={destaque}
        />
      )}
      {aba === 'historico' && (
        <AbaHistorico
          empresas={(empresasDoAlvo ?? []).map(e => e.id)}
          rotuloAlvo={rotuloAlvo}
          versao={versao}
          previa={previaHistorico}
          onPessoa={irParaPessoaPorId}
        />
      )}
      {aba === 'conferencia' && (
        <AbaConferencia
          carregada={conferencia}
          lendo={lendo}
          onArquivo={f => void lerArquivo(f)}
          onEscolher={() => inputArquivo.current?.click()}
          onLimpar={() => setPlanilha(null)}
          onExportar={() => void exportarConferencia()}
          onBaixarModelo={baixarModelo}
        />
      )}

    </div>
  );
}

function Numero({
  Icone, valor, rotulo, tom, destaque,
}: {
  Icone: typeof Users;
  valor: number;
  rotulo: string;
  tom?: 'warning' | 'success';
  destaque?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-xl border bg-card p-3 shadow-sm',
      destaque ? 'border-primary/40' : 'border-border',
      tom === 'warning' && 'border-warning/40 bg-warning/5',
      tom === 'success' && 'border-success/30',
    )}>
      <Icone className={cn(
        'size-4',
        destaque ? 'text-primary' : tom === 'warning' ? 'text-warning' : tom === 'success' ? 'text-success' : 'text-muted-foreground',
      )} />
      <p className="mt-2 text-2xl font-bold leading-none tabular-nums tracking-tight text-foreground">{valor.toLocaleString('pt-BR')}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground" title={rotulo}>{rotulo}</p>
    </div>
  );
}

function BuscaPessoa({ quadro, onEscolher }: { quadro: Quadro; onEscolher: (p: Pessoa) => void }) {
  const [q, setQ] = useState('');
  const [aberta, setAberta] = useState(false);
  const [cursor, setCursor] = useState(0);
  const b = normalizar(q);
  const resultados = useMemo(
    () => (b ? quadro.todas.filter(p => normalizar(p.nome).includes(b) || normalizar(p.email).startsWith(b)).slice(0, 8) : []),
    [quadro.todas, b],
  );

  const escolher = (p: Pessoa) => { onEscolher(p); setQ(''); setAberta(false); };
  const teclar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, resultados.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && resultados[cursor]) escolher(resultados[cursor]);
    if (e.key === 'Escape') setAberta(false);
  };

  return (
    <div className="relative ml-auto w-full sm:w-80">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={e => { setQ(e.target.value); setAberta(true); setCursor(0); }}
        onFocus={() => setAberta(true)}
        onBlur={() => window.setTimeout(() => setAberta(false), 150)}
        onKeyDown={teclar}
        placeholder="Onde está…? Busque uma pessoa"
        className="h-9 pl-9"
        aria-label="Buscar pessoa no quadro"
      />
      {aberta && b && (
        <div className="absolute right-0 top-full z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {resultados.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">Ninguém com esse nome no quadro.</p>}
          {resultados.map((p, i) => {
            const l = lugarTexto(quadro, p);
            return (
              <button
                key={p.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => escolher(p)}
                onMouseEnter={() => setCursor(i)}
                className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', i === cursor && 'bg-muted')}
              >
                <Foto pessoa={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{p.nome}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {rotuloCargo(p.cargo)} · {l.setor}{l.equipe ? ` › ${l.equipe}` : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <Skeleton className="h-9 w-72" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-10 w-96 max-w-full" />
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
      </div>
    </div>
  );
}
