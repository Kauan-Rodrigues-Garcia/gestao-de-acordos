/**
 * laboratorio.tsx — a aba Ouvidoria com dados de exemplo, SÓ no localhost
 * (http://localhost:8080/lab-ouvidoria.html), sem login nem banco. Os nomes
 * são fictícios. `?escuro=1` abre no tema escuro; `?atende=1` abre como quem
 * só atende (sem o card de acessos). Gravar não funciona aqui.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import '@/index.css';
import { getTodayISO } from '@/lib/index';
import { Painel } from './index';
import type { Andamento, Manifestacao, PessoaOuvidoria, SetorOuvidoria } from './ouvidoria';

const URL_INICIAL = new URLSearchParams(window.location.search);
if (URL_INICIAL.get('escuro') === '1') document.documentElement.classList.add('dark');

const SETOR: SetorOuvidoria = {
  setor_id: 'lab-setor', setor_nome: 'Conecta Play', empresa_id: 'lab', pode_gerir: URL_INICIAL.get('atende') !== '1',
};

const hoje = getTodayISO();
const diasAtras = (n: number) => {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const PESSOAS: PessoaOuvidoria[] = [
  { perfil_id: 'p-lia', nome: 'Lia Exemplo', cargo: 'lider', foto_url: null, tem_acesso: true, origem: 'cargo' },
  { perfil_id: 'p-ana', nome: 'Ana Exemplo', cargo: 'operador', foto_url: null, tem_acesso: true, origem: 'liberado' },
  { perfil_id: 'p-bruno', nome: 'Bruno Exemplo', cargo: 'operador', foto_url: null, tem_acesso: true, origem: 'liberado' },
  { perfil_id: 'p-carla', nome: 'Carla Exemplo', cargo: 'operador', foto_url: null, tem_acesso: false, origem: 'sem' },
  { perfil_id: 'p-diego', nome: 'Diego Exemplo', cargo: 'operador', foto_url: null, tem_acesso: false, origem: 'bloqueado' },
  { perfil_id: 'p-elisa', nome: 'Elisa Exemplo', cargo: 'operador', foto_url: null, tem_acesso: false, origem: 'sem' },
];

let numero = 0;
function mf(over: Partial<Manifestacao>): Manifestacao {
  numero += 1;
  const data = over.data_manifestacao ?? diasAtras(numero);
  return {
    id: `m-${numero}`, empresa_id: 'lab', setor_id: SETOR.setor_id, numero, codigo: `OUV-${String(numero).padStart(5, '0')}`,
    data_manifestacao: data, canal: 'telefone', nome_profissional: 'Profissional Exemplo', codigo_cliente: null, conselho_uf: 'SP',
    assunto: 'reclamacao_generica', descricao: 'Relato de exemplo.', anuidades: [], situacao_financeira: null,
    providencia: null, responsavel_id: null, responsavel_nome: null, data_resposta: null, status: 'aberto',
    acompanhar: true, observacoes: null, criado_por: 'p-lia', criado_por_nome: 'Lia Exemplo',
    criado_em: `${data}T13:00:00Z`, atualizado_por_nome: null, atualizado_em: `${data}T13:00:00Z`, ...over,
  };
}

const LISTA: Manifestacao[] = [
  mf({ data_manifestacao: diasAtras(8), nome_profissional: 'Mariana Exemplo', codigo_cliente: '4521873', assunto: 'cobranca_indevida',
       descricao: 'Diz que a anuidade de 2024 já foi paga e continua recebendo cobrança.', anuidades: [2024],
       situacao_financeira: 'quitada', responsavel_id: 'p-ana', responsavel_nome: 'Ana Exemplo', status: 'pendente_documentos',
       providencia: 'Pedido o comprovante de pagamento por e-mail.' }),
  mf({ data_manifestacao: diasAtras(6), canal: 'whatsapp', nome_profissional: 'Roberto Exemplo', assunto: 'operador',
       conselho_uf: 'MG', descricao: 'Reclama da forma como foi abordado na ligação de cobrança.',
       responsavel_id: 'p-lia', responsavel_nome: 'Lia Exemplo', status: 'em_andamento' }),
  mf({ data_manifestacao: diasAtras(3), canal: 'ouvidoria', nome_profissional: 'Patrícia Exemplo', assunto: 'chatplay',
       descricao: 'Mensagens repetidas no ChatPlay depois do acordo fechado.', anuidades: [2023, 2024], situacao_financeira: 'parcelada',
       responsavel_id: 'p-bruno', responsavel_nome: 'Bruno Exemplo', data_resposta: diasAtras(2), status: 'encaminhado_coren' }),
  mf({ data_manifestacao: diasAtras(1), canal: 'email', nome_profissional: 'Fernando Exemplo', assunto: 'cobranca_indevida',
       conselho_uf: 'RJ', descricao: 'Cobrança de anuidade de período em que estava com inscrição cancelada.', anuidades: [2022],
       situacao_financeira: 'em_aberto' }),
  mf({ data_manifestacao: diasAtras(0), nome_profissional: 'Juliana Exemplo', assunto: 'outros',
       descricao: 'Quer confirmar se o acordo foi registrado.', responsavel_id: 'p-ana', responsavel_nome: 'Ana Exemplo' }),
  mf({ data_manifestacao: diasAtras(10), nome_profissional: 'Sérgio Exemplo', assunto: 'operador', status: 'concluido',
       descricao: 'Pediu para não ser mais contatado no horário de trabalho.', data_resposta: diasAtras(9),
       responsavel_id: 'p-lia', responsavel_nome: 'Lia Exemplo', providencia: 'Ajustado o horário de contato no cadastro.' }),
  mf({ data_manifestacao: diasAtras(12), canal: 'telefone', nome_profissional: 'Helena Exemplo', assunto: 'reclamacao_generica',
       acompanhar: false, status: 'concluido', descricao: 'Ligou só para registrar a insatisfação com o valor da anuidade.' }),
  mf({ data_manifestacao: diasAtras(15), canal: 'whatsapp', nome_profissional: 'Paulo Exemplo', assunto: 'chatplay',
       acompanhar: false, status: 'concluido', descricao: 'Elogiou o atendimento, mas pediu menos mensagens.' }),
];

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
qc.setQueryData(['ouvidoria-lista', SETOR.setor_id], LISTA);
qc.setQueryData(['ouvidoria-pessoas', SETOR.setor_id], PESSOAS);
for (const m of LISTA) {
  const linha: Andamento[] = [
    { id: `${m.id}-a`, manifestacao_id: m.id, tipo: 'criada', texto: m.acompanhar ? 'Registrada com acompanhamento' : 'Registrada para histórico',
      status_de: null, status_para: 'aberto', autor_nome: 'Lia Exemplo', criado_em: m.criado_em },
  ];
  if (m.status !== 'aberto' && m.acompanhar) {
    linha.push({ id: `${m.id}-b`, manifestacao_id: m.id, tipo: 'status', texto: null, status_de: 'aberto', status_para: m.status,
                 autor_nome: m.responsavel_nome, criado_em: m.criado_em.replace('13:00', '15:20') });
  }
  if (m.providencia) {
    linha.push({ id: `${m.id}-c`, manifestacao_id: m.id, tipo: 'nota', texto: m.providencia, status_de: null, status_para: null,
                 autor_nome: m.responsavel_nome, criado_em: m.criado_em.replace('13:00', '16:05') });
  }
  qc.setQueryData(['ouvidoria-andamentos', m.id, m.atualizado_em], linha);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <div className="min-h-screen bg-background text-foreground p-3 sm:p-5">
        <div className="max-w-[1280px] mx-auto space-y-4">
          <div className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-1.5 text-xs">
            Laboratório da Ouvidoria — dados de exemplo, nada é gravado.
          </div>
          <Painel setor={SETOR} meuId="p-ana" />
        </div>
      </div>
      <Toaster richColors />
    </QueryClientProvider>
  </StrictMode>,
);
