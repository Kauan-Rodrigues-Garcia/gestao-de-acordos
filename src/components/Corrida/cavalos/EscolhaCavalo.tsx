/**
 * EscolhaCavalo — quem corre escolhe o cavalo (o papel do `EscolhaBichinho`).
 *
 * A tela é a da página da corrida (os 24 cavalos de verdade, desenhados). Os
 * donos vêm da sala, que quem corre já lê na fase de escolha; o banco avisa na
 * hora quando alguém pega um cavalo (20261022120000). Escolher é
 * `fn_corrida_escolher`: quem chega um instante depois recebe CAVALO_TEM_DONO,
 * e a tela pede para escolher outro.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { escolherBichinho, lerSala, mensagemDoErro, useCorridaMinha, agoraBanco, type CorridaJson } from '../banco';
import { JanelaCavalos, type EnviarCavalos, type MensagemCavalos } from './JanelaCavalos';

interface Props { corrida: CorridaJson; usuario: string; onDepois: () => void }

export default function EscolhaCavalo({ corrida, usuario, onDepois }: Props) {
  const { sala } = useCorridaMinha();
  const conexao = useRef<EnviarCavalos | null>(null);
  const [pronta, setPronta] = useState(false);

  // A sala (os donos): lida ao abrir e a cada 8 s, além dos avisos do banco.
  useEffect(() => {
    void lerSala(corrida.id);
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void lerSala(corrida.id); }, 8_000);
    return () => window.clearInterval(id);
  }, [corrida.id]);
  useEffect(() => {
    if (!pronta || !sala || sala.corrida.id !== corrida.id) return;
    conexao.current?.({ tipo: 'sala', sala, eu: usuario, adm: false, desvio: agoraBanco() * 1000 - Date.now() });
  }, [pronta, sala, corrida.id, usuario]);

  const aoReceber = useCallback((m: MensagemCavalos) => {
    if (m.tipo === 'pronto') setPronta(true);
    else if (m.tipo === 'escolher' && typeof m.cavalo === 'number') {
      escolherBichinho(corrida.id, m.cavalo)
        .then(() => { conexao.current?.({ tipo: 'escolha-res', ok: true }); void lerSala(corrida.id); })
        .catch(e => conexao.current?.({ tipo: 'escolha-res', ok: false, erro: String(e), texto: mensagemDoErro(e) }));
    } else if (m.tipo === 'escolhido' || m.tipo === 'fechar') onDepois();
  }, [corrida.id, onDepois]);

  return <JanelaCavalos modo="escolha" onMensagem={aoReceber} conexao={conexao} />;
}
