/**
 * HelpDrawer.tsx — Central de Ajuda / FAQ embutido
 * Acessível via ícone "?" no header, ao lado do ThemeToggle.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle, X, ChevronDown, Search,
  LayoutDashboard, FileText, Filter, Settings, Bell, Users, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FAQ {
  q: string;
  a: string;
}

interface Section {
  id: string;
  icon: React.ElementType;
  title: string;
  color: string;
  faqs: FAQ[];
}

const SECTIONS: Section[] = [
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    title: 'Dashboard',
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    faqs: [
      {
        q: 'O que são os cards de métricas no topo?',
        a: 'Os cards exibem um resumo do dia atual: total de acordos com vencimento hoje, quantos foram pagos, quantos estão pendentes de verificação e quantos estão vencidos (data passada sem resolução). Os valores monetários mostram o previsto vs. o já recebido.',
      },
      {
        q: 'Por que alguns acordos aparecem com borda vermelha/laranja?',
        a: 'Vermelho indica que o vencimento já passou (acordo atrasado). Laranja/amarelo indica que o vencimento é hoje e o acordo ainda não foi pago. Essas cores ajudam a priorizar os acordos mais urgentes.',
      },
      {
        q: 'O que significa a tag "X/Y" ao lado da forma de pagamento?',
        a: 'Indica que o acordo é parcelado. O número antes da barra é a parcela atual e o número depois é o total de parcelas — por exemplo, "2/5" significa que é a 2ª parcela de um total de 5.',
      },
      {
        q: 'Como marcar um acordo como pago?',
        a: 'Clique no ícone ✓ (CheckCircle) verde na coluna de ações. O sistema atualiza o status imediatamente. Para acordos parcelados, você terá a opção de reagendar a próxima parcela automaticamente. Você tem 5 segundos para "Desfazer" a ação caso ocorra um erro.',
      },
      {
        q: 'O filtro de busca procura em quais campos?',
        a: 'A busca pesquisa simultaneamente em: Código (número do profissional), Nome do cliente e CPF. Basta digitar qualquer parte de um desses valores para filtrar os resultados.',
      },
      {
        q: 'O realtime parou de funcionar, o que fazer?',
        a: 'O sistema reconecta automaticamente com backoff progressivo (2s, 4s, 8s…). Ao voltar para a aba após inatividade, a reconexão é imediata. Se o indicador de status continuar em vermelho por mais de 30 segundos, recarregue a página.',
      },
    ],
  },
  {
    id: 'acordos',
    icon: FileText,
    title: 'Acordos',
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    faqs: [
      {
        q: 'Qual a diferença entre "Verificar", "Pago" e "Não Pago"?',
        a: '"Verificar Pendente" é o status padrão de um acordo recém-criado, aguardando confirmação do pagamento. "Pago" indica que o pagamento foi confirmado. "Não Pago" indica que o pagamento não foi realizado e o acordo está encerrado para fins de controle.',
      },
      {
        q: 'O que é um acordo "Direto" vs "Extra"?',
        a: '"Direto" significa que o operador é o responsável principal pelo NR/Código do cliente. "Extra" indica que outro operador já possui o vínculo direto com esse cliente, mas este acordo extra foi permitido pela liderança. Acordos extras são identificados por uma tag especial.',
      },
      {
        q: 'Posso editar um acordo após criá-lo?',
        a: 'Sim. Clique no ícone de lápis (Edit) na linha do acordo para abrir o formulário de edição inline, ou use o ícone de olho (Eye) para ver detalhes e editar campos específicos. Alterações na chave principal (Código/NR) passam por validação de duplicidade.',
      },
      {
        q: 'Como funciona a importação via Excel?',
        a: 'Acesse "Importar Excel" no menu lateral. Selecione o arquivo .xlsx com as colunas no formato esperado. O sistema detecta automaticamente os campos e classifica os acordos como Direto ou Extra antes de importar. Revise os erros apontados antes de confirmar.',
      },
    ],
  },
  {
    id: 'filtros',
    icon: Filter,
    title: 'Filtros e Busca',
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    faqs: [
      {
        q: 'Como usar múltiplos filtros simultaneamente?',
        a: 'Todos os filtros são cumulativos. Você pode combinar busca por texto, filtro de status, tipo de pagamento e data ao mesmo tempo. Os filtros ativos aparecem como chips coloridos abaixo dos controles — clique no "×" de qualquer chip para removê-lo individualmente.',
      },
      {
        q: 'O filtro de data exibe acordos de um dia específico ou de um período?',
        a: 'Você pode filtrar por dia específico usando o campo de data, ou por período usando as opções "Data início" e "Data fim". Quando ambas são preenchidas, o sistema exibe todos os acordos com vencimento dentro do intervalo.',
      },
      {
        q: 'Por que os filtros somem ao recarregar a página?',
        a: 'Os filtros são sincronizados com a URL da página (parâmetros de query). Isso significa que você pode compartilhar a URL com os filtros ativos. Se os filtros sumiram, verifique se a URL foi preservada ou use o botão "Limpar" e reaplique-os.',
      },
    ],
  },
  {
    id: 'notificacoes',
    icon: Bell,
    title: 'Notificações',
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    faqs: [
      {
        q: 'O que gera notificações no sistema?',
        a: 'Notificações são geradas em: transferências de NR/Código entre operadores, promoção de acordo extra para direto, aprovações de liderança para acordos conflitantes e outras ações administrativas que afetam seus acordos.',
      },
      {
        q: 'Como visualizar as notificações?',
        a: 'Clique no ícone de sino (🔔) no header para ver o badge com a contagem, ou no botão flutuante no canto inferior direito da tela para abrir o painel completo de notificações. Clique em cada notificação para ver os detalhes.',
      },
      {
        q: 'As notificações chegam em tempo real?',
        a: 'Sim. O sistema usa Supabase Realtime para entregar notificações instantaneamente via WebSocket. Quando uma nova notificação chega, o badge pulsa e (em dispositivos móveis) o aparelho vibra levemente.',
      },
    ],
  },
  {
    id: 'usuarios',
    icon: Users,
    title: 'Usuários e Permissões',
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    faqs: [
      {
        q: 'Quais são os níveis de acesso disponíveis?',
        a: 'Operador: acesso apenas aos próprios acordos. Líder: visão da equipe/setor, aprovações. Elite/Gerência: visão ampla, sem configurações admin. Administrador: acesso total, incluindo configurações, usuários e lixeira. Diretoria: acesso ao painel executivo.',
      },
      {
        q: 'Como alterar a foto de perfil?',
        a: 'Clique no avatar no canto superior direito do header para abrir o popover de perfil. Depois clique em "Adicionar foto" ou "Alterar foto" e selecione uma imagem JPG/PNG de até 3 MB. A foto é atualizada em tempo real para todos os dispositivos conectados.',
      },
      {
        q: 'O que é o campo "Setor" no perfil?',
        a: 'O setor define a área de atuação do operador dentro da empresa. Líderes de setor veem os acordos de todos os operadores do seu setor. O setor também é usado para agrupamento nos relatórios analíticos.',
      },
    ],
  },
  {
    id: 'sistema',
    icon: Zap,
    title: 'Sistema e Desempenho',
    color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20',
    faqs: [
      {
        q: 'Como mudar o tema do sistema?',
        a: 'Clique no ícone de lua/sol ao lado do "?" no header. Você pode escolher entre: Claro, Escuro (padrão), Cinza Escuro, Azul Profundo e Sistema (segue as preferências do seu dispositivo). A preferência é salva automaticamente.',
      },
      {
        q: 'Os dados são atualizados automaticamente?',
        a: 'Sim. O sistema usa Realtime via WebSocket para atualizações instantâneas sem precisar recarregar. Quando você está com a aba em segundo plano por mais de 60 segundos e volta, uma atualização silenciosa é feita em segundo plano, sem exibir spinner.',
      },
      {
        q: 'O que é a Lixeira de Acordos?',
        a: 'Acordos excluídos manualmente ou transferidos ficam retidos na lixeira por 3 dias antes da exclusão permanente. Isso garante rastreabilidade e permite investigar inconsistências. Apenas usuários com permissão "ver_lixeira" têm acesso.',
      },
      {
        q: 'Estou com problemas de acesso. Com quem falar?',
        a: 'Entre em contato com o administrador do sistema da sua empresa. Eles podem redefinir sua senha, ajustar permissões e resolver problemas de acesso. Não compartilhe suas credenciais com outros usuários.',
      },
    ],
  },
];

function FAQItem({ faq }: { faq: FAQ }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
      >
        <span className="text-sm font-medium text-foreground leading-snug">{faq.q}</span>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border/30 pt-3">
              {faq.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function HelpDrawer() {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const [secaoAtiva, setSecaoAtiva] = useState<string | null>(null);

  const buscaLower = busca.toLowerCase().trim();

  const secoesFiltradas = SECTIONS
    .map(s => ({
      ...s,
      faqs: buscaLower
        ? s.faqs.filter(f => f.q.toLowerCase().includes(buscaLower) || f.a.toLowerCase().includes(buscaLower))
        : s.faqs,
    }))
    .filter(s => s.faqs.length > 0);

  const totalFaqs = SECTIONS.reduce((n, s) => n + s.faqs.length, 0);

  return (
    <>
      {/* Trigger */}
      <Button
        variant="ghost"
        size="icon"
        className="w-8 h-8 text-muted-foreground hover:text-foreground relative"
        onClick={() => setOpen(true)}
        title="Central de Ajuda"
        aria-label="Abrir central de ajuda"
      >
        <HelpCircle className="w-4 h-4" />
      </Button>

      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-[480px] bg-background border-l border-border shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <HelpCircle className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">Central de Ajuda</h2>
                  <p className="text-[11px] text-muted-foreground">{totalFaqs} perguntas frequentes</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setOpen(false)} aria-label="Fechar ajuda">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Busca */}
            <div className="px-5 py-3 border-b border-border/60 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Pesquisar na ajuda..."
                  value={busca}
                  onChange={e => { setBusca(e.target.value); setSecaoAtiva(null); }}
                  className="pl-9 h-9 text-sm"
                />
                {busca && (
                  <button
                    onClick={() => setBusca('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Limpar busca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Navegação por seção (quando sem busca) */}
            {!busca && (
              <div className="px-5 py-3 flex gap-2 overflow-x-auto flex-shrink-0 border-b border-border/40">
                {SECTIONS.map(s => {
                  const Icon = s.icon;
                  const ativo = secaoAtiva === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSecaoAtiva(ativo ? null : s.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border whitespace-nowrap transition-colors',
                        ativo
                          ? s.color + ' border-current/30'
                          : 'text-muted-foreground border-border/50 hover:border-border hover:text-foreground'
                      )}
                    >
                      <Icon className="w-3 h-3" />
                      {s.title}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {secoesFiltradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Search className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Nenhuma resposta encontrada</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Tente termos diferentes ou navegue pelas seções</p>
                </div>
              ) : (
                secoesFiltradas
                  .filter(s => !secaoAtiva || s.id === secaoAtiva)
                  .map(s => {
                    const Icon = s.icon;
                    return (
                      <div key={s.id}>
                        <div className={cn('flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg border', s.color)}>
                          <Icon className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold uppercase tracking-wider">{s.title}</span>
                          <span className="ml-auto text-[10px] opacity-70">{s.faqs.length} perguntas</span>
                        </div>
                        <div className="space-y-2">
                          {s.faqs.map((faq, i) => <FAQItem key={i} faq={faq} />)}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border/60 flex-shrink-0 bg-muted/20">
              <p className="text-[11px] text-muted-foreground text-center">
                Não encontrou o que procurava? Fale com o administrador do sistema.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
