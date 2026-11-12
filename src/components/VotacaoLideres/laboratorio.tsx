// Laboratório da Votação da Liderança: a tela com líderes FICTÍCIOS, sem banco.
// Só no `npm run dev`: /lab-votacao-lideres.html
//   ?claro  tema claro      ?n=30  quantos líderes     ?fotos  rostos de mentira (desenhos)
//   ?uma    uma pergunta por vez
//   ?card   o card do canto (votar); ?card=resultado o de resultado
//   ?gerentes  a votação dos GERENTES (12/11/2026): a cédula de opções com 1
//              gerente; ?gerentes=2 com dois (setor com 2 gerentes)
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { PERGUNTAS_PADRAO, PERGUNTAS_PADRAO_GERENTES, cedulaComTodos, type Candidato } from './cedula';
import { CardDaVotacao } from './CardDaVotacao';
import { TelaVotacao } from './TelaVotacao';

const NOMES = [
  'Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Rocha', 'Eduarda Alves', 'Felipe Costa', 'Gabriela Dias',
  'Heitor Nunes', 'Isabela Ramos', 'João Pedro Silva', 'Karina Lopes', 'Lucas Martins', 'Mariana Freitas',
  'Nicolas Prado', 'Olívia Teixeira', 'Paulo Henrique', 'Rafaela Moura', 'Samuel Barros',
];
const SETORES = ['Play 1', 'Play 2', 'Play 3', 'Receptivo', 'Conecta Play', 'Jornada'];
const busca = new URLSearchParams(location.search);
const n = Math.max(3, Number(busca.get('n')) || NOMES.length);
const comFotos = busca.has('fotos');
const foto = (i: number) => {
  const tom = (i * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="hsl(${tom} 35% 78%)"/><circle cx="50" cy="40" r="18" fill="hsl(${tom} 25% 45%)"/><ellipse cx="50" cy="92" rx="32" ry="26" fill="hsl(${tom} 25% 45%)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};
const lideres: Candidato[] = Array.from({ length: n }, (_, i) => ({
  id: `f${i}`, nome: i < NOMES.length ? NOMES[i] : `${NOMES[i % NOMES.length].split(' ')[0]} ${i + 1}`,
  foto: comFotos ? foto(i) : null, setor: SETORES[i % SETORES.length], perfil: 'lider',
}));
const mapa = new Map(lideres.map(l => [l.id, l]));
const cedula = cedulaComTodos(PERGUNTAS_PADRAO, lideres);

if (!busca.has('claro')) document.documentElement.classList.add('dark');

// Gerentes: 1 ou 2 da lista, e 40 operadores fictícios votando (os votos sorteados da demonstração).
const nGerentes = busca.get('gerentes') === '2' ? 2 : 1;
const gerentes = lideres.slice(0, nGerentes).map(l => ({ ...l, perfil: 'gerencia', setor: 'Play 1' }));
const operadores = Array.from({ length: 40 }, (_, i) => `op${i}`);

function Lab() {
  const comCard = busca.has('card');
  const [votando, setVotando] = useState(!comCard);
  const [minimizado, setMinimizado] = useState(false);
  if (busca.has('gerentes')) {
    return <TelaVotacao tipo="gerentes" cedula={cedulaComTodos(PERGUNTAS_PADRAO_GERENTES, gerentes)} pessoas={new Map(gerentes.map(g => [g.id, g]))}
      eleitorId="op0" nomeEleitor="Olga Operadora" semente={2026} umPorCandidato eleitoresSimulados={operadores}
      onFechar={() => location.reload()} />;
  }
  if (votando) {
    return <TelaVotacao cedula={cedula} pessoas={mapa} eleitorId="f0" semente={2026}
      formato={busca.has('uma') ? 'uma_por_vez' : 'categorias'} onFechar={() => location.reload()} />;
  }
  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="text-xl font-bold">Uma tela qualquer do gestão</h1>
      <p className="mt-1 text-sm text-muted-foreground">O card da votação aparece no canto inferior esquerdo.</p>
      <CardDaVotacao demo tipo={busca.get('card') === 'resultado' ? 'resultado' : 'votar'} titulo="Votação de novembro"
        minimizado={minimizado} onAbrir={() => setVotando(true)} onMinimizar={() => setMinimizado(true)}
        onExpandir={() => setMinimizado(false)} onDispensar={() => location.reload()} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Lab /></StrictMode>);
