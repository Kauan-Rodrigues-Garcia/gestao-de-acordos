// Laboratório das artes para todos (17/11/2026): dados FICTÍCIOS, sem banco.
// Só no `npm run dev`: /lab-artes.html
//   (nada)          a arte «Deu a louca na gerente» abrindo por cima de uma tela
//   ?modelo=<id>    outro modelo (parabens, recado, imagem)
//   ?tema=<id>      outras cores (amarelo, ouro, fogo, oceano, claro)
//   ?config         a configuração (montar, lançar, painel); «Lançar» não grava
//   ?galeria        todos os modelos lado a lado
//   ?claro          tema claro do app
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { Toaster } from '@/components/ui/sonner';
import type { GrupoDaVotacao, Participante } from '@/components/VotacaoLideres/participantes';
import { ArteEscalada } from './ArteCard';
import { MontarArte } from './MontarArte';
import { PainelArtes } from './PainelArtes';
import { TelaArte } from './TelaArte';
import type { ArteNaLista } from './banco';
import { MODELOS, TEMAS, ehTema, modeloPorId, type TemaDaArte } from './modelos';

const busca = new URLSearchParams(location.search);
if (!busca.has('claro')) document.documentElement.classList.add('dark');

const def = modeloPorId(busca.get('modelo') ?? '') ?? MODELOS[0];
const temaUrl = busca.get('tema') ?? '';
const tema: TemaDaArte = ehTema(temaUrl) ? temaUrl : def.temaPadrao;

const SETORES = [
  { id: 's1', nome: 'Manutenção' }, { id: 's2', nome: 'Play 1' }, { id: 's3', nome: 'Play 2' }, { id: 's4', nome: 'Play 3' },
  { id: 's5', nome: 'Receptivo' }, { id: 's6', nome: 'Playmix' }, { id: 's7', nome: 'Conecta Play' },
];
const GRUPOS: GrupoDaVotacao[] = [
  { chave: 'marca:bookplay', rotulo: 'BookPlay', produto: 'cobranca', setores: SETORES.slice(0, 6).map(s => ({ ...s, grupo: 'marca:bookplay', produto: 'cobranca' })) },
  { chave: 'marca:pagueplay', rotulo: 'PaguePlay', produto: 'cobranca', setores: SETORES.slice(6).map(s => ({ ...s, grupo: 'marca:pagueplay', produto: 'cobranca' })) },
];
const PESSOAS = Array.from({ length: 140 }, (_, i) => ({
  id: `p${i}`, nome: `Pessoa ${i}`, setorId: SETORES[i % SETORES.length].id, perfil: 'operador',
})) as unknown as Participante[];

const agora = Date.now();
const LISTA: ArteNaLista[] = [
  { id: 'a1', titulo: def.tituloDe(def.padrao), modelo: def.id, conteudo: def.padrao, tema, inicio: new Date(agora - 3_600_000).toISOString(),
    setores: null, setores_nomes: [], fim: new Date(agora + 8 * 3_600_000).toISOString(), criada_em: new Date(agora - 3_600_000).toISOString(),
    encerrada_em: null, publico: 212, viram: 147 },
  { id: 'a2', titulo: 'Batemos a meta do dia', modelo: 'parabens', conteudo: MODELOS[1].padrao, tema: 'ouro', inicio: new Date(agora - 86_400_000).toISOString(),
    setores: ['s2', 's3'], setores_nomes: ['Play 1', 'Play 2'], fim: new Date(agora - 60_000_000).toISOString(), criada_em: new Date(agora - 86_400_000).toISOString(),
    encerrada_em: null, publico: 64, viram: 61 },
];

function Lab() {
  const [aberta, setAberta] = useState(true);
  if (busca.has('galeria')) {
    return (
      <div className="flex flex-wrap gap-6 bg-background p-6">
        {MODELOS.map(m => (
          <div key={m.id} className="space-y-2">
            <p className="text-sm text-muted-foreground">{m.nome}</p>
            <ArteEscalada modelo={m.id} conteudo={m.id === 'imagem' ? { imagem: '', legenda: 'Legenda da imagem' } : m.padrao} tema={m.temaPadrao} largura={300} />
          </div>
        ))}
        {(Object.keys(TEMAS) as TemaDaArte[]).map(t => (
          <div key={t} className="space-y-2">
            <p className="text-sm text-muted-foreground">Deu a louca · {TEMAS[t].nome}</p>
            <ArteEscalada modelo="deu-a-louca" conteudo={MODELOS[0].padrao} tema={t} largura={300} />
          </div>
        ))}
      </div>
    );
  }
  if (busca.has('config')) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 bg-background p-6">
        <PainelArtes versao={0} fonte={{ listar: async () => LISTA, encerrar: async () => undefined }} />
        <MontarArte dados={{ pessoas: PESSOAS, grupos: GRUPOS }} onLancar={async d => { console.info('lançar (lab, não grava)', d); }}
          enviar={async f => URL.createObjectURL(f)} />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Uma tela qualquer do Gestão por trás da arte.</p>
      <button type="button" className="mt-4 rounded border px-3 py-1" onClick={() => setAberta(true)}>Abrir de novo</button>
      {aberta && <TelaArte arte={{ modelo: def.id, conteudo: def.padrao, tema }} titulo={def.tituloDe(def.padrao)} onFechar={() => setAberta(false)} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Lab /><Toaster /></StrictMode>);
