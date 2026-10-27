/**
 * PixBonusPainel — bônus de comissão do Pix automático por setor e período.
 *
 * A liderança lança, por exemplo, «+0,02 nesta semana para o Receptivo e o
 * Play 3». Todo acordo daqueles setores com data dentro do período passa a
 * valer o % do setor mais o bônus (0,25% → 0,27%) e ganha a etiqueta de bônus
 * na lista.
 *
 * Quem carimba é o banco (migration `20261027150000`): o gatilho olha a data do
 * acordo e o setor dele, e lançar ou mudar um bônus recarimba o que ainda não
 * foi pago. Este painel só grava o bônus e mostra o que está valendo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gift, Plus, Pencil, Trash2, RefreshCw, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { DatePickerField } from '@/components/DatePickerField';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getTodayISO } from '@/lib/index';
import {
  fetchBonusPix, salvarBonusPix, excluirBonusPix, bonusVigenteNoDia,
  PIX_AUTO_PCT_PADRAO, type PixAutoBonus,
} from '@/services/pix_automatico.service';

function fmtPctBonus(pct: number): string {
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
}

/** `yyyy-MM-dd` → `dd/MM`. */
function diaCurto(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function periodo(b: Pick<PixAutoBonus, 'inicio' | 'fim'>): string {
  return b.fim ? `${diaCurto(b.inicio)} a ${diaCurto(b.fim)}` : `a partir de ${diaCurto(b.inicio)}`;
}

/** «0,02» ou «0.02» → 0.02. Inválido → NaN. */
function lerPct(txt: string): number {
  const limpo = txt.trim().replace('%', '').replace(',', '.');
  return limpo ? Number(limpo) : NaN;
}

interface Rascunho {
  id?: string;
  pct: string;
  setorIds: string[];
  inicio: string;
  fim: string;
  ativo: boolean;
  descricao: string;
}

const RASCUNHO_VAZIO = (): Rascunho => ({
  pct: '', setorIds: [], inicio: getTodayISO(), fim: '', ativo: true, descricao: '',
});

export interface PixBonusPainelProps {
  empresaId: string;
  /** Setores que quem olha pode escolher (o líder preso a um setor vê só o dele). */
  setores: { id: string; nome: string }[];
  /** Setores cujo bônus vale mostrar no aviso (o foco da tela). */
  setoresDoAviso: string[];
  pctPorSetor: Record<string, number>;
  podeEditar: boolean;
  autorId: string;
  autorNome: string;
  /** Relê os acordos: o banco acabou de recarimbar o bônus nas linhas. */
  onMudou: () => void;
}

export function PixBonusPainel({
  empresaId, setores, setoresDoAviso, pctPorSetor, podeEditar, autorId, autorNome, onMudou,
}: PixBonusPainelProps) {
  const [bonus, setBonus] = useState<PixAutoBonus[]>([]);
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setBonus(await fetchBonusPix(empresaId));
  }, [empresaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const nomeDoSetor = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of setores) m[s.id] = s.nome;
    return m;
  }, [setores]);

  const hoje = getTodayISO();
  const vigentesNoAviso = useMemo(
    () => bonus.filter(b => bonusVigenteNoDia(b, hoje) && b.setor_ids.some(id => setoresDoAviso.includes(id))),
    [bonus, hoje, setoresDoAviso],
  );

  // Quem só vê o próprio setor não precisa saber de bônus de outro setor.
  const idsVisiveis = useMemo(() => new Set(setores.map(s => s.id)), [setores]);
  const daLista = useMemo(
    () => bonus.filter(b => b.setor_ids.some(id => idsVisiveis.has(id))),
    [bonus, idsVisiveis],
  );

  const pctDoSetor = (id: string) => pctPorSetor[id] ?? PIX_AUTO_PCT_PADRAO;

  async function salvar() {
    if (!rascunho) return;
    const pct = lerPct(rascunho.pct);
    if (!Number.isFinite(pct) || pct <= 0) { toast.error('Informe o bônus, por exemplo 0,02.'); return; }
    if (pct > 5) { toast.error('Bônus acima de 5 pontos percentuais — confira o número.'); return; }
    if (rascunho.setorIds.length === 0) { toast.error('Escolha pelo menos um setor.'); return; }
    if (!rascunho.inicio) { toast.error('Informe a data de início.'); return; }
    if (rascunho.fim && rascunho.fim < rascunho.inicio) { toast.error('O fim é antes do início.'); return; }

    setSalvando(true);
    const r = await salvarBonusPix({
      id: rascunho.id,
      empresaId,
      pct,
      setorIds: rascunho.setorIds,
      inicio: rascunho.inicio,
      fim: rascunho.fim || null,
      ativo: rascunho.ativo,
      descricao: rascunho.descricao.trim() || null,
      autorId,
      autorNome,
    });
    setSalvando(false);
    if (!r.ok) { toast.error('Erro ao salvar o bônus: ' + r.error); return; }
    toast.success('Bônus salvo. Os acordos do período já foram marcados.');
    setRascunho(null);
    await carregar();
    onMudou();
  }

  async function excluir(b: PixAutoBonus) {
    if (!window.confirm(`Excluir o bônus de +${fmtPctBonus(b.pct)} (${periodo(b)})? Os acordos ainda não pagos perdem o bônus.`)) return;
    const r = await excluirBonusPix(b.id);
    if (!r.ok) { toast.error('Erro ao excluir o bônus: ' + r.error); return; }
    toast.success('Bônus excluído.');
    await carregar();
    onMudou();
  }

  async function alternarAtivo(b: PixAutoBonus, ativo: boolean) {
    const r = await salvarBonusPix({
      id: b.id, empresaId, pct: b.pct, setorIds: b.setor_ids, inicio: b.inicio, fim: b.fim,
      ativo, descricao: b.descricao, autorId, autorNome,
    });
    if (!r.ok) { toast.error('Erro ao alterar o bônus: ' + r.error); return; }
    await carregar();
    onMudou();
  }

  if (vigentesNoAviso.length === 0 && !podeEditar) return null;

  const pctRascunho = rascunho ? lerPct(rascunho.pct) : NaN;

  return (
    <>
      <div className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2',
        vigentesNoAviso.length > 0 ? 'border-success/30 bg-success/8' : 'border-border bg-card',
      )}>
        <Gift className={cn('w-4 h-4 shrink-0', vigentesNoAviso.length > 0 ? 'text-success' : 'text-muted-foreground')} />
        {vigentesNoAviso.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {vigentesNoAviso.map(b => (
              <span key={b.id} className="text-foreground">
                <strong className="text-success">Bônus de +{fmtPctBonus(b.pct)}</strong>{' '}
                {periodo(b)}
                {b.descricao && <span className="text-muted-foreground"> · {b.descricao}</span>}
                <span className="text-muted-foreground">
                  {' · '}
                  {b.setor_ids.filter(id => setoresDoAviso.includes(id)).map(id =>
                    `${nomeDoSetor[id] ?? 'Setor'} ${fmtPctBonus(pctDoSetor(id))} → ${fmtPctBonus(pctDoSetor(id) + b.pct)}`,
                  ).join(' · ')}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">Nenhum bônus valendo hoje.</span>
        )}
        {podeEditar && (
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs ml-auto"
            onClick={() => setAberto(true)}>
            <Gift className="w-3.5 h-3.5" /> Bônus
          </Button>
        )}
      </div>

      <Dialog open={aberto} onOpenChange={v => { setAberto(v); if (!v) setRascunho(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-success" /> Bônus do Pix
            </DialogTitle>
            <DialogDescription>
              O bônus soma ao % do setor em todo acordo com data dentro do período.
              Ex.: setor em 0,25% com bônus de 0,02 → 0,27%. Acordos já pagos não mudam.
            </DialogDescription>
          </DialogHeader>

          {rascunho ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Bônus (pontos percentuais somados) *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">+</span>
                  <Input value={rascunho.pct} placeholder="0,02" inputMode="decimal" autoFocus
                    onChange={e => setRascunho({ ...rascunho, pct: e.target.value })}
                    className="h-9 w-24 font-mono text-center" />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Setores que participam *</Label>
                  {setores.length > 1 && (
                    <button type="button" className="text-[11px] text-primary hover:underline"
                      onClick={() => setRascunho({
                        ...rascunho,
                        setorIds: rascunho.setorIds.length === setores.length ? [] : setores.map(s => s.id),
                      })}>
                      {rascunho.setorIds.length === setores.length ? 'Desmarcar todos' : 'Marcar todos'}
                    </button>
                  )}
                </div>
                <div className="grid gap-1 rounded-lg border border-border p-2">
                  {setores.map(s => {
                    const marcado = rascunho.setorIds.includes(s.id);
                    const base = pctDoSetor(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50 cursor-pointer">
                        <Checkbox checked={marcado} onCheckedChange={v => setRascunho({
                          ...rascunho,
                          setorIds: v ? [...rascunho.setorIds, s.id] : rascunho.setorIds.filter(x => x !== s.id),
                        })} />
                        <span className="flex-1">{s.nome}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {fmtPctBonus(base)}
                          {marcado && Number.isFinite(pctRascunho) && pctRascunho > 0 && (
                            <> → <strong className="text-success">{fmtPctBonus(base + pctRascunho)}</strong></>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="space-y-1 flex-1 min-w-[150px]">
                  <DatePickerField label="Vale a partir de *" labelClassName="text-xs font-medium"
                    triggerClassName="h-9 text-sm" size="md"
                    value={rascunho.inicio} onChange={v => setRascunho({ ...rascunho, inicio: v })} />
                </div>
                <div className="space-y-1 flex-1 min-w-[150px]">
                  <DatePickerField label="Até (opcional)" labelClassName="text-xs font-medium"
                    triggerClassName="h-9 text-sm" size="md" placeholder="Sem data de fim"
                    minDate={rascunho.inicio || undefined}
                    value={rascunho.fim} onChange={v => setRascunho({ ...rascunho, fim: v })} />
                  {rascunho.fim && (
                    <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => setRascunho({ ...rascunho, fim: '' })}>
                      Tirar a data de fim
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Descrição (opcional)</Label>
                <Input value={rascunho.descricao} placeholder="Ex.: Semana do bônus"
                  onChange={e => setRascunho({ ...rascunho, descricao: e.target.value })}
                  className="h-9 text-sm" maxLength={80} />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setRascunho(null)} disabled={salvando}>
                  <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                </Button>
                <Button size="sm" onClick={salvar} disabled={salvando}>
                  {salvando ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                  Salvar bônus
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {daLista.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum bônus lançado.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {daLista.map(b => {
                    const valendo = bonusVigenteNoDia(b, hoje);
                    const encerrado = b.fim != null && b.fim < hoje;
                    return (
                      <li key={b.id} className="flex items-start gap-3 px-3 py-2.5">
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <p className="text-sm">
                            <strong className={valendo ? 'text-success' : 'text-foreground'}>+{fmtPctBonus(b.pct)}</strong>{' '}
                            <span className="text-muted-foreground">{periodo(b)}</span>
                            {valendo && <span className="ml-2 text-[10px] font-semibold uppercase text-success">valendo</span>}
                            {encerrado && <span className="ml-2 text-[10px] font-semibold uppercase text-muted-foreground">encerrado</span>}
                            {!b.ativo && <span className="ml-2 text-[10px] font-semibold uppercase text-warning">pausado</span>}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {b.setor_ids.map(id => nomeDoSetor[id] ?? 'Outro setor').join(', ')}
                            {b.descricao && ` · ${b.descricao}`}
                          </p>
                        </div>
                        <Switch checked={b.ativo} onCheckedChange={v => alternarAtivo(b, v)}
                          aria-label="Bônus ativo" title={b.ativo ? 'Pausar' : 'Reativar'} />
                        <button title="Editar" className="text-muted-foreground hover:text-primary"
                          onClick={() => setRascunho({
                            id: b.id,
                            pct: String(b.pct).replace('.', ','),
                            setorIds: b.setor_ids,
                            inicio: b.inicio,
                            fim: b.fim ?? '',
                            ativo: b.ativo,
                            descricao: b.descricao ?? '',
                          })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button title="Excluir" className="text-muted-foreground hover:text-destructive"
                          onClick={() => excluir(b)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Button size="sm" className="w-full gap-1" onClick={() => setRascunho({
                ...RASCUNHO_VAZIO(),
                // Com um setor só para escolher, ele já vem marcado.
                setorIds: setores.length === 1 ? [setores[0].id] : [],
              })}>
                <Plus className="w-3.5 h-3.5" /> Novo bônus
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
