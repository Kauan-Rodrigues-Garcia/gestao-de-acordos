/**
 * LiberacaoHalloween.tsx — o botão que entrega o Halloween para todo mundo.
 *
 * Temporário, de propósito (01/10/2026): o tema subiu desligado, só o
 * super_admin vê para validar. Apertar aqui grava `halloween_liberacao`
 * (`fn_halloween_liberar`), o banco avisa todas as empresas, e quem está logado
 * recebe a mensagem de outubro na hora — quem entrar depois, ao entrar. Depois
 * de liberado, o cartão some: não há o que desfazer pela tela.
 *
 * Fora de outubro, ou já liberado, não aparece.
 */
import { useState } from 'react';
import { Ghost, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEmpresa } from '@/hooks/useEmpresa';
import { liberarHalloween, useHalloweenLiberado } from '@/components/Halloween/liberacao';
import { abrirBoasVindasHalloween, temporadaHalloween } from '@/components/Halloween/preferencia';

export default function LiberacaoHalloween() {
  const { empresa } = useEmpresa();
  const liberado = useHalloweenLiberado(empresa?.id);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  if (liberado || !temporadaHalloween()) return null;

  async function liberar() {
    setEnviando(true);
    const { erro } = await liberarHalloween();
    setEnviando(false);
    setConfirmando(false);
    if (erro) {
      toast.error('Não foi possível liberar o Halloween', { description: erro });
      return;
    }
    toast.success('Halloween liberado 🎃', {
      description: 'Quem está logado recebe a mensagem agora; quem entrar depois, ao entrar.',
    });
  }

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Ghost className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Halloween — pré-estreia
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Hoje só super admins veem o tema. Ao liberar, quem está logado recebe na hora a
          mensagem de outubro — fechada, no rodapé, com «Ler agora»; a música só toca quando
          a pessoa abre — e ganha o tema; quem entrar depois recebe ao entrar. Cada um
          pode desligar os enfeites no botão de tema. Este cartão some depois de liberado.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setConfirmando(true)} disabled={enviando} className="gap-1.5">
            {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span aria-hidden>🎃</span>}
            Liberar o Halloween para todos
          </Button>
          <Button size="sm" variant="outline" onClick={abrirBoasVindasHalloween} className="gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Ver a mensagem
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmando} onOpenChange={v => !enviando && setConfirmando(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar o Halloween para todos?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem de outubro aparece agora, fechada, para todo mundo que está logado,
              nas duas empresas, e o tema liga para todos. A música só toca para quem clicar
              em «Ler agora». Não dá para recolher pela tela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Ainda não</AlertDialogCancel>
            <AlertDialogAction
              disabled={enviando}
              onClick={e => { e.preventDefault(); void liberar(); }}
            >
              {enviando ? 'Liberando…' : 'Liberar agora'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
