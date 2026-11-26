/** Laboratório do sorteio ao vivo (sem banco): `lab-sorteio-vale.html?fase=…&eu=1`. */
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { agoraBanco } from '@/components/Corrida/banco';
import PalcoSorteio from './PalcoSorteio';
import { GIRO_S, PAUSA_S, type ShowJson } from './linhaDoTempo';

const nomes = ['Ana Paula Souza', 'Bruno Lima', 'Carla Dias', 'Diego Martins', 'Eduarda Rocha', 'Felipe Alves', 'Gabriela Nunes', 'Hugo Prado', 'Isabela Reis', 'João Pedro Silva', 'Karina Lopes', 'Lucas Ferreira'];
const concorrentes = nomes.map((nome, i) => ({ perfil_id: `p${i}`, nome, foto: null }));
const q = new URLSearchParams(location.search);
const fase = q.get('fase') ?? 'aguardando';
const agora = agoraBanco();
const iso = (s: number) => new Date(s * 1000).toISOString();
const ganhadores = [{ posicao: 1, perfil_id: 'p3', nome: nomes[3] }, { posicao: 2, perfil_id: 'p7', nome: nomes[7] }, { posicao: 3, perfil_id: 'p0', nome: nomes[0] }];
const passo = GIRO_S + PAUSA_S;
const base: Partial<ShowJson> =
  fase === 'aguardando' ? { estado: 'aberto', revela_em: null }
  : fase === 'contagem' ? { estado: 'contagem', revela_em: iso(agora + 3.4) }
  : fase === 'girando' ? { estado: 'contagem', revela_em: iso(agora - 1) }
  : fase === 'vencedor' ? { estado: 'revelado', revela_em: iso(agora - passo - GIRO_S - 0.6), revelado_em: iso(agora - passo - GIRO_S - 0.6), ganhadores }
  : fase === 'aovivo' ? { estado: 'contagem', revela_em: iso(agora + 7) }
  : { estado: 'revelado', revela_em: iso(agora - 60), revelado_em: iso(agora - 60), ganhadores };
const show: ShowJson = {
  id: 1, setor_id: 's', setor_nome: 'Play 1', premio: 'hot dog', qtd: 3, criado_em: iso(agora - 120),
  revelado_em: null, encerrado_em: null, plateia: 42, concorrentes, ganhadores: null, ...base,
} as ShowJson;

function Lab() {
  return <PalcoSorteio show={show} eu={q.get('eu') ? 'p7' : 'p5'} superAdmin={q.get('super') === '1'} onMinimizar={() => {}} />;
}
createRoot(document.getElementById('lab')!).render(<Lab />);
