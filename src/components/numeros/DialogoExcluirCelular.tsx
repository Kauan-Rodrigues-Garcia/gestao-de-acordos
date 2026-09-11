/**
 * DialogoExcluirCelular — mandar um aparelho para a Lixeira de Números.
 *
 * ## Por que existia, e o que mudou
 *
 * Nasceu em 11/09/2026 para o aparelho cadastrado errado, ou duas vezes, que
 * não saía mais da lista. No mesmo dia a exclusão deixou de ser sem volta: o
 * aparelho e os números dele vão para a lixeira no mesmo lote, com o histórico
 * de cada um, e restaurar o aparelho traz todos de volta.
 *
 * ## O que pode ir
 *
 * Os números vão junto, então vale quando cada um pode sair
 * (`podeExcluirCelular`): para o Núcleo, todos no Núcleo e sem operador; para o
 * super_admin, qualquer aparelho. Quem recusa de fato é `fn_numeros_excluir_celular`,
 * e a recusa derruba a exclusão inteira — nada vai pela metade.
 *
 * ## O texto diz o que acontece
 *
 * A consequência exata — o que vai junto, e que dá para restaurar —, e, quando
 * não dá, o que impede e qual é o passo.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { podeExcluirCelular, podeExcluirNumero } from '@/services/numeros/numerosRegras';
import { excluirCelular } from '@/services/numeros/numeros.service';
import type { CelularComNumeros } from '@/hooks/useControleNumeros';

export interface DialogoExcluirCelularProps {
  aparelho: CelularComNumeros | null;
  /** A chave-mestra: o super_admin exclui mesmo com número fora do Núcleo. */
  superAdmin?: boolean;
  onFechar: () => void;
  onExcluido: () => void;
}

export function DialogoExcluirCelular({
  aparelho, superAdmin = false, onFechar, onExcluido,
}: DialogoExcluirCelularProps) {
  const [salvando, setSalvando] = useState(false);

  const estados = (aparelho?.numeros ?? []).map(n => ({
    situacao: n.situacao, posse: n.posse,
    operadorId: n.operador_id, tratamento: n.tratamento,
  }));
  const quantos = estados.length;
  // Os que estão fora do Núcleo — o que segura o Núcleo, e o que o super_admin
  // precisa saber que vai tirar da mão de alguém.
  const foraDoNucleo = estados.filter(e => !podeExcluirNumero(e)).length;
  const bloqueado = !podeExcluirCelular(estados, { superAdmin });

  async function excluir() {
    if (!aparelho || bloqueado) return;
    setSalvando(true);
    const r = await excluirCelular(aparelho.celular.id);
    setSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir.'); return; }
    toast.success(`${aparelho.celular.identificacao} foi para a Lixeira de Números.`);
    onExcluido();
    onFechar();
  }

  const nome = aparelho?.celular.identificacao ?? 'este celular';

  return (
    <AlertDialog open={aparelho !== null} onOpenChange={a => { if (!a) onFechar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {nome}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {bloqueado ? (
                <>
                  <p>
                    Não dá para excluir agora:{' '}
                    {foraDoNucleo === 1
                      ? '1 número deste aparelho está com um setor.'
                      : `${foraDoNucleo} números deste aparelho estão com setores.`}
                  </p>
                  <p>Relance ao Núcleo antes. Depois disso o aparelho sai com todos os números.</p>
                </>
              ) : quantos > 0 ? (
                <>
                  <p>
                    O aparelho vai para a <strong>Lixeira de Números</strong> com{' '}
                    {quantos === 1 ? 'o número dele' : `os ${quantos} números dele`}, e o
                    histórico de cada um vai junto. Restaurar o aparelho traz{' '}
                    {quantos === 1 ? 'o número' : 'todos'} de volta.
                  </p>
                  {foraDoNucleo > 0 && (
                    <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-foreground">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <span>
                        {foraDoNucleo === 1
                          ? '1 número está com um setor e some'
                          : `${foraDoNucleo} números estão com setores e somem`}{' '}
                        do Meus Chips de quem os usa agora.
                      </span>
                    </p>
                  )}
                </>
              ) : (
                <p>
                  O aparelho não tem números e vai para a <strong>Lixeira de Números</strong>.
                  Dá para restaurar de lá.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={salvando}>
            {bloqueado ? 'Fechar' : 'Cancelar'}
          </AlertDialogCancel>
          {!bloqueado && (
            <AlertDialogAction
              disabled={salvando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={e => { e.preventDefault(); void excluir(); }}
            >
              Mover para a lixeira
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
