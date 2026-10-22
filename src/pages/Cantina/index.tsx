/**
 * Cantina — a aba onde o colaborador pede (22/10/2026).
 *
 * Substitui a janela «Pedidos Cantina» do sistema da empresa. Spec:
 * docs/superpowers/specs/2026-10-22-cantina-fases-1-e-2-design.md
 *
 * O link das notificações (`/cantina?pedido=<id>`) abre o pedido direto.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Loader2, Search, ShoppingBasket, Store, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  CATEGORIAS, formatarPreco, janelaDoItem, quantidadeDoItem,
  type CategoriaCantina, type ItemCantina,
} from '@/lib/cantina';
import { useCantina } from './useCantina';
import { CardItem } from './CardItem';
import { ConteudoCarrinho } from './Carrinho';
import { DetalhePedido, Historico, PedidosDeHoje } from './MeusPedidos';
import { IconeDaCategoria } from './visual';

function saudacao(minutos: number): string {
  if (minutos < 12 * 60) return 'Bom dia';
  if (minutos < 18 * 60) return 'Boa tarde';
  return 'Boa noite';
}

function normalizar(v: string): string {
  return v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export default function PaginaCantina() {
  const c = useCantina();
  const { despachar, confirmar: confirmarPedido } = c;
  const { perfil } = useAuth();
  const [params, setParams] = useSearchParams();
  const [categoria, setCategoria] = useState<CategoriaCantina | 'tudo'>('tudo');
  const [busca, setBusca] = useState('');
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);

  const pedidoAberto = params.get('pedido');
  const abrirPedido = useCallback((id: string) => {
    setParams(p => { const n = new URLSearchParams(p); n.set('pedido', id); return n; }, { replace: true });
  }, [setParams]);
  const fecharPedido = useCallback(() => {
    setParams(p => { const n = new URLSearchParams(p); n.delete('pedido'); return n; }, { replace: true });
  }, [setParams]);

  const somar = useCallback((item: ItemCantina, opcao: string | null, delta: number) => {
    despachar({ tipo: 'somar', item, opcao, delta });
  }, [despachar]);

  const itens = useMemo(() => c.cardapio?.itens ?? [], [c.cardapio]);
  const categoriasComItem = useMemo(
    () => CATEGORIAS.filter(cat => itens.some(i => i.categoria === cat.id)),
    [itens],
  );
  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim());
    return itens.filter(i =>
      (categoria === 'tudo' || i.categoria === categoria)
      && (!termo || normalizar(`${i.codigo} ${i.nome} ${i.descricao ?? ''} ${i.ingredientes.join(' ')}`).includes(termo)));
  }, [itens, categoria, busca]);

  // Disponíveis agora primeiro; o resto (com cadeado) depois, na ordem do cardápio.
  const ordenados = useMemo(() => {
    const min = c.relogio.minutos;
    return [...filtrados].sort((a, b) =>
      Number(janelaDoItem(a, min).estado !== 'aberta') - Number(janelaDoItem(b, min).estado !== 'aberta'));
  }, [filtrados, c.relogio.minutos]);

  const historico = useMemo(() => c.pedidos.filter(p => p.dia !== c.relogio.dia), [c.pedidos, c.relogio.dia]);
  const pedidoSelecionado = c.pedidos.find(p => p.id === pedidoAberto) ?? null;

  const confirmar = useCallback(async (hora: string, observacao: string) => {
    const novo = await confirmarPedido(hora, observacao);
    if (!novo) return false;
    toast.success(`Pedido #${novo.numero} enviado! Retirada às ${hora}.`);
    setCarrinhoAberto(false);
    abrirPedido(novo.id);
    return true;
  }, [confirmarPedido, abrirPedido]);

  const config = c.cardapio?.config;
  const primeiroNome = (perfil?.nome ?? '').split(' ')[0];

  if (!c.cardapio) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
        {c.erroCardapio ? (
          <>
            <UtensilsCrossed className="w-10 h-10" />
            <p className="text-sm">{c.erroCardapio}</p>
            <button type="button" onClick={() => { void c.recarregarCardapio(); }} className="text-sm text-primary underline">Tentar de novo</button>
          </>
        ) : (
          <Loader2 className="w-6 h-6 animate-spin" />
        )}
      </div>
    );
  }

  const propsCarrinho = {
    linhas: c.carrinho, despachar: c.despachar, total: c.total, config: config!,
    agoraMin: c.relogio.minutos, enviando: c.enviando, onConfirmar: confirmar,
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-5 pb-28 lg:pb-8">
      {/* Cabeçalho com o aviso do dia */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 text-white shadow-lg"
      >
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-white/15 blur-2xl" aria-hidden />
        <div className="absolute right-6 bottom-0 opacity-20 hidden sm:block" aria-hidden>
          <UtensilsCrossed className="w-40 h-40 -mb-8" strokeWidth={1.2} />
        </div>
        <div className="relative p-5 sm:p-7 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur',
              config!.aberta ? 'bg-white/25' : 'bg-black/25',
            )}>
              <span className={cn('w-2 h-2 rounded-full', config!.aberta ? 'bg-emerald-300 animate-pulse' : 'bg-rose-300')} />
              {config!.aberta ? 'Aberta para pedidos' : 'Fechada no momento'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium">
              <Clock className="w-3.5 h-3.5" /> retiradas das {config!.abre_as} às {config!.fecha_as}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight drop-shadow-sm">
            {saudacao(c.relogio.minutos)}{primeiroNome ? `, ${primeiroNome}` : ''}! O que vai ser hoje?
          </h1>
          {(config!.aviso_titulo || config!.aviso_texto) && (
            <div className="max-w-2xl text-sm text-white/95">
              {config!.aviso_titulo && <p className="font-semibold">{config!.aviso_titulo}</p>}
              {config!.aviso_texto && <p className="opacity-90">{config!.aviso_texto}</p>}
            </div>
          )}
        </div>
      </motion.header>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <PedidosDeHoje pedidos={c.hoje} onAbrir={abrirPedido} />

          {/* Filtros */}
          <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar no cardápio (nome, ingrediente ou número)"
                className="w-full h-11 rounded-xl border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {[{ id: 'tudo' as const, rotulo: 'Tudo' }, ...categoriasComItem].map(cat => {
                const ativo = categoria === cat.id;
                return (
                  <button
                    key={cat.id} type="button" onClick={() => setCategoria(cat.id)}
                    className={cn(
                      'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                      ativo ? 'bg-foreground text-background border-foreground' : 'bg-card hover:bg-accent',
                    )}
                  >
                    {cat.id === 'tudo' ? <Store className="w-4 h-4" /> : <IconeDaCategoria categoria={cat.id} className="w-4 h-4" />} {cat.rotulo}
                  </button>
                );
              })}
            </div>
          </div>

          {ordenados.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Nada encontrado no cardápio.</p>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {ordenados.map(item => (
                <CardItem
                  key={item.id}
                  item={item}
                  janela={janelaDoItem(item, c.relogio.minutos)}
                  quantidade={quantidadeDoItem(c.carrinho, item.id)}
                  onSomar={somar}
                  aberta={config!.aberta}
                />
              ))}
            </div>
          )}

          <Historico pedidos={historico} onAbrir={abrirPedido} />
        </div>

        {/* Carrinho fixo (computador) */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 rounded-3xl border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
              <ShoppingBasket className="w-5 h-5 text-primary" /> Seu pedido
            </h2>
            <ConteudoCarrinho {...propsCarrinho} />
          </div>
        </aside>
      </div>

      {/* Barra do carrinho (celular) */}
      <AnimatePresence>
        {c.total.itens > 0 && (
          <motion.button
            type="button"
            initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
            onClick={() => setCarrinhoAberto(true)}
            className="lg:hidden fixed bottom-4 left-4 right-4 z-30 flex items-center justify-between rounded-2xl bg-primary px-5 py-3.5 text-primary-foreground shadow-xl"
          >
            <span className="flex items-center gap-2 font-semibold">
              <ShoppingBasket className="w-5 h-5" /> {c.total.itens} {c.total.itens === 1 ? 'item' : 'itens'}
            </span>
            <span className="font-bold">{formatarPreco(c.total.valor)} ›</span>
          </motion.button>
        )}
      </AnimatePresence>
      <Sheet open={carrinhoAberto} onOpenChange={setCarrinhoAberto}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl lg:hidden">
          <SheetHeader className="text-left">
            <SheetTitle>Seu pedido</SheetTitle>
            <SheetDescription>Confira os itens e escolha o horário de retirada.</SheetDescription>
          </SheetHeader>
          <div className="mt-3"><ConteudoCarrinho {...propsCarrinho} /></div>
        </SheetContent>
      </Sheet>

      <DetalhePedido
        pedido={pedidoSelecionado}
        aberto={!!pedidoSelecionado}
        onFechar={fecharPedido}
        agoraMs={c.agoraMs}
        cancelamentoMin={config!.cancelamento_min}
        versaoConversa={c.versaoConversa}
        onCancelar={c.cancelar}
      />
    </div>
  );
}
