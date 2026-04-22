/**
 * MetasConfig.tsx — v4
 * Um único botão "Salvar Todas" no rodapé, sem botão por linha.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Target, Save, ChevronLeft, ChevronRight, Building2, Users, User, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEmpresa } from "@/hooks/useEmpresa";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
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
  mes: number;
  ano: number;
}
interface Setor  { id: string; nome: string; }
interface Equipe { id: string; nome: string; setor_id: string; }
interface Operador { id: string; nome: string; }
interface MetaInput { meta_valor: string; }

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

function emptyInput(): MetaInput { return { meta_valor: "" }; }

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
  disabled?: boolean;
}

function MetaRow({ label, sublabel, icon, input, onChangeValor, disabled }: MetaRowProps) {
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
  const isAdmin = perfil?.perfil === "administrador" || perfil?.perfil === "super_admin";

  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [setorSelecionado, setSetorSelecionado] = useState<string>("");

  const [setores,    setSetores]    = useState<Setor[]>([]);
  const [equipes,    setEquipes]    = useState<Equipe[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);

  const [loadingSetores,    setLoadingSetores]    = useState(false);
  const [loadingEquipes,    setLoadingEquipes]    = useState(false);
  const [loadingOperadores, setLoadingOperadores] = useState(false);
  const [loadingMetas,      setLoadingMetas]      = useState(false);
  const [salvandoTudo,      setSalvandoTudo]      = useState(false);

  // inputs controlados por referencia_id
  const [inputMetas, setInputMetas] = useState<Record<string, MetaInput>>({});

  function getInput(id: string): MetaInput { return inputMetas[id] ?? emptyInput(); }
  function setInput(id: string, patch: Partial<MetaInput>) {
    setInputMetas(prev => ({ ...prev, [id]: { ...(prev[id] ?? emptyInput()), ...patch } }));
  }

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
      const { data, error } = await supabase.from("equipes").select("id, nome, setor_id")
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
      const { data, error } = await supabase.from("perfis").select("id, nome")
        .eq("setor_id", setorSelecionado).eq("perfil", "operador").order("nome");
      if (error) throw error;
      setOperadores((data ?? []).filter((o): o is Operador => typeof o?.id === "string" && o.id.length > 0));
    } catch (err: unknown) {
      toast.error("Erro ao carregar operadores", { description: err instanceof Error ? err.message : String(err) });
    } finally { setLoadingOperadores(false); }
  }, [setorSelecionado]);

  const fetchMetas = useCallback(async () => {
    if (!empresa?.id) return;
    setLoadingMetas(true);
    try {
      const { data, error } = await supabase.from("metas").select("*")
        .eq("empresa_id", empresa.id).eq("mes", mes).eq("ano", ano);
      if (error) throw error;
      const loaded: Meta[] = (data ?? []) as Meta[];
      const newInputs: Record<string, MetaInput> = {};
      for (const m of loaded) {
        if (!m?.referencia_id) continue;
        const v = Number(m.meta_valor) || 0;
        newInputs[m.referencia_id] = {
          meta_valor: v > 0 ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
        };
      }
      setInputMetas(newInputs);
    } catch (err: unknown) {
      toast.error("Erro ao carregar metas", { description: err instanceof Error ? err.message : String(err) });
    } finally { setLoadingMetas(false); }
  }, [empresa?.id, mes, ano]);

  useEffect(() => { fetchSetores(); }, [fetchSetores]);
  useEffect(() => { fetchEquipes(); }, [fetchEquipes]);
  useEffect(() => { fetchOperadores(); }, [fetchOperadores]);
  useEffect(() => { fetchMetas(); }, [fetchMetas]);

  // ── Salvar TODAS as metas de uma vez ──────────────────────────────────────
  async function handleSalvarTudo() {
    if (!empresa?.id || !setorSelecionado) return;
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
        mes,
        ano,
      }))
      .filter(p => p.meta_valor > 0); // só salva quem tem valor

    if (payloads.length === 0) {
      toast.warning("Preencha ao menos uma meta antes de salvar.");
      setSalvandoTudo(false);
      return;
    }

    try {
      const { error } = await supabase.from("metas")
        .upsert(payloads, { onConflict: "tipo,referencia_id,empresa_id,mes,ano" });
      if (error) throw error;
      toast.success(`${payloads.length} meta(s) salva(s) com sucesso!`, {
        description: `${MESES[mes - 1]}/${ano}`,
      });
      await fetchMetas();
    } catch (err: unknown) {
      toast.error("Erro ao salvar metas", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSalvandoTudo(false);
    }
  }

  const setorNome = setores.find(s => s.id === setorSelecionado)?.nome ?? "";
  const temMetas = Object.values(inputMetas).some(v => v.meta_valor.trim() !== "");

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
          {/* Meta do Setor */}
          <SectionCard title="Meta do Setor"
            description={`Metas globais para o setor ${setorNome} em ${MESES[mes - 1]}/${ano}`}
            icon={<Building2 className="h-4 w-4" />}>
            {loadingMetas ? <Skeleton className="h-8 w-full my-2" /> : (
              <MetaRow label={setorNome || "Setor"} sublabel="Meta consolidada do setor"
                icon={<Building2 className="h-4 w-4" />}
                input={getInput(setorSelecionado)}
                onChangeValor={v => setInput(setorSelecionado, { meta_valor: v })} />
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
                    onChangeValor={v => setInput(eq.id, { meta_valor: v })} />
                ))}
              </div>
            )}
          </SectionCard>

          {/* Meta por Operador */}
          <SectionCard title="Meta por Operador"
            description={`Metas individuais por operador do setor ${setorNome}`}
            icon={<User className="h-4 w-4" />} badge={operadores.length}>
            {loadingOperadores ? (
              <div className="space-y-2 py-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : operadores.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum operador encontrado neste setor.</p>
            ) : (
              <div>
                {operadores.filter(op => typeof op?.id === "string" && op.id.length > 0).map(op => (
                  <MetaRow key={op.id} label={String(op.nome ?? "")} sublabel="Operador"
                    icon={<User className="h-4 w-4" />}
                    input={getInput(op.id)}
                    onChangeValor={v => setInput(op.id, { meta_valor: v })} />
                ))}
              </div>
            )}
          </SectionCard>

          {/* ── ÚNICO BOTÃO SALVAR ── */}
          <div className="flex items-center justify-end gap-3 pt-2 pb-6 sticky bottom-0 bg-background/80 backdrop-blur-sm border-t border-border -mx-4 px-4 mt-2">
            <p className="text-xs text-muted-foreground flex-1">
              {temMetas
                ? "Metas preenchidas serão salvas para todos os itens acima."
                : "Preencha os campos de meta antes de salvar."}
            </p>
            <Button
              size="default"
              className="gap-2 min-w-[140px]"
              onClick={handleSalvarTudo}
              disabled={salvandoTudo || !temMetas}
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
