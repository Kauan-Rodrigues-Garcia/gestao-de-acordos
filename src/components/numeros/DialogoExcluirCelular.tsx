/**
 * DialogoExcluirCelular — apagar um aparelho cadastrado por engano.
 *
 * ## Por que não existia
 *
 * O módulo nasceu com «aparelho sai de uso, não é apagado» (a coluna `ativo` de
 * `numeros_celulares`), e a tela nunca ganhou nem o botão nem a função. Na
 * operação, o caso que apareceu primeiro foi o outro: o aparelho cadastrado
 * errado, ou duas vezes, e nenhum jeito de tirá-lo da lista.
 *
 * ## O que pode ser apagado
 *
 * Os números apontam para o aparelho com `ON DELETE RESTRICT`, então a exclusão
 * leva os números JUNTO — e só é oferecida quando todos eles ainda podem sair do
 * cadastro: no Núcleo e sem operador (`podeExcluirCelular`).
 *
 * O que a tela não enxerga é se um número já circulou por um setor e voltou.
 * Esse caso o banco recusa (`fn_numeros_pode_excluir`), e a recusa derruba a
 * exclusão inteira: nenhum número é apagado pela metade.
 *
 * ## O texto diz o que se perde
 *
 * Mesma regra de `DialogoExcluirNumero`: a consequência exata — os números e o
 * histórico deles vão junto —, e, quando não dá, o que impede e qual é o passo.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { podeExcluirCelular, podeExcluirNumero } from '@/services/numeros/numerosRegras';
import { excluirCelular } from '@/services/numeros/numeros.service';
import type { CelularComNumeros } from '@/hooks/useControleNumeros';

export interface DialogoExcluirCelularProps {
  aparelho: CelularComNumeros | null;
  onFechar: () => void;
  onExcluido: () => void;
}

export function DialogoExcluirCelular({
  aparelho, onFechar, onExcluido,
}: DialogoExcluirCelularProps) {
  const [salvando, setSalvando] = useState(false);

  const estados = (aparelho?.numeros ?? []).map(n => ({
    situacao: n.situacao, posse: n.posse,
    operadorId: n.operador_id, tratamento: n.tratamento,
  }));
  const quantos = estados.length;
  const presos = estados.filter(e => !podeExcluirNumero(e)).length;
  const bloqueado = !podeExcluirCelular(estados);

  async function excluir() {
    if (!aparelho || bloqueado) return;
    setSalvando(true);
    const r = await excluirCelular(aparelho.celular.id);
    setSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir.'); return; }
    toast.success(`${aparelho.celular.identificacao} foi excluído do cadastro.`);
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
                    {presos === 1
                      ? '1 número deste aparelho está com um setor.'
                      : `${presos} números deste aparelho estão com setores.`}
                  </p>
                  <p>
                    Relance ao Núcleo antes. Número que já circulou por um setor
                    tem histórico e não é excluído — marque <strong>Banido</strong>.
                  </p>
                </>
              ) : quantos > 0 ? (
                <>
                  <p>
                    O aparelho sai do cadastro com{' '}
                    {quantos === 1 ? 'o número dele' : `os ${quantos} números dele`},
                    e o histórico {quantos === 1 ? 'desse número' : 'desses números'} é
                    apagado junto. Não há como desfazer.
                  </p>
                  <p>
                    Se algum número já circulou por um setor, a exclusão é recusada
                    inteira — nada é apagado.
                  </p>
                </>
              ) : (
                <p>O aparelho não tem números e sai do cadastro. Não há como desfazer.</p>
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
              Excluir
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
