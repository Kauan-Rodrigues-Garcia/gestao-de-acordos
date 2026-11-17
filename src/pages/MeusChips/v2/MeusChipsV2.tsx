/**
 * MeusChipsV2 — a aba Meus Chips refeita do zero (17/11/2026).
 *
 * Decide a visão pelo alcance (`useChipsFisicos`): os próprios chips
 * (VisaoOperador) ou o setor/todos (VisaoGestao). Aqui ficam as janelas
 * (cadastro, status, etiquetas, lembrete, exclusão) e o aviso na tela quando
 * um tempo ou lembrete acaba com a página aberta — a notificação de verdade vem
 * do robô `chips-fisicos-avisar` (migration 20261117200000).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Database } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgora } from '@/hooks/useAgora';
import { useChipsFisicos } from '@/hooks/useChipsFisicos';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { estadoDoLembrete, estadoDoTempo } from '@/services/chipsFisicos/chipsFisicosRegras';
import {
  excluirChipFisico, type ChipFisicoRow, type PessoaChipRow,
} from '@/services/chipsFisicos/chipsFisicos.service';
import { DialogoChipFisico } from '../ChipsFisicos/DialogoChipFisico';
import { DialogoStatusChip } from '../ChipsFisicos/DialogoStatusChip';
import { DialogoEtiquetas } from '../ChipsFisicos/DialogoEtiquetas';
import { DialogoLembrete } from '../ChipsFisicos/DialogoLembrete';
import type { AcoesDoChip } from './CartaoChip';
import { VisaoGestao } from './VisaoGestao';
import { VisaoOperador } from './VisaoOperador';

interface Cadastro { aberto: boolean; chip: ChipFisicoRow | null; dono: string | null; setor: string | null }
const FECHADO: Cadastro = { aberto: false, chip: null, dono: null, setor: null };

export function MeusChipsV2() {
  const {
    habilitado, alcance, podeCuidarColegas, chips, pessoas, setores, equipes,
    meuId, meuSetorId, instalado, loading, erro, recarregar,
  } = useChipsFisicos();
  const agora = useAgora();

  const [paraStatus, setParaStatus] = useState<ChipFisicoRow | null>(null);
  const [paraEtiquetas, setParaEtiquetas] = useState<ChipFisicoRow | null>(null);
  const [paraLembrete, setParaLembrete] = useState<ChipFisicoRow | null>(null);
  const [paraExcluir, setParaExcluir] = useState<ChipFisicoRow | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [cadastro, setCadastro] = useState<Cadastro>(FECHADO);

  const recursos2 = chips.some(c => 'etiquetas' in c);
  const nomeDe = useCallback((id: string) => pessoas.get(id)?.nome ?? '', [pessoas]);
  const podeCuidar = useCallback(
    (c: ChipFisicoRow) => c.operador_id === meuId || podeCuidarColegas, [meuId, podeCuidarColegas]);

  const acoes = useMemo<AcoesDoChip>(() => ({
    onStatus: setParaStatus,
    onCorrigir: c => setCadastro({ aberto: true, chip: c, dono: null, setor: null }),
    onExcluir: setParaExcluir,
    onEtiquetas: setParaEtiquetas,
    onLembrete: setParaLembrete,
  }), []);
  const aoMudar = useCallback(() => { void recarregar(); }, [recarregar]);

  // Para quem o chip pode ir no cadastro (só quem cuida de colegas escolhe).
  const escolhiveis = useMemo<PessoaChipRow[] | null>(() => {
    if (!podeCuidarColegas || alcance === 'proprios') return null;
    const setorAlvo = cadastro.setor ?? (alcance === 'setor' ? meuSetorId : null);
    const lista = [...pessoas.values()]
      .filter(p => (cadastro.chip ? true : p.ativo) && (!setorAlvo || p.setor_id === setorAlvo))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (cadastro.chip) {
      const dono = pessoas.get(cadastro.chip.operador_id);
      if (dono && !lista.some(p => p.id === dono.id)) lista.unshift(dono);
    }
    return lista;
  }, [podeCuidarColegas, alcance, pessoas, cadastro, meuSetorId]);

  // O «plim» na tela: tempo ou lembrete que acaba com a página aberta.
  const vencidos = chips
    .flatMap(c => [
      ...(estadoDoTempo(c, agora).tipo === 'encerrado' ? [`${c.id}:t`] : []),
      ...(estadoDoLembrete(c, agora).tipo === 'vencido' ? [`${c.id}:l`] : []),
    ])
    .join(',');
  const vistos = useRef<Set<string> | null>(null);
  useEffect(() => {
    const atuais = new Set(vencidos ? vencidos.split(',') : []);
    const antes = vistos.current;
    vistos.current = atuais;
    if (!antes) return;
    for (const chave of atuais) {
      if (antes.has(chave)) continue;
      const [id, tipo] = chave.split(':');
      const c = chips.find(x => x.id === id);
      if (!c) continue;
      const dono = c.operador_id !== meuId && nomeDe(c.operador_id) ? ` (${nomeDe(c.operador_id)})` : '';
      if (tipo === 'l') {
        toast.info(`Lembrete: ${c.lembrete_texto ?? ''}`, { description: `${mascararNumero(c.numero)}${dono}`, duration: 15_000 });
      } else {
        toast.warning(`Tempo encerrado — ${mascararNumero(c.numero)}${dono}`, {
          description: 'Confira o chip e mude o status.', duration: 15_000,
        });
      }
    }
  }, [vencidos, chips, meuId, nomeDe]);

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    const r = await excluirChipFisico(paraExcluir.id);
    setExcluindo(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir o chip.'); return; }
    toast.success(`Chip ${mascararNumero(paraExcluir.numero)} excluído.`);
    setParaExcluir(null);
    void recarregar();
  }

  if (!habilitado) return null;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (!instalado) {
    return (
      <div className="rounded-2xl border border-dashed py-14 text-center">
        <Database className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="mt-2 text-base font-medium">Chips Físicos ainda não está no banco.</p>
      </div>
    );
  }

  const meusChips = alcance === 'proprios' ? chips.filter(c => c.operador_id === meuId) : chips;

  return (
    <>
      {erro && <p className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-base text-destructive">{erro}</p>}

      {alcance === 'proprios' ? (
        <VisaoOperador
          chips={meusChips}
          nome={meuId ? nomeDe(meuId) : ''}
          recursos2={recursos2}
          podeCuidar={podeCuidar}
          onAdicionar={() => setCadastro({ aberto: true, chip: null, dono: meuId, setor: null })}
          acoes={acoes}
        />
      ) : (
        <VisaoGestao
          alcance={alcance}
          chips={chips}
          pessoas={pessoas}
          setores={setores}
          equipes={equipes}
          meuSetorId={meuSetorId}
          recursos2={recursos2}
          podeCuidar={podeCuidar}
          podeAdicionarPara={id => podeCuidarColegas || id === meuId}
          onAdicionar={(dono, setor) => setCadastro({ aberto: true, chip: null, dono: dono ?? (podeCuidarColegas ? null : meuId), setor })}
          acoes={acoes}
        />
      )}

      <DialogoChipFisico
        aberto={cadastro.aberto}
        chip={cadastro.chip}
        donoInicial={cadastro.dono}
        pessoasEscolhiveis={escolhiveis}
        onFechar={() => setCadastro(FECHADO)}
        onSalvo={aoMudar}
      />
      <DialogoStatusChip chip={paraStatus} onFechar={() => setParaStatus(null)} onSalvo={aoMudar} />
      <DialogoEtiquetas chip={paraEtiquetas} onFechar={() => setParaEtiquetas(null)} onSalvo={aoMudar} />
      <DialogoLembrete chip={paraLembrete} onFechar={() => setParaLembrete(null)} onSalvo={aoMudar} />

      <AlertDialog open={paraExcluir !== null} onOpenChange={a => { if (!a && !excluindo) setParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir chip?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {paraExcluir
                ? `${mascararNumero(paraExcluir.numero)}${paraExcluir.operador_id !== meuId && nomeDe(paraExcluir.operador_id)
                    ? ` (${nomeDe(paraExcluir.operador_id)})` : ''} sai da lista e não volta. Use quando o chip não está mais com a pessoa.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); void excluir(); }}
              disabled={excluindo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir chip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
