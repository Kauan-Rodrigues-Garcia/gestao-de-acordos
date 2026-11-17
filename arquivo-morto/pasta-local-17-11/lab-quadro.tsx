// Ensaio TEMPORÁRIO do Quadro de Pessoal com dados fictícios (sem banco). Apagar depois.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { montarQuadro, conferirPlanilha, linhasDaPlanilha, type DadosBrutos, type PessoaBruta } from '@/services/rh/quadroPessoal';
import AbaSetores from '@/pages/RhQuadro/AbaSetores';
import AbaEquipes from '@/pages/RhQuadro/AbaEquipes';
import AbaConferencia from '@/pages/RhQuadro/AbaConferencia';
import PainelSetor from '@/pages/RhQuadro/PainelSetor';
import { rotuloCargo } from '@/pages/RhQuadro/formato';

const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karen', 'Lucas', 'Mariana', 'Nicolas', 'Olívia', 'Paulo', 'Quésia', 'Rafael', 'Sabrina', 'Tiago', 'Úrsula', 'Vitor', 'Wesley', 'Yasmin'];
const SOBRE = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento'];

function gerar(): DadosBrutos {
  const setores = [
    { id: 's1', nome: 'Receptivo', ativo: true, cidade_id: 'c1', regra: 'nosso_produto', descricao: 'Atendimento de entrada', empresa_nome: 'BookPlay' },
    { id: 's2', nome: 'Play 3', ativo: true, cidade_id: 'c1', regra: 'nosso_produto' },
    { id: 's3', nome: 'Ativo Birigui', ativo: true, cidade_id: 'c1', regra: 'nosso_produto' },
    { id: 's4', nome: 'Conecta Play', ativo: true, cidade_id: 'c2', regra: 'cofen', empresa_nome: 'PaguePlay' },
    { id: 's5', nome: 'PaguePlay Marília', ativo: true, cidade_id: 'c2', regra: 'nosso_produto' },
    { id: 's6', nome: 'Núcleo de Inteligência e Gestão', ativo: true, tipo: 'nucleo' },
  ];
  const tamanhos: Record<string, number> = { s1: 5, s2: 3, s3: 2, s4: 4, s5: 2, s6: 0 };
  const equipes: DadosBrutos['equipes'] = [];
  const pessoas: PessoaBruta[] = [];
  const lideres: DadosBrutos['lideres'] = [];
  const subgrupos: DadosBrutos['subgrupos'] = [];
  let k = 0;
  const nome = () => { const n = `${NOMES[k % NOMES.length]} ${SOBRE[(k * 7) % SOBRE.length]}${k >= NOMES.length ? ' ' + SOBRE[(k * 3) % SOBRE.length] : ''}`; k += 1; return n; };
  for (const s of setores) {
    for (let e = 0; e < tamanhos[s.id]; e++) {
      const eid = `${s.id}e${e}`;
      const lid = `${eid}l`;
      const ln = nome();
      equipes.push({ id: eid, nome: `Equipe ${ln.split(' ')[0]}`, setor_id: s.id, treinamento: s.id === 's1' && e === 4 });
      pessoas.push({ id: lid, nome: ln, email: `${lid}@x.com`, perfil: 'lider', setor_id: s.id, equipe_id: null, situacao: 'ativo', criado_em: '2025-03-01' });
      lideres.push({ equipe_id: eid, lider_id: lid });
      if (s.id === 's1' && e === 0) { subgrupos.push({ id: 'sg1', equipe_id: eid, nome: 'Manhã' }, { id: 'sg2', equipe_id: eid, nome: 'Tarde' }); }
      const qtd = 4 + ((e * 5 + s.id.charCodeAt(1)) % 9);
      for (let i = 0; i < qtd; i++) {
        const id = `${eid}p${i}`;
        pessoas.push({
          id, nome: nome(), email: `${id}@x.com`, perfil: i === 0 && e % 2 ? 'elite' : 'operador',
          setor_id: s.id, equipe_id: eid, subgrupo_id: s.id === 's1' && e === 0 ? (i % 2 ? 'sg1' : 'sg2') : null,
          situacao: i === 3 ? 'ferias' : 'ativo', ferias_ate: i === 3 ? '2026-10-31' : null,
          criado_em: i === 2 && e === 1 ? '2026-10-10' : '2025-05-01',
        });
      }
    }
    if (s.id !== 's6') pessoas.push({ id: `${s.id}g`, nome: nome(), perfil: 'gerencia', setor_id: s.id, equipe_id: null, situacao: 'ativo', criado_em: '2024-01-01' });
  }
  pessoas.push({ id: 'n1', nome: nome(), perfil: 'assistente_adm', setor_id: 's6', equipe_id: null, situacao: 'ativo', criado_em: '2026-09-01' });
  pessoas.push({ id: 'x1', nome: nome(), perfil: 'operador', setor_id: 's1', equipe_id: null, situacao: 'ativo', criado_em: '2026-10-18' });
  pessoas.push({ id: 'x2', nome: nome(), perfil: 'operador', setor_id: null, equipe_id: null, situacao: 'ativo', criado_em: '2026-02-01' });
  return {
    setores, cidades: [{ id: 'c1', nome: 'Birigui' }, { id: 'c2', nome: 'Marília' }],
    equipes, pessoas, lideres, subgrupos, clones: [{ equipe_id: 's1e1', operador_id: 's2e0p1' }],
    ordemSetores: ['s1', 's2', 's3', 's4', 's5', 's6'],
  };
}

const quadro = montarQuadro(gerar());
const params = new URLSearchParams(location.search);
if (params.get('tema') === 'escuro') document.documentElement.classList.add('dark');

function Lab() {
  const parte = params.get('parte') ?? 'setores';
  const [gaveta, setGaveta] = useState<string | null>(params.get('gaveta'));
  const [setor, setSetor] = useState<string | null>(params.get('setor') ?? 's1');
  const planilha = linhasDaPlanilha(quadro, rotuloCargo).Pessoas.slice(0, 60).map((l, i) =>
    i === 4 ? { ...l, Equipe: 'Equipe Errada' } : i === 9 ? { ...l, Setor: 'Play 3' } : l);
  planilha.push({ Nome: 'Fulano Que Saiu', Setor: 'Receptivo', Equipe: 'Equipe Ana' } as never);
  const conf = { arquivo: 'quadro_setembro.xlsx', aba: 'Pessoas', conferencia: conferirPlanilha(quadro, planilha, rotuloCargo) };
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 bg-background p-4 text-foreground md:p-6">
      {parte === 'setores' && (quadro.setores.find(s => s.id === gaveta)
        ? <PainelSetor quadro={quadro} setor={quadro.setores.find(s => s.id === gaveta)!} onVoltar={() => setGaveta(null)} onVerOrganograma={() => {}} onExportar={() => {}} />
        : <AbaSetores quadro={quadro} semSetor={null} onAbrir={setGaveta} />)}
      {parte === 'equipes' && <AbaEquipes quadro={quadro} setores={quadro.setores} setorId={setor} onSetor={setSetor} destaque={params.get('destaque')} />}
      {parte === 'conferencia' && <AbaConferencia carregada={params.get('vazia') ? null : conf} lendo={false} onArquivo={() => {}} onEscolher={() => {}} onLimpar={() => {}} onExportar={() => {}} onBaixarModelo={() => {}} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Lab /></StrictMode>);
