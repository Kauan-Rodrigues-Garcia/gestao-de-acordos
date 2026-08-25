/**
 * LiberacaoChat.tsx — a chave que abre o chat para a operação.
 *
 * ## Por que existe uma trava além das permissões
 *
 * `fn_user_tem` responde `true` para ADMINISTRADOR em qualquer chave que não
 * seja «explícita». Então semear `ver_chat` como «ninguém» fecha para os cargos
 * configuráveis e NÃO fecha para o administrador — e o pedido era que, no
 * primeiro dia, só o super_admin entrasse.
 *
 * Enquanto esta chave estiver desligada, o banco recusa o chat para todo mundo
 * que não for super_admin, por mais ligada que esteja a permissão do cargo.
 * Depois de virada, o painel de permissões passa a mandar sozinho.
 *
 * É o mesmo desenho da aba de Tickets, que também nasceu fechada — só que uma
 * casa mais para dentro.
 */
import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Loader2, Lock, Unlock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useToast } from '@/components/ui/use-toast';
import { lerLiberacaoChat, definirLiberacaoChat } from '@/services/chat/chat.service';

export default function LiberacaoChat() {
  const { empresa } = useEmpresa();
  const { toast } = useToast();

  const [liberado, setLiberado] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!empresa?.id) return;
    let vivo = true;
    void lerLiberacaoChat(empresa.id).then(v => { if (vivo) setLiberado(v); });
    return () => { vivo = false; };
  }, [empresa?.id]);

  const virar = useCallback(async (novo: boolean) => {
    if (!empresa?.id || salvando) return;
    setSalvando(true);

    // Otimista: a chave vira na hora e volta atrás se o banco recusar. Um
    // interruptor que demora meio segundo para se mexer parece quebrado.
    setLiberado(novo);
    const { erro } = await definirLiberacaoChat(empresa.id, novo);
    setSalvando(false);

    if (erro) {
      setLiberado(!novo);
      toast({ title: 'Não foi possível salvar', description: erro, variant: 'destructive' });
      return;
    }
    toast({
      title: novo ? 'Chat liberado' : 'Chat fechado',
      description: novo
        ? 'Agora quem tem a permissão no painel entra. Confira os cargos antes de avisar a operação.'
        : 'Só super admins voltam a enxergar o chat. As conversas continuam guardadas.',
    });
  }, [empresa?.id, salvando, toast]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary" /> Chat interno
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium flex items-center gap-1.5">
              {liberado
                ? <><Unlock className="w-3.5 h-3.5 text-emerald-600" /> Liberado para a operação</>
                : <><Lock className="w-3.5 h-3.5 text-muted-foreground" /> Fechado — só super admins</>}
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {liberado
                ? 'Quem enxerga o chat é decidido pelo painel de permissões, em Cargos → Chat. '
                  + 'Fechar aqui esconde de todo mundo de novo, sem apagar conversa nenhuma.'
                : 'Enquanto estiver fechado, nem administrador enxerga o chat — só super admins. '
                  + 'Antes de abrir, ajuste em Cargos → Chat quem pode usar e até onde cada um alcança.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            <Switch
              checked={!!liberado}
              disabled={liberado === null || salvando}
              onCheckedChange={v => void virar(v)}
              aria-label="Liberar o chat para a operação"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
