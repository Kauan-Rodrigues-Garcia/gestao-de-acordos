/**
 * ModoLeveConfig.tsx — «Desligar o modo leve de todos» (29/10/2026).
 *
 * O modo leve é por computador; o app não o liga mais sozinho (a oferta saiu).
 * Este botão desliga o modo leve de todos os computadores de uma vez: cada tela
 * que o ligou antes da hora do clique o desliga, e quem precisar liga de novo
 * no menu de tema. Ver `lib/modoLeveZerado.ts` e a migration 20261029200000.
 *
 * Só super_admin — `fn_modo_leve_zerar` confere de novo no banco.
 */
import { useEffect, useState } from 'react';
import { Feather, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { lerModoLeveZerado, zerarModoLeveDeTodos, type ModoLeveZerado } from '@/lib/modoLeveZerado';

export default function ModoLeveConfig() {
  const [estado, setEstado] = useState<ModoLeveZerado | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { void lerModoLeveZerado().then(r => setEstado(r.valor)); }, []);

  async function zerar() {
    setEnviando(true);
    const r = await zerarModoLeveDeTodos();
    setEnviando(false);
    setConfirmando(false);
    if (r.erro) { toast.error('Não foi possível desligar', { description: r.erro }); return; }
    setEstado(r.valor);
    toast.success('Modo leve desligado em todos os computadores.');
  }

  const quando = estado?.zeradoEm
    ? new Date(estado.zeradoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Feather className="w-4 h-4 text-primary" /> Modo leve dos computadores
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          O modo leve é escolhido em cada computador, no menu de tema, e o app não sugere mais
          ligá-lo. Este botão desliga o modo leve em todos os computadores de uma vez: quem está com
          o app aberto é desligado na hora, e quem precisar liga de novo depois.
        </p>
        {quando && (
          <p className="text-[11px] text-muted-foreground">
            Última vez: {quando}{estado?.zeradoPorNome ? `, por ${estado.zeradoPorNome}` : ''}.
          </p>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" disabled={enviando} onClick={() => setConfirmando(true)}>
          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Feather className="w-3.5 h-3.5" />}
          Desligar o modo leve de todos
        </Button>
      </CardContent>

      <AlertDialog open={confirmando} onOpenChange={v => !enviando && setConfirmando(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar o modo leve de todos?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os computadores com o modo leve ligado voltam ao normal, com as animações. Cada
              pessoa recebe um aviso e pode ligar de novo no menu de tema se o computador ficar lento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Ainda não</AlertDialogCancel>
            <AlertDialogAction disabled={enviando} onClick={e => { e.preventDefault(); void zerar(); }}>
              {enviando ? 'Desligando…' : 'Desligar de todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
