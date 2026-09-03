/**
 * MetasConfig.tsx — v5
 *
 * ## Não há mais botão de salvar
 *
 * Cada linha grava sozinha quando o campo perde o foco. O botão "Salvar Todas"
 * saiu, e com ele o estado que ninguém via: metas digitadas e não gravadas
 * porque a pessoa trocou de mês, fechou a aba ou simplesmente não rolou até o
 * rodapé.
 *
 * ## O que grava, e quando
 *
 *   campo de meta      → ao perder o foco (`onBlur`), a linha inteira;
 *   caixa de seleção   → na hora, porque marcar já é a decisão;
 *   dias úteis/quartis → 800 ms depois da última mexida.
 *
 * A linha é a unidade de gravação, e não o campo: meta e meta H.O. são o mesmo
 * número em duas leituras, e as metas extras da BookPlay viajam no mesmo
 * `upsert`. Gravar campo a campo mandaria três escritas para uma edição só.
 *
 * ## Nada é gravado duas vezes
 *
 * `assinaturasSalvas` guarda o que o banco já tem de cada linha. Passar o
 * cursor por dez campos sem digitar nada não escreve nada — sem isso, navegar
 * de Tab pela tela viraria uma escrita por parada.
 *
 * ## Linha em branco continua não virando linha no banco
 *
 * O comportamento é o do botão que saiu: meta zerada não é gravada. Apagar o
 * valor de quem já tem meta NÃO apaga a meta — para tirar a meta de alguém
 * existe a tela de exclusões, não o campo em branco.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Target, Check, ChevronLeft, ChevronRight, Building2, Users, User, ArrowLeft,
  TriangleAlert,
  Loader2, CalendarDays, Plus, X, Layers, GraduationCap, Lock, LockOpen, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useEmpresa } from "@/hooks/useEmpresa";
import { useCargoPermissoes } from "@/hooks/useCargoPermissoes";
import { supabase } from "@/lib/supabase";
import type { QuartilConfig } from "@/lib/supabase";
import { useTenant } from "@/lib/tenant-config";
import { PP_HO_PERCENTUAL, getTodayISO } from "@/lib/index";
import { diasUteisDoMes, diasUteisDecorridos, ordenarQuartis, QUARTIS_PADRAO } from "@/lib/diasUteis";
import { getMetasConfig, upsertMetasConfig } from "@/services/metas/metasConfig.service";
import {
  getMetaValidacaoStatus, upsertMetas, validarMetaSetor, reabrirMetaSetor,
  type MetaValidacaoStatus,
} from "@/services/metas/metasValidacao.service";
import { listarClonesEquipes } from "@/services/equipes/equipesClones.service";
import { limparAvisoDeFerias } from "@/services/situacaoUsuario.service";
import { AvisoVoltouDeFerias } from "@/components/TagFerias";
import {
  fetchDiretoExtraConfigs, resolverDiretoExtraAtivo, type DiretoExtraConfig,
} from "@/services/direto_extra.service";
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
  meta_proporcional: boolean;
  /** Meta direta e indireta `[PP]` — migration 20260818160000. */
  meta_indireta_ativa?: boolean;
  meta_indireta_valor?: number;
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
  /**
   * Setor de ORIGEM da pessoa, não o setor em exibição.
   *
   * Importa porque a cascata de Direto/Extra é usuário → equipe → setor: um
   * clone aparece nesta tela sob o setor que o tomou emprestado, e resolver a
   * lógica dele pelo setor da tela daria a resposta do setor errado.
   */
  setor_id: string | null;
  /** Nome do setor de origem quando o operador entra aqui como CLONE. A meta é
   *  a mesma nos dois setores — a linha em `metas` é por operador, sem setor. */
  clonadoDe?: string | null;
  situacao?: string | null;
  /**
   * Rastro das últimas férias, para avisar quem define a meta.
   *
   * A meta é mensal e as férias não: quem esteve fora meia competência não
   * entrega o mês cheio, e essa informação não aparece em lugar nenhum na hora
   * de digitar o número — no fim do mês a meta está batida ou não, e ninguém
   * lembra do motivo. Zerado ao salvar (`limparAvisoDeFerias`).
   */
  ferias_ate?: string | null;
}
interface MetaInput {
  meta_valor: string; meta_ho: string; extras: string[]; proporcional: boolean;
  /**
   * Meta direta e indireta `[PP]` — só para operador com Direto/Extra ativo.
   *
   * Desligada, `meta_valor` é a meta cheia e nada muda. Ligada, `meta_valor`
   * passa a ser a meta DIRETA e `meta_indireta` cobra os acordos extra pagos.
   */
  indiretaAtiva: boolean;
  meta_indireta: string;
  meta_indireta_ho: string;
}

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

function emptyInput(): MetaInput {
  return {
    meta_valor: "", meta_ho: "", extras: [], proporcional: false,
    indiretaAtiva: false, meta_indireta: "", meta_indireta_ho: "",
  };
}

/**
 * O que, nesta linha, faz diferença para o banco.
 *
 * Compara VALOR e não texto: `5.000,00` e `5000,00` são a mesma meta, e
 * reformatar um campo ao sair dele não pode disparar uma escrita.
 *
 * `meta_ho` e `meta_indireta_ho` ficam de fora porque são o mesmo número em
 * outra leitura — quem os grava é a coluna de origem, e incluí-los aqui só
 * criaria diferença onde não há.
 */
function assinaturaDaLinha(input: MetaInput): string {
  return JSON.stringify([
    parseBRL(input.meta_valor),
    input.proporcional,
    input.extras.map(parseBRL).filter(v => v > 0),
    input.indiretaAtiva,
    parseBRL(input.meta_indireta),
  ]);
}

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

/** O que a linha está fazendo agora. Ausente = parada, sem nada a dizer. */
type EstadoLinha = "salvando" | "salvo" | "erro";

/**
 * O selo de gravação da linha.
 *
 * Sem botão de salvar, é a única coisa que responde «foi?». Fica discreto de
 * propósito: quem preenche trinta metas não quer trinta confirmações verdes
 * piscando — quer saber quando algo NÃO foi.
 */
function SeloLinha({ estado }: { estado?: EstadoLinha }) {
  if (!estado) return <span className="w-16 shrink-0" />;
  return (
    <span className={cn(
      "flex w-16 shrink-0 items-center gap-1 text-[11px]",
      estado === "erro" ? "text-destructive" : "text-muted-foreground",
    )}>
      {estado === "salvando" && (<><Loader2 className="h-3 w-3 animate-spin" /> …</>)}
      {estado === "salvo"    && (<><Check className="h-3 w-3 text-emerald-500" /> salvo</>)}
      {estado === "erro"     && (<><TriangleAlert className="h-3 w-3" /> erro</>)}
    </span>
  );
}

// ── MetaRow — linha de input SEM botão salvar individual ─────────────────────
interface MetaRowProps {
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  /**
   * Grava esta linha. Chamado no `onBlur` de cada campo e logo depois de
   * qualquer caixa de seleção mudar.
   *
   * As caixas mandam o valor novo junto (`patch`) porque o estado do React
   * ainda não terá sido aplicado quando o `onChange` retorna — ler o estado
   * aqui gravaria o valor ANTERIOR da caixa.
   */
  onGravar: (patch?: Partial<MetaInput>) => void;
  estado?: EstadoLinha;
  /** Etiqueta ao lado do nome — hoje só o «esteve de férias». */
  aviso?: React.ReactNode;
  input: MetaInput;
  onChangeValor: (v: string) => void;
  /** PaguePlay: campo Meta H.O. (24,96% do total, conversão bidirecional). */
  mostrarHO?: boolean;
  onChangeHO?: (v: string) => void;
  /** BookPlay: quantidade de campos de metas extras (2ª, 3ª…). */
  numExtras?: number;
  onChangeExtra?: (idx: number, v: string) => void;
  disabled?: boolean;
  /** Meta proporcional: operador recém-chegado/retorno de férias, meta menor
   *  que a cheia. Sinaliza pro jogo (pet) não tratar igual quem tem meta cheia. */
  proporcional: boolean;
  onChangeProporcional: (v: boolean) => void;
  /**
   * Oferece a opção "Meta direta e indireta" `[PP]`.
   *
   * Só é `true` para operador com a lógica Direto/Extra ativa: sem ela não há
   * acordo extra para cobrar, e um campo de meta que ninguém consegue alimentar
   * é pior que campo nenhum.
   */
  permiteIndireta?: boolean;
  onChangeIndiretaAtiva?: (v: boolean) => void;
  onChangeIndireta?: (v: string) => void;
  onChangeIndiretaHO?: (v: string) => void;
}

function MetaRow({
  label, sublabel, icon, aviso, input, onChangeValor, mostrarHO, onChangeHO,
  numExtras = 0, onChangeExtra, disabled, proporcional, onChangeProporcional,
  permiteIndireta, onChangeIndiretaAtiva, onChangeIndireta, onChangeIndiretaHO,
  onGravar, estado,
}: MetaRowProps) {
  return (
    <div className="py-2.5 border-b border-border last:border-0">
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-2 sm:w-52 shrink-0">
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{String(label ?? "")}</p>
          {sublabel && <p className="text-xs text-muted-foreground truncate">{sublabel}</p>}
          {aviso && <div className="mt-0.5">{aviso}</div>}
        </div>
        <SeloLinha estado={estado} />
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="flex flex-col gap-1 min-w-[150px] max-w-[200px]">
          <Label className="text-xs text-muted-foreground">
            {input.indiretaAtiva ? "Meta DIRETA R$" : "Meta R$"}
          </Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="0,00"
              value={input.meta_valor}
              disabled={disabled}
              onChange={(e) => onChangeValor(formatBRL(e.target.value))}
              onBlur={() => onGravar()}
            />
          </div>
        </div>
        {mostrarHO && (
          <div className="flex flex-col gap-1 min-w-[150px] max-w-[200px]">
            <Label className="text-xs text-muted-foreground">
              {input.indiretaAtiva ? "Meta DIRETA H.O." : "Meta H.O."} (24,96%)
            </Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="0,00"
                value={input.meta_ho}
                disabled={disabled}
                onChange={(e) => onChangeHO?.(formatBRL(e.target.value))}
                onBlur={() => onGravar()}
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
                onBlur={() => onGravar()}
              />
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-1 shrink-0">
          <Label className="text-xs text-muted-foreground">&nbsp;</Label>
          <label className="h-8 flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={proporcional}
              disabled={disabled}
              onChange={(e) => { onChangeProporcional(e.target.checked); onGravar({ proporcional: e.target.checked }); }}
              className="h-3.5 w-3.5 accent-primary cursor-pointer disabled:cursor-not-allowed"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">Meta proporcional</span>
          </label>
        </div>
        {/* Só aparece para quem tem Direto/Extra ativo — ver `permiteIndireta`. */}
        {permiteIndireta && (
          <div className="flex flex-col gap-1 shrink-0">
            <Label className="text-xs text-muted-foreground">&nbsp;</Label>
            <label className="h-8 flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={input.indiretaAtiva}
                disabled={disabled}
                onChange={(e) => { onChangeIndiretaAtiva?.(e.target.checked); onGravar({ indiretaAtiva: e.target.checked }); }}
                className="h-3.5 w-3.5 accent-primary cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Meta direta e indireta
              </span>
            </label>
          </div>
        )}
      </div>
    </div>

    {/* ── Segunda linha: a meta indireta ─────────────────────────────────── */}
    {permiteIndireta && input.indiretaAtiva && (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2 ml-0 sm:ml-52 pl-3 border-l-2 border-primary/40">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex flex-col gap-1 min-w-[150px] max-w-[200px]">
            <Label className="text-xs text-primary font-medium">Meta INDIRETA R$</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="0,00"
                value={input.meta_indireta}
                disabled={disabled}
                onChange={(e) => onChangeIndireta?.(formatBRL(e.target.value))}
                onBlur={() => onGravar()}
              />
            </div>
          </div>
          {mostrarHO && (
            <div className="flex flex-col gap-1 min-w-[150px] max-w-[200px]">
              <Label className="text-xs text-primary font-medium">Meta INDIRETA H.O. (24,96%)</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder="0,00"
                  value={input.meta_indireta_ho}
                  disabled={disabled}
                  onChange={(e) => onChangeIndiretaHO?.(formatBRL(e.target.value))}
                  onBlur={() => onGravar()}
                />
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground max-w-[420px] leading-snug">
            Cobrada sobre os acordos <strong>EXTRA pagos</strong> do operador no mês.
            Não soma na equipe nem no setor. O quartil dele passa a ser calculado
            pela soma das duas metas contra a soma dos dois recebimentos.
          </p>
        </div>
      </div>
    )}
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
  // Editar, excluir e mexer nos dias uteis eram tres listas de cargo
  // diferentes no RLS. Agora sao tres interruptores.
  const podeGerenciarMetas = temPermissao("metas_editar");
  const podeExcluirMetas = temPermissao("metas_excluir");
  const podeEditarDiasUteis = temPermissao("metas_editar_dias_uteis");
  const podeExcluirDiasUteis = temPermissao("metas_excluir_dias_uteis");

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
  /** referencia_id → o que a linha está fazendo. Ver `SeloLinha`. */
  const [estadoLinhas, setEstadoLinhas] = useState<Record<string, EstadoLinha>>({});
  /**
   * O que o banco JÁ TEM de cada linha, como assinatura.
   *
   * É a trava que faz passar o cursor por dez campos sem digitar não escrever
   * nada. Fica num `ref` e não no estado porque mudá-la não redesenha nada — e
   * porque `salvarLinha` precisa do valor mais recente, não do que existia
   * quando o `onBlur` foi montado.
   */
  const assinaturasSalvas = useRef<Record<string, string>>({});

  // Config mensal (PP): feriados + quartis (metas_config_mes)
  const [feriados,      setFeriados]      = useState<string[]>([]);
  const [quartis,       setQuartis]       = useState<QuartilConfig[]>(QUARTIS_PADRAO);
  const [feriadoNovo,   setFeriadoNovo]   = useState<string>("");
  // Contar o dia de hoje nos dias trabalhados. Padrão false: o dia atual ainda
  // está acontecendo, o analítico dele só fecha no fim do expediente.
  const [contarDiaAtual, setContarDiaAtual] = useState(false);
  const [configDbAtiva, setConfigDbAtiva] = useState(true);
  const [configCarregada, setConfigCarregada] = useState(false);
  /*
   * O retrato do que veio do banco — e a razão de ele existir.
   *
   * `metas_config_mes` é UMA linha por empresa/mês, mas quem salva é cada
   * líder, do próprio setor, mandando junto o que estava na tela dele. Um
   * feriado cadastrado às 11h ia embora às 11h47, quando o líder seguinte —
   * que abrira a página antes, com a lista ainda vazia — salvava as metas do
   * setor dele e reescrevia o feriado como `[]`. Sem erro nenhum: o UPDATE
   * acontecia, só levava o valor velho de volta. Em agosto foram 18 dessas
   * escritas, de doze pessoas diferentes, na mesma linha.
   *
   * Com o retrato, só escrevemos a config quando a tela DIVERGE dele: quem
   * mexeu apenas em meta não encosta mais no calendário do mês.
   */
  const [configOriginal, setConfigOriginal] = useState<{
    feriados: string[]; quartis: QuartilConfig[]; contarDiaAtual: boolean;
  }>({ feriados: [], quartis: QUARTIS_PADRAO, contarDiaAtual: false });

  // Configs de Direto/Extra da empresa — a base do "quem pode ter meta indireta"
  const [diretoExtraConfigs, setDiretoExtraConfigs] = useState<DiretoExtraConfig[]>([]);

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
  function onChangeProporcional(id: string, v: boolean) {
    setInput(id, { proporcional: v });
  }

  // ── Meta direta e indireta [PP] ──────────────────────────────────────────
  // Desligar limpa os dois campos: o banco recusa `ativa = true` com valor zero
  // (constraint `metas_indireta_coerente`), e deixar um valor órfão na tela faria
  // religar a opção ressuscitar um número que o líder já tinha descartado.
  function onChangeIndiretaAtiva(id: string, v: boolean) {
    setInput(id, v ? { indiretaAtiva: true }
                   : { indiretaAtiva: false, meta_indireta: "", meta_indireta_ho: "" });
  }
  function onChangeIndireta(id: string, v: string) {
    const total = parseBRL(v);
    setInput(id, { meta_indireta: v, meta_indireta_ho: fmtNum(total * PP_HO_PERCENTUAL) });
  }
  function onChangeIndiretaHO(id: string, v: string) {
    const ho = parseBRL(v);
    setInput(id, { meta_indireta_ho: v, meta_indireta: fmtNum(ho / PP_HO_PERCENTUAL) });
  }

  /**
   * Quem tem Direto/Extra ativo — a cascata usuário → equipe → setor.
   *
   * Uma consulta só de `direto_extra_config` e a resolução em memória pela
   * função que já existe (`resolverDiretoExtraAtivo`). A alternativa seria uma
   * chamada de `fn_direto_extra_ativo` por operador: com 40 pessoas no setor,
   * 40 idas ao servidor para desenhar uma caixa de seleção.
   */
  const comDiretoExtra = useMemo(() => {
    if (!isPP || !diretoExtraConfigs.length) return new Set<string>();
    const ativos = new Set<string>();
    for (const op of operadores) {
      const ativo = resolverDiretoExtraAtivo({
        userId: op.id,
        userSetorId: op.setor_id ?? setorSelecionado,
        userEquipeId: op.equipe_id,
        configs: diretoExtraConfigs,
      });
      if (ativo) ativos.add(op.id);
    }
    return ativos;
  }, [isPP, diretoExtraConfigs, operadores, setorSelecionado]);

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

  // A tela diverge do que veio do banco? (ver `configOriginal`)
  const configAlterada = useMemo(() => {
    const chaveQuartis = (qs: QuartilConfig[]) =>
      ordenarQuartis(qs).map(q => `${q.quartil}:${q.min_pct}`).join("|");
    return contarDiaAtual !== configOriginal.contarDiaAtual
      || [...feriados].sort().join(",") !== [...configOriginal.feriados].sort().join(",")
      || chaveQuartis(quartis) !== chaveQuartis(configOriginal.quartis);
  }, [feriados, quartis, contarDiaAtual, configOriginal]);

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
      const { data, error } = await supabase.from("perfis").select("id, nome, equipe_id, setor_id, situacao, ferias_ate")
        .eq("setor_id", setorSelecionado).in("perfil", ["operador", "elite"]).order("nome");
      if (error) throw error;
      const proprios = ((data ?? []) as unknown as Operador[])
        .filter((o): o is Operador => typeof o?.id === "string" && o.id.length > 0);
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
      .select("id, nome, setor_id, situacao, ferias_ate").in("id", faltando)
      .in("perfil", ["operador", "elite"]).order("nome");
    const linhas = (perfisClonados ?? []) as unknown as { id: string; nome: string; setor_id: string | null; situacao?: string | null; ferias_ate?: string | null }[];
    if (!linhas.length) return [];

    // Nome do setor de origem para a etiqueta (o líder pode não ter esse setor carregado)
    const origemIds = [...new Set(linhas.map(l => l.setor_id).filter((s): s is string => !!s))];
    const { data: setoresOrigem } = await supabase.from("setores").select("id, nome").in("id", origemIds);
    const nomeOrigem = new Map(((setoresOrigem ?? []) as { id: string; nome: string }[]).map(s => [s.id, s.nome]));

    return linhas.map(l => ({
      id: l.id,
      nome: l.nome,
      equipe_id: equipeAqui.get(l.id) ?? null,
      setor_id: l.setor_id,
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
        const ind = Number(m.meta_indireta_valor) || 0;
        newInputs[m.referencia_id] = {
          meta_valor: fmtNum(v),
          meta_ho:    fmtNum(v * PP_HO_PERCENTUAL),
          extras:     extras.map(fmtNum),
          proporcional: m.meta_proporcional === true,
          // `ativa && valor > 0` e não só a flag: a constraint do banco garante
          // o par, mas uma linha gravada antes da migration vem com a coluna no
          // default e a leitura tem de sobreviver a isso.
          indiretaAtiva:    m.meta_indireta_ativa === true && ind > 0,
          meta_indireta:    fmtNum(ind),
          meta_indireta_ho: fmtNum(ind * PP_HO_PERCENTUAL),
        };
        if (m.tipo && extras.length > maxExtras[m.tipo]) maxExtras[m.tipo] = extras.length;
      }
      setInputMetas(newInputs);
      setExtraCampos(maxExtras);
      /*
       * A semente das assinaturas: o que o banco acabou de devolver JÁ está
       * gravado. Sem isto, o primeiro blur em cada linha regravaria as metas
       * do mês inteiro sem ninguém ter mudado nada — e trocar de mês
       * carregaria o mês novo e o reescreveria em seguida.
       */
      const semente: Record<string, string> = {};
      for (const id of Object.keys(newInputs)) {
        semente[id] = assinaturaDaLinha(newInputs[id]);
      }
      assinaturasSalvas.current = semente;
      setEstadoLinhas({});
    } catch (err: unknown) {
      toast.error("Erro ao carregar metas", { description: err instanceof Error ? err.message : String(err) });
    } finally { setLoadingMetas(false); }
  }, [empresa?.id, mes, ano]);

  // Config mensal (feriados + quartis) — PP
  const fetchConfig = useCallback(async () => {
    if (!empresa?.id || !temConfigMes) { setConfigCarregada(true); return; }
    const { data, dbAtiva } = await getMetasConfig(empresa.id, mes, ano);
    const doBanco = {
      feriados:       data?.feriados ?? [],
      quartis:        data?.quartis ?? QUARTIS_PADRAO,
      contarDiaAtual: data?.contar_dia_atual === true,
    };
    setConfigDbAtiva(dbAtiva);
    setFeriados(doBanco.feriados);
    setQuartis(doBanco.quartis);
    setContarDiaAtual(doBanco.contarDiaAtual);
    setConfigOriginal(doBanco);
    setConfigCarregada(true);
  }, [empresa?.id, temConfigMes, mes, ano]);

  // Trava de meta por setor (Fase 1 de validação) ─────────────────────────────
  const [validacao, setValidacao] = useState<MetaValidacaoStatus | null>(null);
  const [validandoAcao, setValidandoAcao] = useState(false);
  const [mostrarReabrir, setMostrarReabrir] = useState(false);
  const [motivoReabrir, setMotivoReabrir] = useState("");

  const fetchValidacao = useCallback(async () => {
    if (!empresa?.id || !setorSelecionado) { setValidacao(null); return; }
    setValidacao(await getMetaValidacaoStatus(empresa.id, setorSelecionado, mes, ano));
  }, [empresa?.id, setorSelecionado, mes, ano]);

  const metaTravada = validacao?.status === "validado";

  async function handleValidarMeta() {
    if (!empresa?.id || !setorSelecionado) return;
    setValidandoAcao(true);
    const { ok, erro } = await validarMetaSetor(empresa.id, setorSelecionado, mes, ano);
    setValidandoAcao(false);
    if (!ok) {
      toast.error(
        erro === "sem_metas_para_validar"
          ? "Preencha ao menos uma meta deste setor antes de validar."
          : "Sem permissão para validar esta meta.",
      );
      return;
    }
    toast.success("Meta do setor validada — só um admin pode reabrir para editar.");
    await fetchValidacao();
  }

  async function handleReabrirMeta() {
    if (!podeExcluirMetas && !podeExcluirDiasUteis) return;
    if (!empresa?.id || !setorSelecionado) return;
    if (!motivoReabrir.trim()) { toast.warning("Informe o motivo da reabertura."); return; }
    setValidandoAcao(true);
    const { ok, erro } = await reabrirMetaSetor(empresa.id, setorSelecionado, mes, ano, motivoReabrir.trim());
    setValidandoAcao(false);
    if (!ok) {
      toast.error(erro === "motivo_obrigatorio" ? "Informe o motivo da reabertura." : "Sem permissão para reabrir.");
      return;
    }
    toast.success("Meta do setor reaberta para edição.");
    setMostrarReabrir(false);
    setMotivoReabrir("");
    await fetchValidacao();
  }

  useEffect(() => { fetchSetores(); }, [fetchSetores]);
  useEffect(() => { fetchEquipes(); }, [fetchEquipes]);
  useEffect(() => { fetchOperadores(); }, [fetchOperadores]);
  // Configs de Direto/Extra: uma vez por empresa, não por setor. A cascata
  // resolve setor, equipe e usuário a partir da mesma lista.
  useEffect(() => {
    if (!isPP || !empresa?.id) { setDiretoExtraConfigs([]); return; }
    let cancelado = false;
    void fetchDiretoExtraConfigs(empresa.id).then(cfgs => {
      if (!cancelado) setDiretoExtraConfigs(cfgs);
    });
    return () => { cancelado = true; };
  }, [isPP, empresa?.id]);
  useEffect(() => { fetchMetas(); }, [fetchMetas]);
  useEffect(() => { void fetchConfig(); }, [fetchConfig]);
  useEffect(() => { void fetchValidacao(); }, [fetchValidacao]);

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

  // ── Salvamento automático ─────────────────────────────────────────────────
  //
  // Duas frentes independentes, como sempre foram: a META (tabela `metas`,
  // policy `metas_editar`) e a CONFIG DO MÊS (tabela `metas_config_mes`, policy
  // `metas_editar_dias_uteis`). O que mudou é o gatilho — antes um botão para
  // as duas, agora cada uma no momento em que a pessoa termina de mexer nela.

  /**
   * O payload de UMA linha.
   *
   * `input` chega por parâmetro, e não de `getInput`, porque as caixas de
   * seleção chamam isto no mesmo `onChange` que muda o estado: ler o estado
   * aqui gravaria o valor anterior da caixa.
   */
  const montarPayload = useCallback((
    tipo: TipoMeta, referenciaId: string, input: MetaInput,
  ): Omit<Meta, "id"> | null => {
    if (!empresa?.id) return null;
    return {
      tipo,
      referencia_id: referenciaId,
      empresa_id: empresa.id,
      meta_valor: parseBRL(input.meta_valor),
      meta_acordos: 0,
      meta_proporcional: input.proporcional,
      // Metas adicionais (BP): só as preenchidas contam; em branco é ignorado
      ...(isBP ? {
        metas_extras: input.extras.map(parseBRL).filter(v => v > 0),
      } : {}),
      // Meta indireta [PP]: só para OPERADOR com Direto/Extra ativo. As duas
      // chaves só viajam quando a opção é oferecida — `fn_metas_upsert` só
      // sobrescreve as colunas quando elas vêm no payload, então a tela da
      // BookPlay (que nunca as manda) não zera ninguém.
      ...(isPP && tipo === "operador" && comDiretoExtra.has(referenciaId) ? {
        meta_indireta_ativa: input.indiretaAtiva,
        meta_indireta_valor: parseBRL(input.meta_indireta),
      } : {}),
      mes,
      ano,
    };
  }, [empresa?.id, isBP, isPP, comDiretoExtra, mes, ano]);

  /**
   * Grava UMA linha, se ela mudou.
   *
   * A linha é a unidade e não o campo: meta e meta H.O. são o mesmo número em
   * duas leituras, e as extras da BookPlay viajam no mesmo `upsert`.
   *
   * Silencioso no caminho feliz — o selo verde ao lado do nome é a confirmação.
   * O `toast` fica para o que a pessoa precisa saber: recusa da RLS, setor
   * validado, erro de rede.
   */
  const salvarLinha = useCallback(async (
    tipo: TipoMeta, referenciaId: string, patch?: Partial<MetaInput>,
  ) => {
    if (!empresa?.id || !podeGerenciarMetas || metaTravada) return;

    const input = { ...(inputMetas[referenciaId] ?? emptyInput()), ...(patch ?? {}) };
    const payload = montarPayload(tipo, referenciaId, input);
    if (!payload) return;

    const assinatura = assinaturaDaLinha(input);
    // Passar o cursor sem digitar não escreve nada.
    if (assinaturasSalvas.current[referenciaId] === assinatura) return;

    /*
     * Linha em branco continua não virando linha no banco — é o comportamento
     * do botão que saiu. Apagar o valor de quem já tem meta NÃO apaga a meta:
     * para tirar a meta de alguém existe a tela de exclusões, e um campo
     * limpo por engano não pode zerar a meta do mês de ninguém.
     */
    const vazia = payload.meta_valor <= 0 && !(Number(payload.meta_indireta_valor) > 0);
    if (vazia) return;

    setEstadoLinhas(e => ({ ...e, [referenciaId]: "salvando" }));

    try {
      const { salvos, bloqueados, error } = await upsertMetas([payload]);
      if (error) throw new Error(error);

      if (bloqueados.length > 0) {
        setEstadoLinhas(e => ({ ...e, [referenciaId]: "erro" }));
        toast.warning("Meta não salva — setor já validado.", {
          description: "Peça a um admin para reabrir antes de editar.",
        });
        return;
      }

      assinaturasSalvas.current[referenciaId] = assinatura;
      setEstadoLinhas(e => ({ ...e, [referenciaId]: "salvo" }));
      // O selo some sozinho: ele confirma, não fica de enfeite.
      window.setTimeout(() => {
        setEstadoLinhas(e => {
          // Só apaga o próprio «salvo»: a linha pode ter sido editada de novo
          // nesses 2,5 s e já estar em «salvando».
          if (e[referenciaId] !== "salvo") return e;
          const resto = { ...e };
          delete resto[referenciaId];
          return resto;
        });
      }, 2500);

      /*
       * O aviso «esteve de férias» morre aqui, e é o único lugar onde isso
       * pode acontecer: ele existe para quem está digitando a meta, e a meta
       * acabou de ser digitada.
       *
       * Best-effort: falhar aqui não pode desfazer o salvamento, que é o que a
       * pessoa pediu. O pior caso é o aviso aparecer de novo.
       */
      if (salvos > 0 && tipo === "operador") {
        const op = operadores.find(o => o.id === referenciaId);
        if (op?.ferias_ate) {
          try {
            await limparAvisoDeFerias([referenciaId]);
            setOperadores(atual => atual.map(o =>
              o.id === referenciaId ? { ...o, ferias_ate: null } : o));
          } catch { /* o aviso reaparece na próxima abertura, e só */ }
        }
      }
    } catch (err: unknown) {
      setEstadoLinhas(e => ({ ...e, [referenciaId]: "erro" }));
      toast.error("Erro ao salvar a meta", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [
    empresa?.id, podeGerenciarMetas, metaTravada, inputMetas, montarPayload,
    operadores,
  ]);

  /**
   * Grava os dias úteis, feriados e quartis do mês.
   *
   * Separada da meta de propósito: outra tabela, outra permissão, outra policy.
   * Uma meta que o banco recusou não pode levar junto o feriado que a pessoa
   * acabou de cadastrar.
   */
  const salvarConfigMes = useCallback(async () => {
    if (!empresa?.id || !perfil?.id) return;
    if (!(temConfigMes && configDbAtiva && configAlterada && podeEditarDiasUteis)) return;

    setSalvandoTudo(true);
    const { error } = await upsertMetasConfig({
      empresaId: empresa.id, mes, ano,
      feriados, quartis, contarDiaAtual, atualizadoPor: perfil.id,
    });
    setSalvandoTudo(false);

    if (error) {
      toast.error("Erro ao salvar os dias úteis do mês", { description: error });
      return;
    }
    // O novo retrato: daqui para a frente, salvar meta não reescreve isto.
    setConfigOriginal({ feriados, quartis, contarDiaAtual });
  }, [
    empresa?.id, perfil?.id, temConfigMes, configDbAtiva, configAlterada,
    podeEditarDiasUteis, mes, ano, feriados, quartis, contarDiaAtual,
  ]);

  /*
   * O calendário do mês não tem «perder o foco».
   *
   * Adicionar um feriado, arrastar um quartil e marcar «contar o dia de hoje»
   * são cliques, não campos — então o gatilho é o silêncio: 800 ms depois da
   * última mexida. Sem a espera, arrastar um quartil de 25 para 30 mandaria
   * uma escrita por pixel.
   */
  useEffect(() => {
    if (!configAlterada) return;
    const t = window.setTimeout(() => { void salvarConfigMes(); }, 800);
    return () => window.clearTimeout(t);
  }, [configAlterada, salvarConfigMes]);

  const setorNome = setores.find(s => s.id === setorSelecionado)?.nome ?? "";
  /** Alguma linha ainda no ar? É o que o rodapé anuncia. */
  const gravando = salvandoTudo
    || Object.values(estadoLinhas).some(e => e === "salvando");
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
                  disabled={!podeEditarDiasUteis}
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
                    disabled={!podeEditarDiasUteis}
                    onChange={(e) => setFeriadoNovo(e.target.value)}
                  />
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                    onClick={adicionarFeriado} disabled={!feriadoNovo || !podeEditarDiasUteis}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar
                  </Button>
                </div>
                {feriados.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {feriados.map(f => (
                      <Badge key={f} variant="secondary" className="gap-1 text-xs font-normal">
                        {f.split("-").reverse().join("/")}
                        {podeEditarDiasUteis && (
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
                        disabled={!podeEditarDiasUteis}
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

          {/* Trava de meta do setor (Fase 1 de validação) */}
          <div className={cn(
            "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm",
            metaTravada ? "border-emerald-600/30 bg-emerald-600/10" : "border-border bg-muted/20",
          )}>
            {metaTravada
              ? <Lock className="h-4 w-4 text-emerald-600 shrink-0" />
              : <LockOpen className="h-4 w-4 text-muted-foreground shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">
                {metaTravada
                  ? `Meta validada${validacao?.validadoEm ? " em " + new Date(validacao.validadoEm).toLocaleDateString("pt-BR") : ""}`
                  : "Meta ainda não validada"}
              </p>
              <p className="text-xs text-muted-foreground">
                {metaTravada
                  ? "Ninguém edita até um admin reabrir."
                  : "Só administrador/super_admin valida. Depois de validada, ninguém edita sem reabrir."}
              </p>
            </div>
            {isAdmin && !metaTravada && (
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0"
                disabled={validandoAcao} onClick={handleValidarMeta}>
                <ShieldCheck className="h-3.5 w-3.5" /> Validar meta do setor
              </Button>
            )}
            {isAdmin && metaTravada && !mostrarReabrir && (
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0"
                onClick={() => setMostrarReabrir(true)}>
                <LockOpen className="h-3.5 w-3.5" /> Reabrir
              </Button>
            )}
          </div>
          {isAdmin && metaTravada && mostrarReabrir && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 -mt-3">
              <Input
                className="h-8 text-sm flex-1"
                placeholder="Motivo da reabertura (obrigatório)"
                value={motivoReabrir}
                onChange={e => setMotivoReabrir(e.target.value)}
              />
              <Button size="sm" disabled={validandoAcao || !motivoReabrir.trim()} onClick={handleReabrirMeta}>
                Confirmar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setMostrarReabrir(false); setMotivoReabrir(""); }}>
                Cancelar
              </Button>
            </div>
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
                  onGravar={(patch) => void salvarLinha("setor", setorSelecionado, patch)}
                  estado={estadoLinhas[setorSelecionado]}
                  disabled={!podeGerenciarMetas || metaTravada}
                  mostrarHO={isPP}
                  numExtras={isBP ? extraCampos.setor : 0}
                  onChangeExtra={(i, v) => onChangeExtra(setorSelecionado, i, v)}
                  onChangeValor={v => onChangeValor(setorSelecionado, v)}
                  onChangeHO={v => onChangeHO(setorSelecionado, v)}
                  proporcional={getInput(setorSelecionado).proporcional}
                  onChangeProporcional={v => onChangeProporcional(setorSelecionado, v)} />
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
                    onGravar={(patch) => void salvarLinha("equipe", eq.id, patch)}
                    estado={estadoLinhas[eq.id]}
                    disabled={!podeGerenciarMetas || metaTravada}
                    mostrarHO={isPP}
                    numExtras={isBP ? extraCampos.equipe : 0}
                    onChangeExtra={(i, v) => onChangeExtra(eq.id, i, v)}
                    onChangeValor={v => onChangeValor(eq.id, v)}
                    onChangeHO={v => onChangeHO(eq.id, v)}
                    proporcional={getInput(eq.id).proporcional}
                    onChangeProporcional={v => onChangeProporcional(eq.id, v)} />
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
                    aviso={<AvisoVoltouDeFerias situacao={op.situacao} feriasAte={op.ferias_ate} />}
                    input={getInput(op.id)}
                    onGravar={(patch) => void salvarLinha("operador", op.id, patch)}
                    estado={estadoLinhas[op.id]}
                    disabled={!podeGerenciarMetas || metaTravada}
                    mostrarHO={isPP}
                    numExtras={isBP ? extraCampos.operador : 0}
                    onChangeExtra={(i, v) => onChangeExtra(op.id, i, v)}
                    onChangeValor={v => onChangeValor(op.id, v)}
                    onChangeHO={v => onChangeHO(op.id, v)}
                    proporcional={getInput(op.id).proporcional}
                    onChangeProporcional={v => onChangeProporcional(op.id, v)}
                    permiteIndireta={comDiretoExtra.has(op.id)}
                    onChangeIndiretaAtiva={v => onChangeIndiretaAtiva(op.id, v)}
                    onChangeIndireta={v => onChangeIndireta(op.id, v)}
                    onChangeIndiretaHO={v => onChangeIndiretaHO(op.id, v)} />
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

          {/* ── Rodapé: o que o botão dizia, sem o botão ──────────────────
              Ele sobrevive porque a régua continua existindo: setor validado
              recusa a gravação, e sem esta linha a pessoa digitaria a meta
              inteira sem entender por que nada acontece. */}
          <div className="flex items-center gap-3 pt-2 pb-6 sticky bottom-0 bg-background/80 backdrop-blur-sm border-t border-border -mx-4 px-4 mt-2">
            <p className="flex flex-1 items-center gap-1.5 text-xs text-muted-foreground">
              {gravando ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</>
              ) : metaTravada ? (
                <><Lock className="h-3.5 w-3.5" /> Meta deste setor está validada — peça a
                  um admin para reabrir antes de editar.</>
              ) : !podeGerenciarMetas ? (
                <>Você não tem permissão para editar metas.</>
              ) : !setorSelecionado ? (
                <>Selecione um setor para começar.</>
              ) : (
                <><Check className="h-3.5 w-3.5 text-emerald-500" /> Cada meta é salva
                  sozinha ao sair do campo. Campo em branco não apaga a meta de ninguém.</>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
