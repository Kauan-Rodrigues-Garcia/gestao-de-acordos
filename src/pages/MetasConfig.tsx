/**
 * MetasConfig.tsx
 * Página para configurar metas mensais por setor, equipe e operador.
 * Admin: vê e edita tudo.
 * Líder: vê e edita apenas seu setor, suas equipes e seus operadores.
 */

import { useState, useEffect, useCallback } from "react";
import { Target, Save, ChevronLeft, ChevronRight, Building2, Users, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEmpresa } from "@/hooks/useEmpresa";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

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

interface Setor {
  id: string;
  nome: string;
}

interface Equipe {
  id: string;
  nome: string;
  setor_id: string;
}

interface Operador {
  id: string;
  nome: string;
}

interface MetaInput {
  meta_valor: string;
  meta_acordos: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function emptyInput(): MetaInput {
  return { meta_valor: "", meta_acordos: "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: MonthNavigator
// ─────────────────────────────────────────────────────────────────────────────

interface MonthNavigatorProps {
  mes: number;
  ano: number;
  onChange: (mes: number, ano: number) => void;
}

function MonthNavigator({ mes, ano, onChange }: MonthNavigatorProps) {
  function prev() {
    if (mes === 1) onChange(12, ano - 1);
    else onChange(mes - 1, ano);
  }

  function next() {
    if (mes === 12) onChange(1, ano + 1);
    else onChange(mes + 1, ano);
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={prev}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[140px] text-center font-semibold text-sm">
        {MESES[mes - 1]} {ano}
      </span>
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={next}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: MetaForm — inputs de valor e acordos + botão salvar
// ─────────────────────────────────────────────────────────────────────────────

interface MetaFormProps {
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  input: MetaInput;
  onChangeValor: (v: string) => void;
  onChangeAcordos: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
}

function MetaForm({
  label,
  sublabel,
  icon,
  input,
  onChangeValor,
  onChangeAcordos,
  onSave,
  saving,
  disabled,
}: MetaFormProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-3 py-3 border-b border-border last:border-0">
      {/* Nome */}
      <div className="flex items-center gap-2 sm:w-48 shrink-0">
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          {sublabel && <p className="text-xs text-muted-foreground truncate">{sublabel}</p>}
        </div>
      </div>

      {/* Campos */}
      <div className="flex flex-1 items-end gap-2 flex-wrap">
        {/* Meta em valor */}
        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Meta R$</Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
              R$
            </span>
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="0,00"
              value={input.meta_valor}
              disabled={disabled}
              onChange={(e) => onChangeValor(formatBRL(e.target.value))}
            />
          </div>
        </div>

        {/* Meta em acordos */}
        <div className="flex flex-col gap-1 min-w-[110px]">
          <Label className="text-xs text-muted-foreground">Qtd. Acordos</Label>
          <Input
            className="h-8 text-sm"
            type="number"
            placeholder="0"
            min={0}
            value={input.meta_acordos}
            disabled={disabled}
            onChange={(e) => onChangeAcordos(e.target.value)}
          />
        </div>

        {/* Botão salvar */}
        <Button
          size="sm"
          className="h-8 gap-1.5 shrink-0"
          onClick={onSave}
          disabled={saving || disabled}
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: SectionCard
// ─────────────────────────────────────────────────────────────────────────────

interface SectionCardProps {
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: string | number;
}

function SectionCard({ title, description, icon, children, badge }: SectionCardProps) {
  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <CardTitle className="text-base">{title}</CardTitle>
          {badge !== undefined && (
            <Badge variant="secondary" className="text-xs ml-auto">
              {badge}
            </Badge>
          )}
        </div>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export function MetasConfig() {
  const { user, perfil, setorId: liderSetorId } = useAuth();
  const { empresa } = useEmpresa();

  const isAdmin = perfil === "admin";

  // Mês/ano — padrão: mês atual
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());

  // Setor selecionado (admin pode selecionar, líder usa o próprio)
  const [setorSelecionado, setSetorSelecionado] = useState<string>("");

  // Dados
  const [setores, setSetores] = useState<Setor[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);

  // Loading states
  const [loadingSetores, setLoadingSetores] = useState(false);
  const [loadingEquipes, setLoadingEquipes] = useState(false);
  const [loadingOperadores, setLoadingOperadores] = useState(false);
  const [loadingMetas, setLoadingMetas] = useState(false);

  // Saving states: key = `tipo:referencia_id`
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

  // Inputs controlados: key = referencia_id
  const [inputMetas, setInputMetas] = useState<Record<string, MetaInput>>({});

  // ── Helpers de input ─────────────────────────────────────────────────────

  function getInput(referenciaId: string): MetaInput {
    return inputMetas[referenciaId] ?? emptyInput();
  }

  function setInput(referenciaId: string, patch: Partial<MetaInput>) {
    setInputMetas((prev) => ({
      ...prev,
      [referenciaId]: { ...(prev[referenciaId] ?? emptyInput()), ...patch },
    }));
  }

  // ── Carregar setores ─────────────────────────────────────────────────────

  const fetchSetores = useCallback(async () => {
    if (!empresa?.id) return;
    setLoadingSetores(true);
    try {
      const { data, error } = await supabase
        .from("setores")
        .select("*")
        .eq("empresa_id", empresa.id)
        .order("nome");
      if (error) throw error;
      setSetores(data ?? []);

      // Definir setor inicial
      if (isAdmin) {
        if (!setorSelecionado && data?.length) setSetorSelecionado(data[0].id);
      } else {
        // Líder: usa o próprio setor
        if (liderSetorId) setSetorSelecionado(liderSetorId);
      }
    } catch (err: any) {
      toast.error("Erro ao carregar setores", { description: err.message });
    } finally {
      setLoadingSetores(false);
    }
  }, [empresa?.id, isAdmin, liderSetorId]);

  // ── Carregar equipes e operadores do setor ───────────────────────────────

  const fetchEquipes = useCallback(async () => {
    if (!setorSelecionado) return;
    setLoadingEquipes(true);
    try {
      const { data, error } = await supabase
        .from("equipes")
        .select("*")
        .eq("setor_id", setorSelecionado)
        .order("nome");
      if (error) throw error;
      setEquipes(data ?? []);
    } catch (err: any) {
      toast.error("Erro ao carregar equipes", { description: err.message });
    } finally {
      setLoadingEquipes(false);
    }
  }, [setorSelecionado]);

  const fetchOperadores = useCallback(async () => {
    if (!setorSelecionado) return;
    setLoadingOperadores(true);
    try {
      const { data, error } = await supabase
        .from("perfis")
        .select("id, nome")
        .eq("setor_id", setorSelecionado)
        .eq("perfil", "operador")
        .order("nome");
      if (error) throw error;
      setOperadores(data ?? []);
    } catch (err: any) {
      toast.error("Erro ao carregar operadores", { description: err.message });
    } finally {
      setLoadingOperadores(false);
    }
  }, [setorSelecionado]);

  // ── Carregar metas do período ────────────────────────────────────────────

  const fetchMetas = useCallback(async () => {
    if (!empresa?.id) return;
    setLoadingMetas(true);
    try {
      const { data, error } = await supabase
        .from("metas")
        .select("*")
        .eq("empresa_id", empresa.id)
        .eq("mes", mes)
        .eq("ano", ano);
      if (error) throw error;
      const loaded: Meta[] = data ?? [];
      setMetas(loaded);

      // Popular inputs com valores existentes
      const newInputs: Record<string, MetaInput> = {};
      for (const m of loaded) {
        newInputs[m.referencia_id] = {
          meta_valor: m.meta_valor > 0
            ? m.meta_valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : "",
          meta_acordos: m.meta_acordos > 0 ? String(m.meta_acordos) : "",
        };
      }
      setInputMetas(newInputs);
    } catch (err: any) {
      toast.error("Erro ao carregar metas", { description: err.message });
    } finally {
      setLoadingMetas(false);
    }
  }, [empresa?.id, mes, ano]);

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => { fetchSetores(); }, [fetchSetores]);
  useEffect(() => { fetchEquipes(); }, [fetchEquipes]);
  useEffect(() => { fetchOperadores(); }, [fetchOperadores]);
  useEffect(() => { fetchMetas(); }, [fetchMetas]);

  // ── Upsert genérico ──────────────────────────────────────────────────────

  async function handleSave(tipo: TipoMeta, referenciaId: string) {
    if (!empresa?.id) return;

    const key = `${tipo}:${referenciaId}`;
    const input = getInput(referenciaId);

    const meta_valor = parseBRL(input.meta_valor);
    const meta_acordos = parseInt(input.meta_acordos, 10) || 0;

    setSavingMap((prev) => ({ ...prev, [key]: true }));

    try {
      const payload: Omit<Meta, "id"> = {
        tipo,
        referencia_id: referenciaId,
        empresa_id: empresa.id,
        meta_valor,
        meta_acordos,
        mes,
        ano,
      };

      const { error } = await supabase
        .from("metas")
        .upsert(payload, { onConflict: "tipo,referencia_id,empresa_id,mes,ano" });

      if (error) throw error;

      toast.success("Meta salva com sucesso!", {
        description: `${MESES[mes - 1]}/${ano}`,
      });

      // Atualizar cache local de metas
      await fetchMetas();
    } catch (err: any) {
      toast.error("Erro ao salvar meta", { description: err.message });
    } finally {
      setSavingMap((prev) => ({ ...prev, [key]: false }));
    }
  }

  // ── Render: setor selecionado (objeto) ───────────────────────────────────

  const setorAtual = setores.find((s) => s.id === setorSelecionado);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* ── Cabeçalho da página ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Configurar Metas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Defina metas mensais por setor, equipe e operador.
          </p>
        </div>

        {/* Navegador de mês/ano */}
        <MonthNavigator
          mes={mes}
          ano={ano}
          onChange={(m, a) => { setMes(m); setAno(a); }}
        />
      </div>

      <Separator />

      {/* ── Seletor de setor (somente admin) ────────────────────────────── */}
      {isAdmin && (
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium shrink-0 flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Setor
          </Label>
          {loadingSetores ? (
            <Skeleton className="h-9 w-56" />
          ) : (
            <Select
              value={setorSelecionado}
              onValueChange={setSetorSelecionado}
            >
              <SelectTrigger className="w-56 h-9">
                <SelectValue placeholder="Selecione um setor" />
              </SelectTrigger>
              <SelectContent>
                {setores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* ── Sem setor selecionado ─────────────────────────────────────── */}
      {!setorSelecionado && !loadingSetores && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {isAdmin
              ? "Selecione um setor para configurar as metas."
              : "Você não está associado a nenhum setor."}
          </CardContent>
        </Card>
      )}

      {setorSelecionado && (
        <>
          {/* ── SEÇÃO 1: Meta do Setor ─────────────────────────────────── */}
          <SectionCard
            title="Meta do Setor"
            description={`Metas globais para o setor ${setorAtual?.nome ?? ""} em ${MESES[mes - 1]}/${ano}`}
            icon={<Building2 className="h-4 w-4" />}
          >
            {loadingMetas ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <MetaForm
                label={setorAtual?.nome ?? "Setor"}
                sublabel="Meta consolidada do setor"
                icon={<Building2 className="h-4 w-4" />}
                input={getInput(setorSelecionado)}
                onChangeValor={(v) => setInput(setorSelecionado, { meta_valor: v })}
                onChangeAcordos={(v) => setInput(setorSelecionado, { meta_acordos: v })}
                onSave={() => handleSave("setor", setorSelecionado)}
                saving={!!savingMap[`setor:${setorSelecionado}`]}
              />
            )}
          </SectionCard>

          {/* ── SEÇÃO 2: Meta por Equipe ───────────────────────────────── */}
          <SectionCard
            title="Meta por Equipe"
            description={`Metas individuais por equipe do setor ${setorAtual?.nome ?? ""}`}
            icon={<Users className="h-4 w-4" />}
            badge={equipes.length}
          >
            {loadingEquipes ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : equipes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhuma equipe encontrada neste setor.
              </p>
            ) : (
              <div>
                {equipes.map((eq) => (
                  <MetaForm
                    key={eq.id}
                    label={eq.nome}
                    sublabel="Equipe"
                    icon={<Users className="h-4 w-4" />}
                    input={getInput(eq.id)}
                    onChangeValor={(v) => setInput(eq.id, { meta_valor: v })}
                    onChangeAcordos={(v) => setInput(eq.id, { meta_acordos: v })}
                    onSave={() => handleSave("equipe", eq.id)}
                    saving={!!savingMap[`equipe:${eq.id}`]}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          {/* ── SEÇÃO 3: Meta por Operador ────────────────────────────── */}
          <SectionCard
            title="Meta por Operador"
            description={`Metas individuais por operador do setor ${setorAtual?.nome ?? ""}`}
            icon={<User className="h-4 w-4" />}
            badge={operadores.length}
          >
            {loadingOperadores ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : operadores.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum operador encontrado neste setor.
              </p>
            ) : (
              <div>
                {operadores.map((op) => (
                  <MetaForm
                    key={op.id}
                    label={op.nome}
                    sublabel="Operador"
                    icon={<User className="h-4 w-4" />}
                    input={getInput(op.id)}
                    onChangeValor={(v) => setInput(op.id, { meta_valor: v })}
                    onChangeAcordos={(v) => setInput(op.id, { meta_acordos: v })}
                    onSave={() => handleSave("operador", op.id)}
                    saving={!!savingMap[`operador:${op.id}`]}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
