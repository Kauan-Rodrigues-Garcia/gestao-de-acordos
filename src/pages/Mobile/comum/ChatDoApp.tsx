/**
 * ChatDoApp — o chat do gestão dentro do app do celular (05/10/2026).
 *
 * É a mesma `BolhaChat` do desktop, no modo `celular`: botão no canto e, aberto,
 * tela cheia. Todas as funções e as mesmas regras de quem pode usar.
 *
 *   - `?chat=<conversa>`: o aviso de mensagem nova abre o app direto na
 *     conversa. Depois de aberta, o parâmetro sai da URL (voltar não reabre).
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BolhaChat } from '@/components/Chat/BolhaChat';

/** `acimaDoRodape`: a tela da equipe tem a barra de abas fixa embaixo. */
export function ChatDoApp({ acimaDoRodape = 0 }: { acimaDoRodape?: number }) {
  const [params, setParams] = useSearchParams();
  const conversa = params.get('chat');

  const consumir = useCallback(() => {
    setParams(atual => {
      const proximo = new URLSearchParams(atual);
      proximo.delete('chat');
      return proximo;
    }, { replace: true });
  }, [setParams]);

  return (
    <BolhaChat modo="celular" conversaInicial={conversa} onConversaInicialAberta={consumir}
      acimaDoRodape={acimaDoRodape} />
  );
}
