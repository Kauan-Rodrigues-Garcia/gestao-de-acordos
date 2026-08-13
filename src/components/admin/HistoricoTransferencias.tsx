/**
 * HistoricoTransferencias.tsx — as transferências de uma pessoa, e o desfazer.
 *
 * Fica dentro do modal de editar usuário porque é ali que o admin vai procurar:
 * ele abre a pessoa que foi movida errado, não uma tela de auditoria.
 *
 * ## O que o desfazer alcança, e o que não
 *
 * Volta: empresa, setor, equipe e os clones que a ida removeu.
 * Não volta: tabulação apagada. Quando a transferência escolheu "chegar limpo",
 * as tabulações saíram para os NRs ficarem livres — e outra pessoa pode já ter
 * tabulado aqueles códigos. O relatório baixado na ida é o registro, e o nome do
 * arquivo aparece aqui para quem precisar procurá-lo.
 *
 * Por isso o botão avisa ANTES, com o número, em vez de descobrir depois.
 */
import { useEffect, useState, useCallback } from 'react';
import { ArrowRightLeft, Loader2, RotateCcw, FileDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  listarTransferenciasDoPerfil, desfazerTransferencia,
  type TransferenciaRegistrada,
} from '@/services/admin/transferenciaUsuario.service';
import { toast } from 'sonner';

interface Props {
  perfilId: string;
  /** Só administrador/super_admin desfaz — a RPC também cobra, isto tira o botão. */
  podeDesfazer: boolean;
  nomeDoSetor: (id: string | null) => string;
  nomeDaEmpresa: (id: string | null) => string;
  /** Recarrega a lista de usuários da tela de trás depois de desfazer. */
  onDesfeita: () => void;
}

export function HistoricoTransferencias({
  perfilId, podeDesfazer, nomeDoSetor, nomeDaEmpresa, onDesfeita,
}: Props) {
  const [itens, setItens] = useState<TransferenciaRegistrada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [confirmando, setConfirmando] = useState<TransferenciaRegistrada | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setItens(await listarTransferenciasDoPerfil(perfilId));
    setCarregando(false);
  }, [perfilId]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function confirmarDesfazer() {
    if (!confirmando) return;
    setDesfazendo(true);
    const r = await desfazerTransferencia(confirmando.id);
    setDesfazendo(false);

    if (r.status === 'falha') { toast.error(r.mensagem); return; }

    const partes = ['Transferência desfeita — empresa, setor e equipe voltaram ao que eram.'];
    if (r.clonesRestaurados > 0) {
      partes.push(`${r.clonesRestaurados} vínculo(s) de clone restaurado(s).`);
    }
    toast.success(partes.join(' '), { duration: 8000 });

    if (r.acordosNaoRestaurados > 0) {
      toast.warning(
        `${r.acordosNaoRestaurados.toLocaleString('pt-BR')} tabulações apagadas na `
        + `transferência NÃO voltaram${r.relatorio ? ` — elas estão em ${r.relatorio}` : ''}.`,
        { duration: 12000 },
      );
    }

    setConfirmando(null);
    void carregar();
    onDesfeita();
  }

  // Sem transferência nenhuma a seção não aparece: é o caso da maioria dos
  // usuários, e uma seção vazia só ocuparia espaço no modal.
  if (carregando) {
    return (
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> Verificando transferências…
      </p>
    );
  }
  if (!itens.length) return null;

  return (
    <div className="space-y-2 py-2 border-t border-border pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Transferências
      </p>

      <div className="space-y-1.5">
        {itens.map(t => (
          <div
            key={t.id}
            className="rounded-md border border-border bg-muted/20 p-2.5 text-xs space-y-1.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <p className="flex items-center gap-1.5 flex-wrap font-medium">
                  <ArrowRightLeft className="w-3 h-3 text-muted-foreground shrink-0" />
                  {t.tipo === 'empresa' ? (
                    <>
                      {nomeDaEmpresa(t.origemEmpresaId)} → {nomeDaEmpresa(t.destinoEmpresaId)}
                    </>
                  ) : (
                    <>
                      {nomeDoSetor(t.origemSetorId)} → {nomeDoSetor(t.destinoSetorId)}
                    </>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {new Date(t.criadoEm).toLocaleString('pt-BR')}
                  {' · '}
                  {t.levouAcordos
                    ? 'levou as tabulações'
                    : t.acordosApagados > 0
                      ? `${t.acordosApagados.toLocaleString('pt-BR')} tabulações apagadas`
                      : 'sem tabulações'}
                </p>
                {t.relatorio && (
                  <p className="text-muted-foreground flex items-center gap-1">
                    <FileDown className="w-3 h-3" /> {t.relatorio}
                  </p>
                )}
              </div>

              <div className="shrink-0">
                {t.desfeitaEm ? (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Check className="w-3 h-3" /> desfeita
                  </Badge>
                ) : podeDesfazer ? (
                  <Button
                    size="sm" variant="outline"
                    className="h-7 px-2 text-[11px] gap-1"
                    onClick={() => setConfirmando(t)}
                  >
                    <RotateCcw className="w-3 h-3" /> Desfazer
                  </Button>
                ) : null}
              </div>
            </div>

            {!t.desfeitaEm && !t.fantasmaAtivo && (
              <p className="text-[10px] text-muted-foreground">
                O recebimento dele já foi tirado da equipe de origem.
              </p>
            )}
          </div>
        ))}
      </div>

      <AlertDialog
        open={!!confirmando}
        onOpenChange={o => { if (!o && !desfazendo) setConfirmando(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-primary" /> Desfazer transferência
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm">
                <p>
                  Empresa, setor, equipe e os vínculos de clone voltam ao que eram
                  antes da transferência.
                </p>
                {(confirmando?.acordosApagados ?? 0) > 0 && (
                  <p className="text-destructive">
                    As <strong>
                      {confirmando?.acordosApagados.toLocaleString('pt-BR')}
                    </strong>{' '}
                    tabulações apagadas <strong>não voltam</strong>. Os NRs delas foram
                    liberados e podem já ter sido tabulados por outra pessoa.
                    {confirmando?.relatorio
                      && ` O registro delas está em ${confirmando.relatorio}.`}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={desfazendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); void confirmarDesfazer(); }}
              disabled={desfazendo}
              className="gap-1.5"
            >
              {desfazendo && <Loader2 className="w-4 h-4 animate-spin" />}
              {desfazendo ? 'Desfazendo…' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
