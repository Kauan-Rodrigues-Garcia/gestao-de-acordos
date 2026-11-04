/**
 * DialogPedirTransferencia — quem não é super admin PEDE a transferência
 * (Cleber, 03/11/2026). Dois sentidos:
 *
 *   • TIRAR: as pessoas marcadas na aba Usuários saem do setor dela para
 *     outro. Pessoas de setores diferentes viram um pedido por setor;
 *   • TRAZER: escolhe o setor de origem, marca as pessoas (só nome e cargo —
 *     `fn_transferencia_pessoas_do_setor`) e o setor seu que as recebe.
 *
 * O destino lista TODOS os setores, mesmo os que a pessoa não enxerga no resto
 * do sistema, com as etiquetas BookPlay/PaguePlay e Nosso produto/Cofen.
 * Quem pode o quê, o banco confere de novo em `fn_transferencia_pedir`.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRightLeft, Loader2, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Perfil } from '@/lib/supabase';
import { PERFIL_LABELS } from '@/lib/index';
import { ROTULO_REGRA, ehRegraDoSetor } from '@/lib/regraDoSetor';
import { cn } from '@/lib/utils';
import {
  setoresPorMarca, type PessoaDoSetor, type SetorDaTransferencia,
} from '@/lib/transferenciaPedidos';
import {
  listarPessoasDoSetor, listarSetoresParaTransferencia, pedirTransferencia, podeLevarAcordos,
} from '@/services/admin/transferenciaPedidos.service';
import { abrirTransferenciasNoChat } from '@/components/Chat/abrirTransferencias';
import { EtiquetasSetor } from './EtiquetasSetor';

export type AberturaPedido =
  | { direcao: 'tirar'; pessoas: Perfil[] }
  | { direcao: 'trazer' };

const cargo = (c: string | null | undefined) => (c ? PERFIL_LABELS[c] ?? c : '');

/** A lista de setores agrupada pela marca, com as etiquetas. */
function OpcoesDeSetor({ setores }: { setores: SetorDaTransferencia[] }) {
  const grupos = setoresPorMarca(setores);
  if (setores.length === 0) return <SelectItem value="__nenhum__" disabled>Nenhum setor</SelectItem>;
  return (
    <>
      {grupos.map(g => (
        <SelectGroup key={g.marca ?? 'outros'}>
          <SelectLabel className="text-[11px]">{g.marca ?? 'Outros setores'}</SelectLabel>
          {g.setores.map(s => (
            <SelectItem key={s.id} value={s.id}>
              {s.nome} <EtiquetasSetor className="ml-1.5" setor={s} />
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}

export function DialogPedirTransferencia({ abertura, onFechar, onEnviado }: {
  abertura: AberturaPedido | null;
  onFechar: () => void;
  onEnviado: () => void;
}) {
  const [setores, setSetores] = useState<SetorDaTransferencia[] | null>(null);
  const [erroSetores, setErroSetores] = useState<string | null>(null);
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [pessoasOrigem, setPessoasOrigem] = useState<PessoaDoSetor[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [levar, setLevar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const direcao = abertura?.direcao ?? 'tirar';

  // Abrir sempre recomeça do zero: herdar o pedido anterior é pedir errado.
  useEffect(() => {
    if (!abertura) return;
    setOrigem(''); setDestino(''); setPessoasOrigem(null); setMarcadas(new Set());
    setLevar(false); setMotivo(''); setErroSetores(null);
    let vivo = true;
    listarSetoresParaTransferencia()
      .then(l => { if (vivo) setSetores(l); })
      .catch(e => { if (vivo) { setSetores([]); setErroSetores(e instanceof Error ? e.message : String(e)); } });
    return () => { vivo = false; };
  }, [abertura]);

  const porId = useMemo(() => new Map((setores ?? []).map(s => [s.id, s])), [setores]);
  const meus = useMemo(() => (setores ?? []).filter(s => s.meu), [setores]);

  // TIRAR: as pessoas, por setor de origem.
  const gruposTirar = useMemo(() => {
    if (abertura?.direcao !== 'tirar') return [];
    const m = new Map<string, Perfil[]>();
    for (const p of abertura.pessoas) {
      const k = p.setor_id ?? '';
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].map(([setorId, pessoas]) => ({ setor: porId.get(setorId) ?? null, setorId, pessoas }));
  }, [abertura, porId]);
  const foraDoMeuSetor = gruposTirar.filter(g => !g.setor?.meu).flatMap(g => g.pessoas);
  // Desligado não entra em pedido. O cargo (administração) quem barra é o banco.
  const naoPodem = abertura?.direcao === 'tirar'
    ? abertura.pessoas.filter(p => p.situacao === 'desligado' || p.arquivado)
    : [];

  // TRAZER: as pessoas do setor de origem escolhido.
  useEffect(() => {
    if (direcao !== 'trazer' || !origem) { setPessoasOrigem(null); return; }
    let vivo = true;
    setPessoasOrigem(null); setMarcadas(new Set());
    listarPessoasDoSetor(origem)
      .then(l => { if (vivo) setPessoasOrigem(l); })
      .catch(e => { if (vivo) { setPessoasOrigem([]); toast.error(e instanceof Error ? e.message : String(e)); } });
    return () => { vivo = false; };
  }, [direcao, origem]);

  // TRAZER com um setor só: ele já vem escolhido como destino.
  useEffect(() => {
    if (direcao === 'trazer' && !destino && meus.length === 1) setDestino(meus[0].id);
  }, [direcao, destino, meus]);

  const origensTirar = gruposTirar.map(g => g.setorId);
  const destinos = direcao === 'tirar'
    ? (setores ?? []).filter(s => !origensTirar.includes(s.id))
    : meus.filter(s => s.id !== origem);
  const origensTrazer = (setores ?? []).filter(s => !s.meu);

  const setorDestino = porId.get(destino) ?? null;
  const origensDoPedido = direcao === 'tirar' ? gruposTirar.map(g => g.setor) : [porId.get(origem) ?? null];
  const levarPermitido = !!setorDestino && origensDoPedido.length > 0
    && origensDoPedido.every(o => podeLevarAcordos({ origem: o, destino: setorDestino }));
  const mudaRegra = !!setorDestino && origensDoPedido.some(o => o && (o.regra ?? 'nosso_produto') !== (setorDestino.regra ?? 'nosso_produto'));

  const quantas = direcao === 'tirar' ? (abertura?.direcao === 'tirar' ? abertura.pessoas.length : 0) : marcadas.size;
  const bloqueio = !destino ? 'Escolha o setor de destino.'
    : direcao === 'trazer' && !origem ? 'Escolha o setor de origem.'
    : quantas === 0 ? 'Escolha pelo menos uma pessoa.'
    : naoPodem.length ? `${naoPodem.map(p => p.nome).join(', ')} não ${naoPodem.length === 1 ? 'pode' : 'podem'} ser transferido(s) por pedido (desligado).`
    : foraDoMeuSetor.length ? `${foraDoMeuSetor.map(p => p.nome).join(', ')} não ${foraDoMeuSetor.length === 1 ? 'é' : 'são'} do seu setor. Para trazer gente de outro setor, use «Trazer de outro setor».`
    : null;

  async function enviar() {
    if (bloqueio || !abertura) return;
    setEnviando(true);
    const pedidos = direcao === 'tirar'
      ? gruposTirar.map(g => ({ origem: g.setorId, pessoas: g.pessoas.map(p => p.id) }))
      : [{ origem, pessoas: [...marcadas] }];
    let ok = 0;
    for (const p of pedidos) {
      const r = await pedirTransferencia({
        direcao, origemSetorId: p.origem, destinoSetorId: destino, pessoas: p.pessoas,
        levarAcordos: levar && levarPermitido, motivo,
      });
      if (r.ok === true) ok += r.pessoas;
      else toast.error(r.erro, { duration: 12000 });
    }
    setEnviando(false);
    if (ok > 0) {
      toast.success(`Pedido enviado: ${ok === 1 ? '1 pessoa' : `${ok} pessoas`} para o ${setorDestino?.nome ?? 'destino'}. O super admin decide no chat.`, {
        duration: 9000,
        action: { label: 'Ver no chat', onClick: () => abrirTransferenciasNoChat() },
      });
      onEnviado();
    }
  }

  const carregando = !!abertura && setores === null;

  return (
    <Dialog open={!!abertura} onOpenChange={o => { if (!o && !enviando) onFechar(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" aria-describedby="pedir-transf-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-primary" />
            {direcao === 'tirar' ? 'Solicitar transferência' : 'Trazer de outro setor'}
          </DialogTitle>
          <DialogDescription id="pedir-transf-desc" className="text-xs">
            O pedido vai para o super admin, que aprova ou recusa cada pessoa. Você acompanha no chat, no canal «Transferências».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {erroSetores && <p className="text-[11px] text-destructive">{erroSetores}</p>}

          {abertura?.direcao === 'tirar' && (
            <div className="space-y-1">
              <Label className="text-xs">{abertura.pessoas.length === 1 ? 'Quem' : `Quem (${abertura.pessoas.length})`}</Label>
              <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                {abertura.pessoas.map(p => (
                  <span key={p.id} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px]">
                    {p.nome}
                    {porId.get(p.setor_id ?? '') && <span className="ml-1 text-muted-foreground">· {porId.get(p.setor_id ?? '')!.nome}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {direcao === 'trazer' && (
            <div className="space-y-1.5">
              <Label className="text-xs">De qual setor <span className="text-destructive">*</span></Label>
              <Select value={origem} onValueChange={v => { setOrigem(v); setLevar(false); }} disabled={carregando}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={carregando ? 'Carregando setores…' : 'Selecione o setor de origem...'} /></SelectTrigger>
                <SelectContent><OpcoesDeSetor setores={origensTrazer} /></SelectContent>
              </Select>
              {origem && (
                <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                  {pessoasOrigem === null ? (
                    <p className="flex items-center gap-2 p-2.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando pessoas…</p>
                  ) : pessoasOrigem.length === 0 ? (
                    <p className="p-2.5 text-xs text-muted-foreground">Ninguém para transferir neste setor.</p>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-xs font-medium">
                        <input type="checkbox" className="h-4 w-4 accent-primary"
                          checked={pessoasOrigem.filter(p => !p.em_pedido).every(p => marcadas.has(p.id)) && marcadas.size > 0}
                          onChange={e => setMarcadas(e.target.checked ? new Set(pessoasOrigem.filter(p => !p.em_pedido).map(p => p.id)) : new Set())} />
                        Marcar todas
                        <span className="ml-auto text-muted-foreground">{marcadas.size} marcada(s)</span>
                      </label>
                      {pessoasOrigem.map(p => (
                        <label key={p.id} className={cn('flex items-center gap-2 px-2.5 py-1.5 text-xs', p.em_pedido ? 'opacity-50' : 'hover:bg-muted/40')}>
                          <input type="checkbox" className="h-4 w-4 accent-primary" disabled={p.em_pedido}
                            checked={marcadas.has(p.id)}
                            onChange={() => setMarcadas(m => { const n = new Set(m); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                          <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                          <span className="shrink-0 text-muted-foreground">{p.em_pedido ? 'já em pedido' : cargo(p.cargo)}</span>
                        </label>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">{direcao === 'tirar' ? 'Para qual setor' : 'Para qual setor seu'} <span className="text-destructive">*</span></Label>
            <Select value={destino} onValueChange={v => { setDestino(v); setLevar(false); }} disabled={carregando}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={carregando ? 'Carregando setores…' : 'Selecione o setor de destino...'} /></SelectTrigger>
              <SelectContent><OpcoesDeSetor setores={destinos} /></SelectContent>
            </Select>
            {mudaRegra && setorDestino && ehRegraDoSetor(setorDestino.regra) && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] leading-snug">
                <strong>Regra de negócio diferente.</strong> O destino segue a regra <strong>{ROTULO_REGRA[setorDestino.regra]}</strong>: lá valem outro relatório, outra tabela de acordos e outras metas.
              </p>
            )}
          </div>

          <label className={cn('flex items-start gap-2 text-xs', !levarPermitido && 'opacity-60')}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={levar && levarPermitido}
              disabled={!levarPermitido} onChange={e => setLevar(e.target.checked)} />
            <span>
              Sugerir levar as tabulações junto
              <span className="block text-[11px] text-muted-foreground leading-snug">
                {levarPermitido
                  ? 'Sem marcar, chega limpo: relatório baixado, tabulações apagadas e NRs liberados. O super admin confirma.'
                  : 'Outra empresa ou outra regra de negócio: sempre chega limpo.'}
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <Label className="text-xs">Motivo (opcional)</Label>
            <Textarea value={motivo} maxLength={500} rows={2} onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: reforço no Play 3 para a campanha de novembro" className="text-sm" />
          </div>

          {bloqueio && (destino || quantas > 0) && <p className="text-[11px] text-destructive leading-snug">{bloqueio}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onFechar} disabled={enviando}>
            <X className="w-3.5 h-3.5 mr-1" /> Cancelar
          </Button>
          <Button size="sm" className="gap-2" onClick={() => void enviar()} disabled={enviando || !!bloqueio || carregando}>
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            {enviando ? 'Enviando…' : quantas > 1 ? `Enviar pedido (${quantas})` : 'Enviar pedido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
