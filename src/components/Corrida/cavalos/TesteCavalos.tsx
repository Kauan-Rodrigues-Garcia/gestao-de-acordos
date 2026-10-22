/**
 * TesteCavalos — o «Testar só na minha tela» da corrida de cavalos: uma corrida
 * de mentira inteira (o paddock enchendo, a largada, a corrida, a festa), sem
 * banco e sem ninguém mais ver. É a página da corrida no modo «teste».
 */
import { useCallback, useRef } from 'react';
import { JanelaCavalos, type EnviarCavalos, type MensagemCavalos } from './JanelaCavalos';

export default function TesteCavalos({ onFechar }: { onFechar: () => void }) {
  const conexao = useRef<EnviarCavalos | null>(null);
  const aoReceber = useCallback((m: MensagemCavalos) => { if (m.tipo === 'fechar') onFechar(); }, [onFechar]);
  return <JanelaCavalos modo="teste" onMensagem={aoReceber} conexao={conexao} />;
}
