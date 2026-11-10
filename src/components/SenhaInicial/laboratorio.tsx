// Laboratório do card «Uma senha só sua»: só a tela, sem banco.
// Só no `npm run dev`: /lab-senha-inicial.html
//   ?escuro  tema escuro      ?nome=Maria%20Silva  outro nome
// «Criar minha senha» aqui não grava nada: sem sessão, o Supabase recusa.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import '@/index.css';
import { CardSenhaInicial } from './CardSenhaInicial';

const busca = new URLSearchParams(location.search);
if (busca.has('escuro')) document.documentElement.classList.add('dark');
const nome = busca.get('nome') ?? 'Mariana Freitas';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="min-h-screen bg-background p-8 text-sm text-muted-foreground">
      O sistema fica aqui atrás, coberto pelo card.
    </div>
    <CardSenhaInicial
      nome={nome}
      usuario={nome.toLowerCase().replace(/\s+/g, '_')}
      onTrocada={() => alert('Trocou!')}
      onSair={() => alert('Sair')}
    />
    <Toaster richColors position="top-center" />
  </StrictMode>,
);
