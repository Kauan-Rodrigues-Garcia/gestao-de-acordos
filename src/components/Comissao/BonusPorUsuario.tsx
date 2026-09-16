/**
 * BonusPorUsuario — bônus em dinheiro para uma ou mais pessoas do setor.
 *
 * ## O fluxo do pedido (16/09/2026)
 *
 * Escolhe as pessoas → «Criar bônus» → escolhe a forma:
 *
 *   Meta existente   bater a 1ª, 2ª, 3ª, 4ª… Meta da pessoa;
 *   Valor realizado  chegar a um valor no mês («+R$ 200,00 se fizer R$ 200 mil»);
 *   Meta especial    fazer um valor dentro de um período do mês («R$ 20 mil numa
 *                    semana»).
 *
 * Um bônus com seis pessoas é UM bônus: editar ajusta as seis. O operador vê o
 * bônus no «Ver comissão» do Dashboard, com a situação e quanto falta.
 *
 * O valor a atingir é gravado em BRUTO, como as metas; na PaguePlay o campo H.O.
 * ao lado converte nos dois sentidos, como na tela de Metas.
 */
import { useMemo, useState } from 'react';
import { Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PP_HO_PERCENTUAL } from '@/lib/index';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ultimoDiaDoMes, type BonusComissao, type TipoBonus } from '@/services/comissao/bonus';
import { excluirBonus, salvarBonus } from '@/services/comissao/comissao.service';
import { condicaoDoBonus, resumoDeNomes, ROTULO_TIPO_BONUS } from './bonusTexto';
import { lerReais, mascararReais, reaisParaCampo } from './formato';
import {
  payloadDoBonus, problemaDoRascunho, rascunhoDoBonus, type RascunhoBonus,
} from './rascunhoBonus';
import { SeletorPessoas, type PessoaSelecionavel } from './SeletorPessoas';

interface BonusPorUsuarioProps {
  empresaId: string;
  setorId: string;
  ano: number;
  mes: number;
  isPaguePlay: boolean;
  /** Os bônus do mês deste setor. */
  bonus: BonusComissao[];
  pessoas: PessoaSelecionavel[];
  /** Quantas metas oferecer na forma «Meta existente». */
  quantasMetas: number;
  bloqueado: boolean;
  onMudou: () => void;
}

function DialogBonus({ aberto, inicial, props, onFechar }: {
  aberto: boolean;
  inicial: RascunhoBonus;
  props: BonusPorUsuarioProps;
  onFechar: () => void;
}) {
  const { empresaId, setorId, ano, mes, isPaguePlay, pessoas, quantasMetas, onMudou } = props;
  const [r, setR] = useState<RascunhoBonus>(inicial);
  const [salvando, setSalvando] = useState(false);
  const mudar = (patch: Partial<RascunhoBonus>) => setR(atual => ({ ...atual, ...patch }));
  const problema = problemaDoRascunho(r, ano, mes);
  const primeiro = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimo = ultimoDiaDoMes(ano, mes);

  function mudarAlvo(texto: string) {
    const v = mascararReais(texto);
    const n = lerReais(v);
    mudar({ valorAlvo: v, valorAlvoHO: reaisParaCampo(n !== null ? n * PP_HO_PERCENTUAL : null) });
  }
  function mudarAlvoHO(texto: string) {
    const v = mascararReais(texto);
    const n = lerReais(v);
    mudar({ valorAlvoHO: v, valorAlvo: reaisParaCampo(n !== null ? Math.round((n / PP_HO_PERCENTUAL) * 100) / 100 : null) });
  }

  async function confirmar() {
    if (problema) return;
    setSalvando(true);
    const res = await salvarBonus(payloadDoBonus(r, { empresaId, setorId, ano, mes }));
    setSalvando(false);
    if (!res.ok) {
      toast.error('O bônus não foi salvo', { description: res.erro });
      return;
    }
    toast.success(r.id
      ? 'Bônus atualizado.'
      : `Bônus criado para ${r.pessoas.length === 1 ? '1 pessoa' : `${r.pessoas.length} pessoas`}.`);
    onMudou();
    onFechar();
  }

  const opcoesMeta = Array.from({ length: Math.max(4, quantasMetas) }, (_, i) => i + 1);

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) onFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{r.id ? 'Editar bônus' : 'Criar bônus'}</DialogTitle>
          <DialogDescription>
            O bônus é pago à parte da comissão e aparece para cada pessoa no Dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Pessoas</Label>
            <SeletorPessoas rotulo="Pessoas do bônus" pessoas={pessoas} selecionadas={r.pessoas} onMudar={ids => mudar({ pessoas: ids })} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium">O bônus é pago quando</legend>
            {(['meta', 'valor', 'especial'] as TipoBonus[]).map(t => (
              <label
                key={t}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                  r.tipo === t ? 'border-primary bg-primary/5' : 'border-border',
                )}
              >
                <input
                  type="radio"
                  name="tipo-bonus"
                  value={t}
                  checked={r.tipo === t}
                  onChange={() => mudar({ tipo: t })}
                  className="mt-0.5 h-3.5 w-3.5 accent-primary"
                />
                <span>
                  <span className="font-medium">{ROTULO_TIPO_BONUS[t]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t === 'meta' && 'Bater uma das metas que a pessoa já tem (1ª, 2ª, 3ª, 4ª…).'}
                    {t === 'valor' && 'Chegar a um valor realizado no mês.'}
                    {t === 'especial' && 'Fazer um valor dentro de um período do mês — uma semana, por exemplo.'}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {r.tipo === 'meta' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Qual meta</Label>
              <Select value={r.metaOrdem} onValueChange={v => mudar({ metaOrdem: v })}>
                <SelectTrigger className="h-9 w-48" aria-label="Qual meta"><SelectValue placeholder="Escolha a meta" /></SelectTrigger>
                <SelectContent>
                  {opcoesMeta.map(o => <SelectItem key={o} value={String(o)}>{`${o}ª Meta`}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {r.tipo !== 'meta' && (
            <div className="flex flex-wrap gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{r.tipo === 'especial' ? 'Valor a fazer no período (R$)' : 'Valor realizado no mês (R$)'}</Label>
                <Input inputMode="numeric" className="h-9 w-44" placeholder="0,00" value={r.valorAlvo} onChange={e => mudarAlvo(e.target.value)} />
              </div>
              {isPaguePlay && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Em H.O. (24,96%)</Label>
                  <Input inputMode="numeric" className="h-9 w-44" placeholder="0,00" value={r.valorAlvoHO} onChange={e => mudarAlvoHO(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {r.tipo === 'especial' && (
            <div className="flex flex-wrap gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Início</Label>
                <Input type="date" className="h-9 w-44" min={primeiro} max={ultimo} value={r.inicio} onChange={e => mudar({ inicio: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fim</Label>
                <Input type="date" className="h-9 w-44" min={r.inicio || primeiro} max={ultimo} value={r.fim} onChange={e => mudar({ fim: e.target.value })} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor do bônus (R$)</Label>
              <Input inputMode="numeric" className="h-9 w-44" placeholder="0,00" value={r.valorBonus} onChange={e => mudar({ valorBonus: mascararReais(e.target.value) })} />
            </div>
            <div className="min-w-[12rem] flex-1 space-y-1.5">
              <Label className="text-xs">Observação (opcional)</Label>
              <Input className="h-9" maxLength={200} placeholder="Ex.: campanha da semana" value={r.descricao} onChange={e => mudar({ descricao: e.target.value })} />
            </div>
          </div>

          {problema && <p className="text-xs text-amber-700 dark:text-amber-400">{problema}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button type="button" disabled={!!problema || salvando} onClick={() => void confirmar()}>
            {r.id ? 'Salvar bônus' : r.pessoas.length > 1 ? `Criar para ${r.pessoas.length} pessoas` : 'Criar bônus'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BonusPorUsuario(props: BonusPorUsuarioProps) {
  const { bonus, pessoas, bloqueado, isPaguePlay, onMudou } = props;
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [editando, setEditando] = useState<{ chave: number; rascunho: RascunhoBonus } | null>(null);
  const [removendo, setRemovendo] = useState<BonusComissao | null>(null);

  const nomeDe = useMemo(() => new Map(pessoas.map(p => [p.id, p.nome])), [pessoas]);
  const ordenados = useMemo(
    () => [...bonus].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.valorBonus - b.valorBonus),
    [bonus],
  );

  async function remover(b: BonusComissao) {
    const r = await excluirBonus(b.id);
    setRemovendo(null);
    if (!r.ok) {
      toast.error('O bônus não foi removido', { description: r.erro });
      return;
    }
    toast.success('Bônus removido.');
    onMudou();
  }

  function abrir(b: BonusComissao | null) {
    setEditando({ chave: Date.now(), rascunho: rascunhoDoBonus(b, escolhidas) });
  }

  return (
    <div className="space-y-3">
      {ordenados.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum bônus neste mês.</p>
      )}

      {ordenados.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {ordenados.map(b => (
            <li key={b.id} className="flex items-start gap-3 px-3 py-2">
              <Gift className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {`${formatBRL(b.valorBonus)} ${condicaoDoBonus({ ...b, alvo: b.valorAlvo })}`}
                  {isPaguePlay && b.tipo !== 'meta' && b.valorAlvo !== null && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {`(${formatBRL(b.valorAlvo * PP_HO_PERCENTUAL)} H.O.)`}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {resumoDeNomes(b.usuarioIds, nomeDe, 4)}
                  {b.descricao ? ` · ${b.descricao}` : ''}
                </p>
              </div>
              {!bloqueado && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Editar bônus" onClick={() => abrir(b)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Remover bônus" onClick={() => setRemovendo(b)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!bloqueado && (
        <div className="space-y-2 rounded-lg border border-dashed border-border px-3 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Novo bônus
          </p>
          <SeletorPessoas rotulo="Pessoas para o novo bônus" pessoas={pessoas} selecionadas={escolhidas} onMudar={setEscolhidas} />
          <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" disabled={escolhidas.length === 0} onClick={() => abrir(null)}>
            <Gift className="h-3.5 w-3.5" aria-hidden="true" />
            {escolhidas.length > 1 ? `Criar bônus para ${escolhidas.length} pessoas` : 'Criar bônus'}
          </Button>
        </div>
      )}

      {editando && (
        <DialogBonus
          key={editando.chave}
          aberto
          inicial={editando.rascunho}
          props={{ ...props, onMudou: () => { if (!editando.rascunho.id) setEscolhidas([]); onMudou(); } }}
          onFechar={() => setEditando(null)}
        />
      )}

      <AlertDialog open={removendo !== null} onOpenChange={a => { if (!a) setRemovendo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este bônus?</AlertDialogTitle>
            <AlertDialogDescription>
              {removendo
                ? `${formatBRL(removendo.valorBonus)} ${condicaoDoBonus({ ...removendo, alvo: removendo.valorAlvo })} — some do Dashboard de ${removendo.usuarioIds.length === 1 ? '1 pessoa' : `${removendo.usuarioIds.length} pessoas`}.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (removendo) void remover(removendo); }}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
