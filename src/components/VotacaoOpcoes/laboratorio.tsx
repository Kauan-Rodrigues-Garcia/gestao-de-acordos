// Laboratório da votação de opções (16/11/2026): as telas com dados FICTÍCIOS, sem banco.
// Só no `npm run dev`: /lab-votacao-opcoes.html
//   (nada)    uma tela qualquer do gestão com a votação abrindo sozinha
//   ?pilula   só a pílula no pé (como fica depois de «Votar mais tarde»)
//   ?votado   a tela de quem já votou
//   ?fotos    fotos de mentira no lugar do emoji
//   ?config   a configuração (montar e liberar) com pessoas fictícias; «Liberar» não grava
//   ?claro    tema claro
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence } from 'framer-motion';
import '@/index.css';
import { Toaster, toast } from '@/components/ui/sonner';
import type { EquipeDaVotacao, GrupoDaVotacao, Participante } from '@/components/VotacaoLideres/participantes';
import { VOTACAO_DEZEMBRO, type OpcaoDaVotacao } from './opcoes';
import { PilulaVotacaoOpcoes } from './AvisoVotacaoOpcoes';
import { TelaVotacaoOpcoes } from './TelaVotacaoOpcoes';
import { MontarVotacaoOpcoes } from './MontarVotacaoOpcoes';
import { PainelVotacaoOpcoes, type FonteDoPainel } from './PainelVotacaoOpcoes';
import type { VotacaoOpcoesNaLista } from './banco';

const busca = new URLSearchParams(location.search);
if (!busca.has('claro')) document.documentElement.classList.add('dark');

const fotoFalsa = (tom: number, emoji: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="hsl(${tom} 30% 55%)"/><circle cx="125" cy="22" r="40" fill="hsl(${tom} 30% 65%)"/><text x="80" y="58" font-size="34" text-anchor="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};
const opcoes: OpcaoDaVotacao[] = VOTACAO_DEZEMBRO.opcoes.map((o, i) => ({
  ...o, foto: busca.has('fotos') ? fotoFalsa(i ? 30 : 200, o.emoji) : null,
}));

// Pessoas fictícias para a configuração.
const SETORES = [
  { id: 's1', nome: 'Play 1', grupo: 'marca:bookplay' }, { id: 's2', nome: 'Play 2', grupo: 'marca:bookplay' },
  { id: 's3', nome: 'Receptivo', grupo: 'marca:bookplay' }, { id: 's4', nome: 'Conecta Play', grupo: 'marca:pagueplay' },
  { id: 's5', nome: 'Jornada', grupo: 'marca:pagueplay' },
];
const NOMES = ['Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Rocha', 'Eduarda Alves', 'Felipe Costa', 'Gabriela Dias', 'Heitor Nunes',
  'Isabela Ramos', 'João Pedro Silva', 'Karina Lopes', 'Lucas Martins', 'Mariana Freitas', 'Nicolas Prado', 'Olívia Teixeira', 'Paulo Henrique'];
const SOBRENOMES = ['Souza', 'Oliveira', 'Santos', 'Pereira', 'Ferreira'];
const equipes: EquipeDaVotacao[] = SETORES.flatMap(s => [1, 2].map(n => ({ id: `${s.id}e${n}`, nome: `Equipe ${n}`, setorId: s.id })));
const pessoas: Participante[] = Array.from({ length: 70 }, (_, i) => {
  const s = SETORES[i % SETORES.length];
  const perfil = i % 9 === 0 ? 'lider' : i % 23 === 0 ? 'elite' : 'operador';
  return {
    id: `p${i}`, nome: i === 5 ? 'Suporte Play 1' : `${NOMES[i % NOMES.length].split(' ')[0]} ${SOBRENOMES[Math.floor(i / NOMES.length) % SOBRENOMES.length]}`,
    foto: null as string | null, perfil, setor: s.nome, setorId: s.id, equipeId: `${s.id}e${(i % 2) + 1}`, grupo: s.grupo, produto: 'cobranca', empresa: '',
  };
});
const grupos: GrupoDaVotacao[] = [
  { chave: 'marca:bookplay', rotulo: 'BookPlay · Birigui', produto: 'cobranca', setores: SETORES.filter(s => s.grupo === 'marca:bookplay').map(s => ({ ...s, produto: 'cobranca' as const })) },
  { chave: 'marca:pagueplay', rotulo: 'PaguePlay · Marília', produto: 'cobranca', setores: SETORES.filter(s => s.grupo === 'marca:pagueplay').map(s => ({ ...s, produto: 'cobranca' as const })) },
];

// O painel de acompanhamento com uma votação fictícia: 61 pessoas, 47 votaram.
let estadoFalso: VotacaoOpcoesNaLista['estado'] = 'aberta';
const fontePainel: FonteDoPainel = {
  listar: async () => [{
    id: 'v1', titulo: VOTACAO_DEZEMBRO.titulo, pergunta: VOTACAO_DEZEMBRO.pergunta, opcoes: VOTACAO_DEZEMBRO.opcoes,
    estado: estadoFalso, eleitores: 61, votaram: 47, contagem: { premios: 28, happy_hour: 19 },
    criada_em: '2026-11-16T13:00:00Z', encerrada_em: null, cancelada_em: null,
  }],
  participacao: async () => pessoas.slice(0, 61).map((p, i) => ({
    id: p.id, nome: p.nome, setor: p.setor, votado_em: i < 47 ? '2026-11-16T14:00:00Z' : null,
  })),
  mudar: async (_id, acao) => {
    estadoFalso = acao === 'encerrar' ? 'encerrada' : acao === 'reabrir' ? 'aberta' : 'cancelada';
  },
};

function Lab() {
  const [aberta, setAberta] = useState(!busca.has('pilula'));
  if (busca.has('config')) {
    return (
      <div className="min-h-screen bg-background p-4 text-foreground sm:p-8">
        <div className="mx-auto max-w-4xl rounded-xl border bg-card p-4 sm:p-5">
          <h1 className="mb-4 text-base font-semibold">Votação de opções · laboratório (não grava)</h1>
          <div className="mb-6 border-b pb-5"><PainelVotacaoOpcoes versao={0} fonte={fontePainel} /></div>
          <MontarVotacaoOpcoes dados={{ pessoas, grupos, equipes }} onLiberada={() => {}}
            liberar={async d => { toast.info(`Laboratório: liberaria para ${d.eleitores.length} pessoas`); }} />
        </div>
        <Toaster />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="text-xl font-bold">Uma tela qualquer do gestão</h1>
      <p className="mt-1 text-sm text-muted-foreground">A votação abre sozinha; «Votar mais tarde» deixa a pílula no pé da tela.</p>
      <AnimatePresence>
        {!aberta && <PilulaVotacaoOpcoes titulo={VOTACAO_DEZEMBRO.titulo} onAbrir={() => setAberta(true)} />}
      </AnimatePresence>
      {aberta && (
        <TelaVotacaoOpcoes demo titulo={VOTACAO_DEZEMBRO.titulo} pergunta={VOTACAO_DEZEMBRO.pergunta} opcoes={opcoes}
          meuVoto={busca.has('votado') ? 'happy_hour' : null}
          onVotar={() => new Promise(r => setTimeout(r, 600))} onFechar={() => setAberta(false)} />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Lab /></StrictMode>);
