/**
 * CardCavalos — o card de divulgação no tema do hipódromo: os cavalos do jogo
 * galopando e pulando o obstáculo, o bilhete do prêmio com a roseta. É a
 * página da corrida no modo «card»; quem decide o que fechar faz é o
 * `CardDivulgacao` (anotar no banco ou, na prévia, só sumir).
 */
import { useCallback, useRef } from 'react';
import { JanelaCavalos, type EnviarCavalos, type MensagemCavalos } from './JanelaCavalos';

interface Props { titulo: string; mensagem: string; premio: string | null; onFechar: () => void }

export default function CardCavalos({ titulo, mensagem, premio, onFechar }: Props) {
  const conexao = useRef<EnviarCavalos | null>(null);
  const aoReceber = useCallback((m: MensagemCavalos) => {
    if (m.tipo === 'pronto') conexao.current?.({ tipo: 'card', card: { titulo, mensagem, premio } });
    else if (m.tipo === 'card-fechar') onFechar();
  }, [titulo, mensagem, premio, onFechar]);
  return <JanelaCavalos modo="card" onMensagem={aoReceber} conexao={conexao} />;
}
