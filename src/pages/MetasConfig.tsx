/**
 * MetasConfig.tsx — v4
 * Um único botão "Salvar Todas" no rodapé, sem botão por linha.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Target, Save, ChevronLeft, ChevronRight, Building2, Users, User, ArrowLeft,
  Loader2, CalendarDays, Plus, X, Layers, GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEmpresa } from "@/hooks/useEmpresa";
import { useCargoPermissoes } from "@/hooks/useCargoPermissoes";
import { supabase } from "@/lib/supabase";
import type { QuartilConfig } from "@/lib/supabase";
import { useTenant } from "@/lib/tenant-config";
import { PP_HO_PERCENTUAL, getTodayISO } from "@/lib/index";
import { diasUteisDoMes, diasUteisDecorridos, ordenarQuartis, QUARTIS_PADRAO } from "@/lib/diasUteis";
import { getMetasConfig, upsertMetasConfig } from "@/services/metas/metasConfig.service";
import { listarClonesEquipes } from "@/services/equipes/equipesClones.service";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

type TipoMeta = "setor" | "equipe" | "operador";

interface Meta {
  id?: string;
  tipo: TipoMeta;
  referencia_id: string;
  empresa_id: string;
  meta_valor: number;
  meta_acordos: number;
  metas_extras?: number[];
  mes: number;
  ano: number;
}
interface Setor  { id: string; nome: string; }
interface Equipe {
  id: string; nome: string; setor_id: string;
  treinamento: boolean | null; treinamento_inicio: string | null;
}
interface Operador {
  id: string; nome: string; equipe_id: string | null;
  /** Nome do setor de origem quando o operador entra aqui como CLONE. A meta é
   *  a mesma nos dois setores — a linha em `metas` é por operador, sem setor. */
  clonadoDe?: string | null;
}
interface MetaInput { meta_valor: string; meta_ho: string; extras: string[]; }

function parseBRL(value: string): number {
  const cleaned = value.replace(/[^\d,]/g, "").replace(",", ".");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function formatBRL(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseFloat(digits) / 100;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(num: number): string {
  return num > 0
    ? num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
}

function emptyInput(): MetaInput { return { meta_valor: "", meta_ho: "", extras: [] }; }

// ── MonthNavigator ────────────────────────────────────────────────────────────
function MonthNavigator({ mes, ano, onChange }: { mes: number; ano: number; onChange: (m: number, a: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="h-8 w-8"
        onClick={() => mes === 1 ? onChange(12, ano - 1) : onChange(mes - 1, ano)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[140px] text-center font-semibold text-sm">{MESES[mes - 1]} {ano}</span>
      <Button variant="outline" size="icon" className="h-8 w-8"
        onClick={() => mes === 12 ? onChange(1, ano + 1) : onChange(mes + 1, ano)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ── MetaRow — linha de input SEM botão salvar individual ─────────────────────
interface MetaRowProps {
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  input: MetaInput;
  onChangeValor: (v: string) => void;
  /** PaguePlay: campo Meta H.O. (24,96% do total, conversão bidirecional). */
  mostrarHO?: boolean;
  onChangeHO?: (v: string) => void;
  /** BookPlay: quantidade de campos de metas extras (2ª, 3ª…). */
  numExtras?: number;
  onChangeExtra?: (idx: number, v: string) => void;
  disabled?: boolean;
}

function MetaRow({
  label, sublabel, icon, input, onChangeValor, mostrarHO, onChangeHO,
  numExtras = 0, onChangeExtra, disabled,
}: MetaRowProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2 sm:w-52 shrink-0">
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{String(label ?? "")}</p>
          {sublabel && <p className="text-xs text-muted-foreground truncate">{sublabel}</p>}
        </div>
      </div>
      <div className="flex flex-1 items-center gap-2">
        <div className="flex flex-col gap-1 min-w-[150px] max-w-[200px]">
          <Label className="text-xs text-muted-foreground">Meta R$</Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="0,00"
              value={input.meta_valor}
              disabled={disabled}
              onChange={(e) => onChangeValor(formatBRL(e.target.value))}
            />
          </div>
        </div>
        {mostrarHO && (
          <div className="flex flex-col gap-1 min-w-[150px] max-w-[200px]">
            <Label className="text-xs text-muted-foreground">Meta H.O. (24,96%)</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="0,00"
                value={input.meta_ho}
                disabled={disabled}
                onChange={(e) => onChangeHO?.(formatBRL(e.target.value))}
              />
            </div>
          </div>
        )}
        {Array.from({ length: numExtras }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1 min-w-[130px] max-w-[180px]">
            <Label className="text-xs text-muted-foreground">{i + 2}ª meta (opcional)</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="0,00"
                value={input.extras[i] ?? ""}
                disabled={disabled}
                onChange={(e) => onChangeExtra?.(i, formatBRL(e.target.value))}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────────────────────
function SectionCard({ title, description, icon, children, badge }: {
  title: string; description?: string; icon: React.ReactNode;
  children: React.ReactNode; badge?: string | number;
}) {
  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <CardTitle className="text-base">{String(title ?? "")}</CardTitle>
          {badge !== undefined && (
            <Badge variant="secondary" className="text-xs ml-auto">{String(badge)}</Badge>
          )}
        </div>
        {description && <CardDescription className="text-xs">{String(description)}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function MetasConfig() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const liderSetorId = perfil?.setor_id ?? null;
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const isAdmin = perfil?.perfil === "administrador" || perfil?.perfil === "super_admin";
  // Editar/salvar metas exige a permissão gerenciar_metas (admin sempre tem;
  // padrão = true, espelhando o acesso atual). Sem ela, a tela fica só leitura.
  const podeGerenciarMetas = temPermissao("gerenciar_metas");

  const tenant = useTenant();
  const isPP = tenant.isPaguePlay;
  // Dias úteis/feriados + quartis valem para os dois tenants (H.O. só na PP)
  const temConfigMes = isPP || tenant.slug === "bookplay";
  // Metas adicionais (2ª, 3ª…) — BookPlay
  const isBP = tenant.slug === "bookplay";

  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [setorSelecionado, setSetorSelecionado] = useState<string>("");

  const [setores,    setSetores]    = useState<Setor[]>([]);
  const [equipes,    setEquipes]    = useState<Equipe[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  // Filtro por equipe na lista de operadores ('' = todas)
  const [equipeFiltroOp, setEquipeFiltroOp] = useState<string>("");

  const [loadingSetores,    setLoadingSetores]    = useState(false);
  const [loadingEquipes,    setLoadingEquipes]    = useState(false);
  const [loadingOperadores, setLoadingOperadores] = useState(false);
  const [loadingMetas,      setLoadingMetas]      = useState(false);
  const [salvandoTudo,      setSalvandoTudo]      = useState(false);

  // Config mensal (PP): feriados + quartis (metas_config_mes)
  const [feriados,      setFeriados]      = useState<string[]>([]);
  const [quartis,       setQuartis]       = useState<QuartilConfig[]>(QUARTIS_PADRAO);
  const [feriadoNovo,   setFeriadoNovo]   = useState<string>("");
  // Contar o dia de hoje nos dias trabalhados. Padrão false: o dia atual ainda
  // está acontecendo, o analítico dele só fecha no fim do expediente.
  const [contarDiaAtual, setContarDiaAtual] = useState(false);
  const [configDbAtiva, setConfigDbAtiva] = useState(true);
  const [configCarregada, setConfigCarregada] = useState(false);

  // inputs controlados por referencia_id
  const [inputMetas, setInputMetas] = useState<Record<string, MetaInput>>({});
  // Campos extras visíveis por seção (BP): padrão 0, "+" adiciona p/ todos
  const [extraCampos, setExtraCampos] = useState<Record<TipoMeta, number>>({ setor: 0, equipe: 0, operador: 0 });

  function getInput(id: string): MetaInput { return inputMetas[id] ?? emptyInput(); }
  function setInput(id: string, patch: Partial<MetaInput>) {
    setInputMetas(prev => ({ ...prev, [id]: { ...(prev[id] ?? emptyInput()), ...patch } }));
  }

  // Conversão bidirecional Meta total ⇄ Meta H.O. (24,96%)
  function onChangeValor(id: string, v: string) {
    if (!isPP) { setInput(id, { meta_valor: v }); return; }
    const total = parseBRL(v);
    setInput(id, { meta_valor: v, meta_ho: fmtNum(total * PP_HO_PERCENTUAL) });
  }
  function onChangeHO(id: string, v: string) {
    const ho = parseBRL(v);
    setInput(id, { meta_ho: v, meta_valor: fmtNum(ho / PP_HO_PERCENTUAL) });
  }
  function onChangeExtra(id: string, idx: number, v: string) {
    const atuais = [...getInput(id).extras];
    atuais[idx] = v;
    setInput(id, { extras: atuais });
  }

  // Dias úteis derivados (seg–sex − feriados)
  const hojeISO = getTodayISO();
  const mesAtualVisivel = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear();
  const totalDiasUteis  = useMemo(() => diasUteisDoMes(ano, mes, feriados), [ano, mes, feriados]);
  const diasTrabalhados = useMemo(
    () => (mesAtualVisivel
      ? diasUteisDecorridos(ano, mes, feriados, hojeISO, undefined, contarDiaAtual)
      : null),
    [ano, mes, feriados, hojeISO, mesAtualVisivel, contarDiaAtual],
  );

  const fetchSetores = useCallback(async () => {
    if (!empresa?.id) return;
    setLoadingSetores(true);
    try {
      const { data, error } = await supabase.from("setores").select("id, nome")
        .eq("empresa_id", empresa.id).order("nome");
      if (error) throw error;
      const validos: Setor[] = (data ?? []).filter((s): s is Setor => typeof s?.id === "string" && s.id.length > 0);
      setSetores(validos);
      if (isAdmin) { if (!setorSelecionado && validos.length > 0) setSetorSelecionado(validos[0].id); }
      else { if (liderSetorId) setSetorSelecionado(liderSetorId); }
    } catch (err: unknown) {
      toast.error("Erro ao carregar setores", { description: err instanceof Error ? err.message : String(err) });
    } finally { setLoadingSetores(false); }
  }, [empresa?.id, isAdmin, liderSetorId, setorSelecionado]);

  const fetchEquipes = useCallback(async () => {
    if (!setorSelecionado) return;
    setLoadingEquipes(true);
    try {
      const { data, error } = await supabase.from("equipes")
        .select("id, nome, setor_id, treinamento, treinamento_inicio")
        .eq("setor_id", setorSelecionado).order("nome");
      if (error) throw error;
      setEquipes((data ?? []).filter((e): e is Equipe => typeof e?.id === "string" && e.id.length > 0));
    } catch (err: unknown) {
      toast.error("Erro ao carregar equipes", { description: err instanceof Error ? err.message : String(err) });
    } finally { setLoadingEquipes(false); }
  }, [setorSelecionado]);

  const fetchOperadores = useCallback(async () => {
    if (!setorSelecionado) return;
    setLoadingOperadores(true);
    try {
      const { data, error } = await supabase.from("perfis").select("id, nome, equipe_id")
        .eq("setor_id", setorSelecionado).in("perfil", ["operador", "elite"]).order("nome");
      if (error) throw error;
      const proprios = (data ?? []).filter((o): o is Operador => typeof o?.id === "string" && o.id.length > 0);
      setOperadores([...proprios, ...(await buscarClonadosNoSetor(proprios))]);
    } catch (err: unknown) {
      toast.error("Erro ao carregar operadores", { description: err instanceof Error ? err.message : String(err) });
    } finally { setLoadingOperadores(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setorSelecionado, empresa?.id]);

  /** Operadores de OUTRO setor clonados em alguma equipe deste setor. Entram na
   *  lista de metas junto dos próprios: a meta é por operador (a chave do
   *  upsert é tipo+referencia_id+empresa_id+mes+ano, sem setor), então salvar
   *  daqui ou do setor de origem escreve a mesma linha. */
  async function buscarClonadosNoSetor(proprios: Operador[]): Promise<Operador[]> {
    if (!empresa?.id || !setorSelecionado) return [];
    const { data: eqs } = await supabase.from("equipes").select("id").eq("setor_id", setorSelecionado);
    const eqIds = new Set(((eqs ?? []) as { id: string }[]).map(e => e.id));
    if (!eqIds.size) return [];

    const clones = await listarClonesEquipes(empresa.id);  // null = migration pendente
    if (!clones?.length) return [];

    // operador → equipe DESTE setor em que ele é clone (para o filtro de equipe)
    const equipeAqui = new Map<string, string>();
    for (const c of clones) {
      if (eqIds.has(c.equipe_id) && !equipeAqui.has(c.operador_id)) equipeAqui.set(c.operador_id, c.equipe_id);
    }
    const jaNaLista = new Set(proprios.map(o => o.id));
    const faltando = [...equipeAqui.keys()].filter(id => !jaNaLista.has(id));
    if (!faltando.length) return [];

    const { data: perfisClonados } = await supabase.from("perfis")
      .select("id, nome, setor_id").in("id", faltando)
      .in("perfil", ["operador", "elite"]).order("nome");
    const linhas = (perfisClonados ?? []) as { id: string; nome: string; setor_id: string | null }[];
    if (!linhas.length) return [];

    // Nome do setor de origem para a etiqueta (o líder pode não ter esse setor carregado)
    const origemIds = [...new Set(linhas.map(l => l.setor_id).filter((s): s is string => !!s))];
    const { data: setoresOrigem } = await supabase.from("setores").select("id, nome").in("id", origemIds);
    const nomeOrigem = new Map(((setoresOrigem ?? []) as { id: string; nome: string }[]).map(s => [s.id, s.nome]));

    return linhas.map(l => ({
      id: l.id,
      nome: l.nome,
      equipe_id: equipeAqui.get(l.id) ?? null,
      clonadoDe: (l.setor_id && nomeOrigem.get(l.setor_id)) || "outro setor",
    }));
  }

  const fetchMetas = useCallback(async () => {
    if (!empresa?.id) return;
    setLoadingMetas(true);
    try {
      const { data, error } = await supabase.from("metas").select("*")
        .eq("empresa_id", empresa.id).eq("mes", mes).eq("ano", ano);
      if (error) throw error;
      const loaded: Meta[] = (data ?? []) as Meta[];
      const newInputs: Record<string, MetaInput> = {};
      const maxExtras: Record<TipoMeta, number> = { setor: 0, equipe: 0, operador: 0 };
      for (const m of loaded) {
        if (!m?.referencia_id) continue;
        const v = Number(m.meta_valor) || 0;
        const extras = (Array.isArray(m.metas_extras) ? m.metas_extras : [])
          .map(e => Number(e) || 0).filter(e => e > 0);
        newInputs[m.referencia_id] = {
          meta_valor: fmtNum(v),
          meta_ho:    fmtNum(v * PP_HO_PERCENTUAL),
          extras:     extras.map(fmtNum),
        };
        if (m.tipo && extras.length > maxExtras[m.tipo]) maxExtras[m.tipo] = extras.length;
      }
      setInputMetas(newInputs);
      setExtraCampos(maxExtras);
    } catch (err: unknown) {
      toast.error("Erro ao carregar metas", { description: err instanceof Error ? err.message : String(err) });
    } finally { setLoadingMetas(false); }
  }, [empresa?.id, mes, ano]);

  // Config mensal (feriados + quartis) — PP
  const fetchConfig = useCallback(async () => {
    if (!empresa?.id || !temConfigMes) { setConfigCarregada(true); return; }
    const { data, dbAtiva } = await getMetasConfig(empresa.id, mes, ano);
    setConfigDbAtiva(dbAtiva);
    setFeriados(data?.feriados ?? []);
    setQuartis(data?.quartis ?? QUARTIS_PADRAO);
    setContarDiaAtual(data?.contar_dia_atual === true);
    setConfigCarregada(true);
  }, [empresa?.id, temConfigMes, mes, ano]);

  useEffect(() => { fetchSetores(); }, [fetchSetores]);
  useEffect(() => { fetchEquipes(); }, [fetchEquipes]);
  useEffect(() => { fetchOperadores(); }, [fetchOperadores]);
  useEffect(() => { fetchMetas(); }, [fetchMetas]);
  useEffect(() => { void fetchConfig(); }, [fetchConfig]);

  function adicionarFeriado() {
    if (!feriadoNovo) return;
    const [y, m] = feriadoNovo.split("-").map(Number);
    if (y !== ano || m !== mes) {
      toast.warning(`O feriado deve estar em ${MESES[mes - 1]}/${ano}.`);
      return;
    }
    if (feriados.includes(feriadoNovo)) { setFeriadoNovo(""); return; }
    setFeriados(prev => [...prev, feriadoNovo].sort());
    setFeriadoNovo("");
  }

  function setQuartilPct(quartil: number, pct: string) {
    const num = parseInt(pct.replace(/\D/g, ""), 10);
    setQuartis(prev => prev.map(q =>
      q.quartil === quartil ? { ...q, min_pct: isNaN(num) ? 0 : num } : q,
    ));
  }

  // Equipes de treinamento: data de início salva na hora (equipes.treinamento_inicio)
  const [salvandoTreino, setSalvandoTreino] = useState<string | null>(null);
  async function setTreinamentoInicio(equipeId: string, dataISO: string) {
    const valor = dataISO || null;
    setEquipes(prev => prev.map(e => e.id === equipeId ? { ...e, treinamento_inicio: valor } : e));
    setSalvandoTreino(equipeId);
    try {
      const { error } = await supabase.from("equipes").update({ treinamento_inicio: valor }).eq("id", equipeId);
      if (error) throw error;
    } catch (err: unknown) {
      toast.error("Erro ao salvar início do treinamento", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSalvandoTreino(null);
    }
  }
  const equipesTreinamento = equipes.filter(e => e.treinamento);

  // ── Salvar TODAS as metas de uma vez ──────────────────────────────────────
  async function handleSalvarTudo() {
    if (!empresa?.id || !setorSelecionado) return;
    if (!podeGerenciarMetas) { toast.error("Sem permissão para editar metas."); return; }
    setSalvandoTudo(true);

    // Montar lista de todos os itens que têm valor preenchido
    const itens: { tipo: TipoMeta; referenciaId: string }[] = [
      { tipo: "setor",    referenciaId: setorSelecionado },
      ...equipes.map(eq => ({ tipo: "equipe" as TipoMeta,    referenciaId: eq.id })),
      ...operadores.map(op => ({ tipo: "operador" as TipoMeta, referenciaId: op.id })),
    ];

    const payloads: Omit<Meta, "id">[] = itens
      .map(({ tipo, referenciaId }) => ({
        tipo,
        referencia_id: referenciaId,
        empresa_id: empresa.id!,
        meta_valor: parseBRL(getInput(referenciaId).meta_valor),
        meta_acordos: 0,
        // Metas adicionais (BP): só as preenchidas contam; em branco é ignorado
        ...(isBP ? {
          metas_extras: getInput(referenciaId).extras.map(parseBRL).filter(v => v > 0),
        } : {}),
        mes,
        ano,
      }))
      .filter(p => p.meta_valor > 0); // só salva quem tem valor

    const salvaConfig = temConfigMes && configDbAtiva;
    if (payloads.length === 0 && !salvaConfig) {
      toast.warning("Preencha ao menos uma meta antes de salvar.");
      setSalvandoTudo(false);
      return;
    }

    try {
      if (payloads.length > 0) {
        const { error } = await supabase.from("metas")
          .upsert(payloads, { onConflict: "tipo,referencia_id,empresa_id,mes,ano" });
        if (error) throw error;
      }
      // Config mensal (feriados + quartis) — PP
      if (salvaConfig && perfil?.id) {
        const { error: cfgErr } = await upsertMetasConfig({
          empresaId: empresa.id, mes, ano,
          feriados, quartis, contarDiaAtual, atualizadoPor: perfil.id,
        });
        if (cfgErr) throw new Error(cfgErr);
      }
      toast.success(
        payloads.length > 0
          ? `${payloads.length} meta(s) salva(s) com sucesso!`
          : "Configuração do mês salva!",
        { description: `${MESES[mes - 1]}/${ano}` },
      );
      await fetchMetas();
    } catch (err: unknown) {
      toast.error("Erro ao salvar metas", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSalvandoTudo(false);
    }
  }

  const setorNome = setores.find(s => s.id === setorSelecionado)?.nome ?? "";
  const temMetas = Object.values(inputMetas).some(v => v.meta_valor.trim() !== "");
  const podeSalvar = temMetas || (temConfigMes && configDbAtiva);
  const operadoresVisiveis = operadores
    .filter(op => typeof op?.id === "string" && op.id.length > 0)
    .filter(op => !equipeFiltroOp || op.equipe_id === equipeFiltroOp);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm"
            className="mb-2 h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground -ml-1"
            onClick={() => navigate(-1)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" /> Configurar Metas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Defina metas mensais por setor, equipe e operador.
          </p>
        </div>
        <MonthNavigator mes={mes} ano={ano} onChange={(m, a) => { setMes(m); setAno(a); }} />
      </div>

      <Separator />

      {/* ── Config do mês (PP + BookPlay): dias úteis + feriados + quartis ── */}
      {temConfigMes && configDbAtiva && configCarregada && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionCard
            title="Dias úteis do mês"
            description="Segunda a sexta, menos os feriados cadastrados. Usado para calcular a meta diária."
            icon={<CalendarDays className="h-4 w-4" />}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
                  <p className="text-lg font-bold tabular-nums">{totalDiasUteis}</p>
                  <p className="text-[11px] text-muted-foreground">dias úteis em {MESES[mes - 1]}</p>
                </div>
                <div className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
                  <p className="text-lg font-bold tabular-nums">
                    {diasTrabalhados !== null ? diasTrabalhados : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {diasTrabalhados !== null ? "já trabalhados" : "mês não atual"}
                  </p>
                </div>
              </div>

              {/* O dia de hoje ainda está acontecendo: contá-lo infla o esperado
                  e derruba a projeção/quartil de todo mundo durante o dia. */}
              <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={contarDiaAtual}
                  disabled={!podeGerenciarMetas}
                  onChange={e => setContarDiaAtual(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-primary cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="text-[11px] leading-tight">
                  <span className="font-medium text-foreground">Contar o dia de hoje</span>
                  <span className="block text-muted-foreground">
                    Desmarcado, os dias trabalhados consideram só os dias já fechados — o
                    analítico de hoje ainda está entrando. Afeta a meta diária, a projeção
                    e os quartis.
                  </span>
                </span>
              </label>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Feriados (a operação não trabalha)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    className="h-8 text-sm max-w-[170px]"
                    value={feriadoNovo}
                    disabled={!podeGerenciarMetas}
                    onChange={(e) => setFeriadoNovo(e.target.value)}
                  />
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                    onClick={adicionarFeriado} disabled={!feriadoNovo || !podeGerenciarMetas}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar
                  </Button>
                </div>
                {feriados.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {feriados.map(f => (
                      <Badge key={f} variant="secondary" className="gap-1 text-xs font-normal">
                        {f.split("-").reverse().join("/")}
                        {podeGerenciarMetas && (
                          <button type="button" className="hover:text-destructive"
                            onClick={() => setFeriados(prev => prev.filter(x => x !== f))}>
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Nenhum feriado neste mês.</p>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Quartis de projeção"
            description="Faixas de % da projeção diária (realizado ÷ esperado até hoje). 1º quartil = melhor."
            icon={<Target className="h-4 w-4" />}
          >
            <div className="space-y-2">
              {ordenarQuartis(quartis).map((q, i, arr) => {
                const tetoAcima = i > 0 ? arr[i - 1].min_pct - 1 : null;
                return (
                  <div key={q.quartil} className="flex items-center gap-3">
                    <span className="text-sm font-semibold w-20 shrink-0">{q.quartil}º quartil</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">a partir de</span>
                      <Input
                        className="h-8 w-20 text-sm text-center"
                        value={String(q.min_pct)}
                        disabled={!podeGerenciarMetas}
                        onChange={(e) => setQuartilPct(q.quartil, e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      {tetoAcima !== null ? `${q.min_pct}% – ${tetoAcima}%` : `≥ ${q.min_pct}%`}
                    </span>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground pt-1">
                Com meta + dias úteis configurados, cada operador vê no dashboard a meta
                diária, a projeção e o quartil em que está.
              </p>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Seletor de setor (admin) */}
      {isAdmin && (
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium shrink-0 flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-muted-foreground" /> Setor
          </Label>
          {loadingSetores ? <Skeleton className="h-9 w-56" /> : (
            <Select value={setorSelecionado} onValueChange={setSetorSelecionado}>
              <SelectTrigger className="w-56 h-9"><SelectValue placeholder="Selecione um setor" /></SelectTrigger>
              <SelectContent>
                {setores.filter(s => typeof s?.id === "string" && s.id.length > 0).map(s => (
                  <SelectItem key={s.id} value={s.id}>{String(s.nome ?? "")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {!setorSelecionado && !loadingSetores && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {isAdmin ? "Selecione um setor para configurar as metas." : "Você não está associado a nenhum setor."}
          </CardContent>
        </Card>
      )}

      {setorSelecionado && (
        <>
          {/* Equipes de treinamento — data de início + dias úteis reduzidos */}
          {equipesTreinamento.length > 0 && (
            <SectionCard
              title="Equipes de treinamento"
              description="Equipes que começaram no meio do mês. Informe a data de início — os dias úteis (e a meta diária/projeção da equipe e dos operadores) passam a contar a partir dela."
              icon={<GraduationCap className="h-4 w-4" />}
              badge={equipesTreinamento.length}
            >
              <div className="space-y-2">
                {equipesTreinamento.map(eq => {
                  const inicio = eq.treinamento_inicio ?? "";
                  const uteis = diasUteisDoMes(ano, mes, feriados, inicio || undefined);
                  return (
                    <div key={eq.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-2 sm:w-52 shrink-0">
                        <GraduationCap className="h-4 w-4 text-amber-600 shrink-0" />
                        <p className="text-sm font-medium truncate">{String(eq.nome ?? "")}</p>
                      </div>
                      <div className="flex flex-1 items-center gap-3 flex-wrap">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Início das atividades</Label>
                          <Input
                            type="date"
                            className="h-8 text-sm max-w-[170px]"
                            value={inicio}
                            disabled={!podeGerenciarMetas || salvandoTreino === eq.id}
                            onChange={e => setTreinamentoInicio(eq.id, e.target.value)}
                          />
                        </div>
                        <div className="rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-center">
                          <p className="text-base font-bold tabular-nums">{inicio ? uteis : totalDiasUteis}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {inicio ? "dias úteis no treino" : "sem data — mês cheio"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <p className="text-[11px] text-muted-foreground pt-1">
                  Feriados antes do início são ignorados; feriados após entram no cálculo.
                  Marque/desmarque uma equipe como treinamento na aba <strong>Equipes</strong>.
                </p>
              </div>
            </SectionCard>
          )}

          {/* Meta do Setor */}
          <SectionCard title="Meta do Setor"
            description={`Metas globais para o setor ${setorNome} em ${MESES[mes - 1]}/${ano}`}
            icon={<Building2 className="h-4 w-4" />}>
            {loadingMetas ? <Skeleton className="h-8 w-full my-2" /> : (
              <>
                <MetaRow label={setorNome || "Setor"} sublabel="Meta consolidada do setor"
                  icon={<Building2 className="h-4 w-4" />}
                  input={getInput(setorSelecionado)}
                  disabled={!podeGerenciarMetas}
                  mostrarHO={isPP}
                  numExtras={isBP ? extraCampos.setor : 0}
                  onChangeExtra={(i, v) => onChangeExtra(setorSelecionado, i, v)}
                  onChangeValor={v => onChangeValor(setorSelecionado, v)}
                  onChangeHO={v => onChangeHO(setorSelecionado, v)} />
                {isBP && podeGerenciarMetas && (
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground mt-1"
                    onClick={() => setExtraCampos(p => ({ ...p, setor: p.setor + 1 }))}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar {extraCampos.setor + 2}ª meta
                  </Button>
                )}
              </>
            )}
          </SectionCard>

          {/* Meta por Equipe */}
          <SectionCard title="Meta por Equipe"
            description={`Metas individuais por equipe do setor ${setorNome}`}
            icon={<Users className="h-4 w-4" />} badge={equipes.length}>
            {loadingEquipes ? (
              <div className="space-y-2 py-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : equipes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma equipe encontrada neste setor.</p>
            ) : (
              <div>
                {equipes.filter(eq => typeof eq?.id === "string" && eq.id.length > 0).map(eq => (
                  <MetaRow key={eq.id} label={String(eq.nome ?? "")} sublabel="Equipe"
                    icon={<Users className="h-4 w-4" />}
                    input={getInput(eq.id)}
                    disabled={!podeGerenciarMetas}
                    mostrarHO={isPP}
                    numExtras={isBP ? extraCampos.equipe : 0}
                    onChangeExtra={(i, v) => onChangeExtra(eq.id, i, v)}
                    onChangeValor={v => onChangeValor(eq.id, v)}
                    onChangeHO={v => onChangeHO(eq.id, v)} />
                ))}
                {isBP && podeGerenciarMetas && (
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground mt-1"
                    onClick={() => setExtraCampos(p => ({ ...p, equipe: p.equipe + 1 }))}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar {extraCampos.equipe + 2}ª meta (todas as equipes)
                  </Button>
                )}
              </div>
            )}
          </SectionCard>

          {/* Meta por Operador */}
          <SectionCard title="Meta por Operador"
            description={`Metas individuais por operador do setor ${setorNome}`}
            icon={<User className="h-4 w-4" />} badge={operadoresVisiveis.length}>
            {/* Filtro por equipe */}
            {equipes.length > 0 && (
              <div className="flex items-center gap-2 pb-2 mb-1 border-b border-border">
                <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground shrink-0">Equipe:</span>
                <Select value={equipeFiltroOp || "__todas__"}
                  onValueChange={(v) => setEquipeFiltroOp(v === "__todas__" ? "" : v)}>
                  <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todas__">Todas as equipes</SelectItem>
                    {equipes.map(eq => (
                      <SelectItem key={eq.id} value={eq.id}>{String(eq.nome ?? "")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {loadingOperadores ? (
              <div className="space-y-2 py-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : operadoresVisiveis.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {operadores.length === 0
                  ? "Nenhum operador encontrado neste setor."
                  : "Nenhum operador nesta equipe."}
              </p>
            ) : (
              <div>
                {operadoresVisiveis.map(op => (
                  <MetaRow key={op.id} label={String(op.nome ?? "")}
                    sublabel={op.clonadoDe ? `Operador · clone de ${op.clonadoDe} — meta compartilhada` : "Operador"}
                    icon={<User className="h-4 w-4" />}
                    input={getInput(op.id)}
                    disabled={!podeGerenciarMetas}
                    mostrarHO={isPP}
                    numExtras={isBP ? extraCampos.operador : 0}
                    onChangeExtra={(i, v) => onChangeExtra(op.id, i, v)}
                    onChangeValor={v => onChangeValor(op.id, v)}
                    onChangeHO={v => onChangeHO(op.id, v)} />
                ))}
                {isBP && podeGerenciarMetas && (
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground mt-1"
                    onClick={() => setExtraCampos(p => ({ ...p, operador: p.operador + 1 }))}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar {extraCampos.operador + 2}ª meta (todos os operadores)
                  </Button>
                )}
              </div>
            )}
          </SectionCard>

          {/* ── ÚNICO BOTÃO SALVAR ── */}
          <div className="flex items-center justify-end gap-3 pt-2 pb-6 sticky bottom-0 bg-background/80 backdrop-blur-sm border-t border-border -mx-4 px-4 mt-2">
            <p className="text-xs text-muted-foreground flex-1">
              {temMetas
                ? "Metas preenchidas serão salvas para todos os itens acima."
                : temConfigMes && configDbAtiva
                ? "Salva também os feriados e quartis configurados acima."
                : "Preencha os campos de meta antes de salvar."}
            </p>
            <Button
              size="default"
              className="gap-2 min-w-[140px]"
              onClick={handleSalvarTudo}
              disabled={salvandoTudo || !podeSalvar || !podeGerenciarMetas}
            >
              {salvandoTudo ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</>
              ) : (
                <><Save className="h-4 w-4" /> Salvar Todas</>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
