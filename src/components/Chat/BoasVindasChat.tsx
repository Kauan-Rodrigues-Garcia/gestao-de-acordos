/**
 * BoasVindasChat.tsx — o cartão que aparece uma vez, antes da primeira conversa.
 *
 * ## O tom é escolha, não acaso
 *
 * O mesmo conteúdo cabe em duas versões. Uma diz «este chat é monitorado, tome
 * cuidado com o que você escreve» — e faz a pessoa usar menos, ou usar com
 * medo. A outra diz para que o chat serve, e explica que o histórico fica
 * porque isso protege quem combinou alguma coisa por ali.
 *
 * O fato é o mesmo. A segunda foi pedida, e é a certa: quem vai usar isto todo
 * dia é a operação, e um chat que nasce com aviso de advertência não substitui
 * a Pomba — vira a Pomba com outra cor.
 *
 * ## Aparece antes da PRIMEIRA conversa, não ao abrir o chat
 *
 * Abrir a janela e dar de cara com um aviso é atrito antes de qualquer
 * benefício. Aparece quando a pessoa vai de fato conversar — o momento em que
 * a informação passa a valer alguma coisa.
 *
 * ## Onde fica guardado
 *
 * `perfis.chat_boas_vindas_em`, e não `localStorage`: a pessoa troca de
 * máquina, entra pelo celular, limpa o navegador — e não deveria reler o mesmo
 * cartão como se o sistema não guardasse nada.
 */
import { useState } from 'react';
import { MessageCircle, Heart, ShieldCheck, Clock, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { registrarBoasVindas } from '@/services/chat/chat.service';

interface Props {
  aberto:    boolean;
  onAceitar: () => void;
}

export function BoasVindasChat({ aberto, onAceitar }: Props) {
  const { perfil, refreshPerfil } = useAuth();
  const [salvando, setSalvando] = useState(false);

  async function aceitar() {
    if (salvando) return;
    setSalvando(true);

    if (perfil?.id) {
      const { erro } = await registrarBoasVindas(perfil.id);

      // Falhou o registro? A pessoa entra assim mesmo, e vai reler o cartão na
      // próxima. Travar alguém na porta porque um UPDATE não passou seria
      // punir quem já fez a parte dele.
      if (erro) console.warn('[chat] boas-vindas:', erro);
      else await refreshPerfil();
    }

    setSalvando(false);
    onAceitar();
  }

  return (
    // Sem `onOpenChange`: clicar fora ou apertar Esc não fecha. É a única
    // interrupção do chat inteiro, e o botão é um só.
    <Dialog open={aberto}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-md p-0 overflow-hidden [&>button]:hidden"
      >
        <div className="bg-primary px-6 py-6 text-primary-foreground">
          <div className="w-11 h-11 rounded-2xl bg-primary-foreground/20 flex items-center justify-center mb-3">
            <MessageCircle className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-bold leading-tight">
            O chat é de vocês
          </DialogTitle>
          <p className="text-sm text-primary-foreground/80 mt-1.5 leading-relaxed">
            Combinar as coisas do dia, tirar uma dúvida rápida, comemorar a meta
            que bateu. Sem sair da planilha.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Item
            Icone={Heart}
            titulo="Trate bem quem está do outro lado"
            texto="Do jeito que você gostaria de ser tratado. Assunto de trabalho, linguagem de trabalho — o resto fica para o grupo da firma."
          />
          <Item
            Icone={ShieldCheck}
            titulo="Fica tudo registrado, e isso é bom"
            texto="Nada some. Se alguém combinou um prazo ou passou um valor por aqui, está escrito — e ninguém vai lembrar diferente depois."
          />
          <Item
            Icone={Clock}
            titulo="CPF sai sozinho em 12 horas"
            texto="Se escapar um CPF numa mensagem, o sistema apaga automaticamente. Mesmo assim, melhor mandar o código do cliente."
          />

          <p className="text-sm text-muted-foreground pt-1">
            É isso. Aproveita, e bom trabalho. 👊
          </p>

          <Button className="w-full" size="lg" onClick={() => void aceitar()} disabled={salvando}>
            {salvando
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Só um instante…</>
              : 'Entendi, bora conversar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Item({
  Icone, titulo, texto,
}: {
  Icone: typeof Heart; titulo: string; texto: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icone className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{titulo}</p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{texto}</p>
      </div>
    </div>
  );
}
