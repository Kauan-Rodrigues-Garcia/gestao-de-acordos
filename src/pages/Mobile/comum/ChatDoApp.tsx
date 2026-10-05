/**
 * ChatDoApp — o chat do gestão dentro do app do celular (05/10/2026).
 *
 * É a mesma `BolhaChat` do desktop, no modo `celular`: botão no canto e, aberto,
 * tela cheia. Todas as funções e as mesmas regras de quem pode usar.
 *
 *   - Abóbora: o app monta fora do `Layout`, que é quem publica o tema de
 *     Halloween. Aqui a preferência da pessoa (`useHalloween`) é publicada no
 *     mesmo contexto — tema desligado, ícone normal do chat.
 *   - `?chat=<conversa>`: o aviso de mensagem nova abre o app direto na
 *     conversa. Depois de aberta, o parâmetro sai da URL (voltar não reabre).
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BolhaChat } from '@/components/Chat/BolhaChat';
import { TemaHalloweenContext } from '@/components/Halloween/tema';
import { useHalloween } from '@/components/Halloween/preferencia';

/** `acimaDoRodape`: a tela da equipe tem a barra de abas fixa embaixo. */
export function ChatDoApp({ acimaDoRodape = 0 }: { acimaDoRodape?: number }) {
  const hw = useHalloween();
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
    <TemaHalloweenContext.Provider value={hw.ligado}>
      <BolhaChat modo="celular" conversaInicial={conversa} onConversaInicialAberta={consumir}
        acimaDoRodape={acimaDoRodape} />
    </TemaHalloweenContext.Provider>
  );
}
