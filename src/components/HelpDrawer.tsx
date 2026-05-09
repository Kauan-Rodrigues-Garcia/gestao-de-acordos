/**
 * HelpDrawer.tsx — Central de Ajuda / FAQ embutido
 * Acessível via ícone "?" no header, ao lado do ThemeToggle.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle, X, ChevronDown, Search,
  FileText, Filter, Plus, CalendarClock, Zap,
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
    id: 'planilha',
    icon: FileText,
    title: 'Planilha de Acordos',
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    faqs: [
      {
        q: 'O que significam as cores das linhas?',
        a: 'Vermelho: vencimento já passou (atrasado). Amarelo/laranja: vence hoje e ainda não foi pago. Branco/neutro: acordo normal dentro do prazo. As cores ajudam a priorizar rapidamente os acordos mais urgentes.',
      },
      {
        q: 'O que significa "X/Y" ao lado da forma de pagamento?',
        a: 'Indica parcelas. Por exemplo, "2/5" = 2ª parcela de 5. Ao marcar como pago, o sistema oferece reagendar a próxima parcela automaticamente.',
      },
      {
        q: 'Como marcar um acordo como pago?',
        a: 'Clique no ícone ✓ verde na coluna de ações. O status muda imediatamente. Você tem 5 segundos para desfazer caso tenha clicado por engano.',
      },
      {
        q: 'Como editar ou ver detalhes de um acordo?',
        a: 'Clique em qualquer linha para expandir os detalhes. Use o ícone de lápis para editar campos, ou o ícone de olho para ver o histórico completo.',
      },
    ],
  },
  {
    id: 'novo-acordo',
    icon: Plus,
    title: 'Novo Acordo',
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    faqs: [
      {
        q: 'Como criar um novo acordo?',
        a: 'Clique no botão "+ Novo Acordo" no topo da planilha. O formulário abre diretamente na tabela — preencha NR, valor, vencimento e forma de pagamento. Clique em "Salvar Acordo" para confirmar.',
      },
      {
        q: 'O que é "Direto" e "Extra" no campo Vínculo?',
        a: '"Direto" = você é o responsável principal pelo NR do cliente. "Extra" = outro operador já possui o vínculo direto, mas você criou um acordo adicional autorizado. Clique no campo Vínculo para alternar entre os dois.',
      },
      {
        q: 'O sistema bloqueou meu novo acordo. O que aconteceu?',
        a: 'Quando o NR já pertence a outro operador, o sistema pede autorização da liderança antes de salvar. Aguarde a aprovação ou selecione o vínculo "Extra" se for um acordo adicional.',
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
        q: 'Como buscar um acordo específico?',
        a: 'Use a barra de busca no topo da planilha. Ela pesquisa simultaneamente por NR/Código, nome do cliente e WhatsApp. Basta digitar qualquer parte do valor.',
      },
      {
        q: 'Como filtrar por status ou tipo de pagamento?',
        a: 'Use os seletores ao lado da busca: escolha o status desejado (Verificar, Pago, Não Pago) e/ou o tipo de pagamento. Os filtros são cumulativos — você pode combinar vários ao mesmo tempo.',
      },
      {
        q: 'Como navegar entre meses?',
        a: 'Use as setas "‹ ›" ao lado do nome do mês no topo da página para avançar ou voltar. A planilha exibe apenas os acordos com vencimento no mês selecionado.',
      },
      {
        q: 'Como limpar todos os filtros de uma vez?',
        a: 'Clique no botão "Limpar" que aparece na barra de filtros quando algum filtro está ativo. Ele remove todos os filtros de texto, status e tipo simultaneamente.',
      },
    ],
  },
  {
    id: 'reagendamento',
    icon: CalendarClock,
    title: 'Reagendamento',
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    faqs: [
      {
        q: 'Como reagendar um acordo para outra data?',
        a: 'Abra os detalhes do acordo (clique na linha) e use o campo "Vencimento" para selecionar uma nova data. Salve a alteração. O acordo será movido para o mês correspondente.',
      },
      {
        q: 'O que acontece ao marcar como pago um acordo parcelado?',
        a: 'O sistema pergunta se deseja criar a próxima parcela automaticamente. Confirme para gerar a próxima parcela com a data calculada, ou cancele para não reagendar.',
      },
    ],
  },
  {
    id: 'dicas',
    icon: Zap,
    title: 'Dicas Rápidas',
    color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20',
    faqs: [
      {
        q: 'A planilha atualiza sozinha ou preciso recarregar?',
        a: 'Atualiza sozinha. Quando outro usuário cria ou altera um acordo, sua tela reflete a mudança em tempo real sem precisar recarregar a página.',
      },
      {
        q: 'Excluí um acordo por engano. É possível recuperar?',
        a: 'Sim. Acesse "Lixeira" no menu lateral — acordos excluídos ficam disponíveis por 3 dias para restauração.',
      },
      {
        q: 'Como mudar o tema do sistema?',
        a: 'Clique no ícone de lua/sol no header (ao lado do "?"). Escolha entre Claro, Escuro ou Sistema (segue seu dispositivo).',
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
