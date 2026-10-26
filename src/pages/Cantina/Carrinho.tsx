/**
 * Carrinho — o pedido sendo montado, a faixa de retirada e a confirmação.
 *
 * No computador fica fixo ao lado do cardápio; no celular vira uma barra no
 * rodapé que abre o mesmo conteúdo numa gaveta. A confirmação repete a regra
 * da cantina (não retirado é cobrado; cancela até X min antes) — é a última
 * chance de a pessoa ler antes do desconto em folha.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Clock, Loader2, MessageSquareText, Minus, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  faixasDeRetirada, formatarPreco, fotoDoItem, linhasForaDaJanela,
  type AcaoCarrinho, type ConfigCantina, type LinhaCarrinho,
} from '@/lib/cantina';
import { ImagemItem } from './visual';

export interface PropsCarrinho {
  linhas: LinhaCarrinho[];
  despachar: (a: AcaoCarrinho) => void;
  total: { itens: number; valor: number };
  config: ConfigCantina;
  agoraMin: number;
  enviando: boolean;
  onConfirmar: (hora: string, observacao: string) => Promise<boolean>;
}

export function ConteudoCarrinho({
  linhas, despachar, total, config, agoraMin, enviando, onConfirmar,
}: PropsCarrinho) {
  const faixas = useMemo(() => faixasDeRetirada(agoraMin, config), [agoraMin, config]);
  const [hora, setHora] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [comNota, setComNota] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);

  // A faixa escolhida passou: some a escolha, para não confirmar uma que o
  // banco recusaria.
  useEffect(() => {
    if (hora && !faixas.includes(hora)) setHora(null);
  }, [faixas, hora]);

  const foraDaJanela = linhasForaDaJanela(linhas, agoraMin);
  const pronto = linhas.length > 0 && !!hora && foraDaJanela.length === 0 && config.aberta;

  if (linhas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 py-10 px-4">
        <span className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <ShoppingBasket className="w-8 h-8" />
        </span>
        <div>
          <p className="font-semibold text-foreground">Seu pedido está vazio</p>
          <p className="text-sm text-muted-foreground">Toque em <strong>Adicionar</strong> nos itens do cardápio.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {linhas.map(l => (
            <motion.li
              key={l.chave}
              layout
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16, height: 0 }}
              className="rounded-xl border bg-background p-2"
            >
              <div className="flex items-center gap-2.5">
                <ImagemItem categoria={l.item.categoria} foto={fotoDoItem(l.item)} nome={l.item.nome}
                  className="w-11 h-11 rounded-lg shrink-0" tamanhoIcone="w-5 h-5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight truncate">{l.item.nome}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {l.opcao ? `${l.opcao} · ` : ''}{formatarPreco(l.item.preco)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => despachar({ tipo: 'somar', item: l.item, opcao: l.opcao, delta: -1 })}
                    className="w-7 h-7 rounded-lg border inline-flex items-center justify-center hover:bg-accent" aria-label="Menos um">
                    {l.quantidade === 1 ? <Trash2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                  </button>
                  <span className="w-5 text-center text-sm font-bold tabular-nums">{l.quantidade}</span>
                  <button type="button" onClick={() => despachar({ tipo: 'somar', item: l.item, opcao: l.opcao, delta: 1 })}
                    className="w-7 h-7 rounded-lg border inline-flex items-center justify-center hover:bg-accent" aria-label="Mais um">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {comNota === l.chave || l.observacao ? (
                <input
                  autoFocus={comNota === l.chave}
                  value={l.observacao}
                  onChange={e => despachar({ tipo: 'observacao', chave: l.chave, texto: e.target.value })}
                  onBlur={() => setComNota(null)}
                  placeholder="Ex.: sem cebola, bem passado…"
                  className="mt-2 w-full rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              ) : (
                <button type="button" onClick={() => setComNota(l.chave)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  <MessageSquareText className="w-3 h-3" /> Adicionar observação
                </button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {foraDaJanela.length > 0 && (
        <div className="flex gap-2 rounded-xl bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {foraDaJanela.map(l => l.item.nome).join(', ')} {foraDaJanela.length > 1 ? 'saíram' : 'saiu'} do horário de pedido.
            Tire do carrinho para continuar.
          </span>
        </div>
      )}

      <section>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold mb-2">
          <Clock className="w-4 h-4 text-primary" /> Quando você vai retirar?
        </h3>
        {faixas.length === 0 ? (
          <p className="text-xs text-muted-foreground">Não há mais horário de retirada hoje (a cantina fecha às {config.fecha_as}).</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 max-h-[132px] overflow-y-auto pr-1">
            {faixas.map(f => (
              <button
                key={f} type="button" onClick={() => setHora(f)}
                className={cn(
                  'rounded-lg border py-1.5 text-sm font-semibold tabular-nums transition-all',
                  hora === f
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm scale-[1.03]'
                    : 'bg-background hover:border-primary/50 hover:bg-primary/5',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </section>

      <textarea
        value={observacao}
        onChange={e => setObservacao(e.target.value.slice(0, 300))}
        rows={2}
        placeholder="Observação para a cantina (opcional)"
        className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">{total.itens} {total.itens === 1 ? 'item' : 'itens'}</span>
        <span className="text-2xl font-bold tracking-tight">{formatarPreco(total.valor)}</span>
      </div>

      <Button size="lg" className="w-full h-12 text-base rounded-xl" disabled={!pronto} onClick={() => setRevisando(true)}>
        {!config.aberta ? 'Cantina fechada' : !hora ? 'Escolha o horário de retirada' : 'Revisar e fazer pedido'}
      </Button>
      <button type="button" onClick={() => despachar({ tipo: 'esvaziar' })}
        className="text-xs text-muted-foreground hover:text-destructive self-center">
        Esvaziar pedido
      </button>

      <Dialog open={revisando} onOpenChange={o => !enviando && setRevisando(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar pedido</DialogTitle>
            <DialogDescription>Retirada hoje às <strong className="text-foreground">{hora}</strong>, no balcão da cantina.</DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-xl border">
            {linhas.map(l => (
              <li key={l.chave} className="flex justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  <strong>{l.quantidade}×</strong> {l.item.nome}{l.opcao ? ` (${l.opcao})` : ''}
                  {l.observacao && <span className="block text-xs text-muted-foreground">“{l.observacao}”</span>}
                </span>
                <span className="tabular-nums">{formatarPreco(l.item.preco * l.quantidade)}</span>
              </li>
            ))}
            <li className="flex justify-between px-3 py-2 font-bold">
              <span>Total</span><span className="tabular-nums">{formatarPreco(total.valor)}</span>
            </li>
          </ul>
          <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <p>• O valor é descontado em folha.</p>
            <p>• Pedido <strong>não retirado</strong> é cobrado e não tem reembolso.</p>
            <p>• Dá para cancelar até <strong>{config.cancelamento_min} minutos</strong> antes da retirada.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={enviando} onClick={() => setRevisando(false)}>Voltar</Button>
            <Button
              disabled={enviando || !hora}
              onClick={async () => {
                if (!hora) return;
                const ok = await onConfirmar(hora, observacao);
                if (ok) { setRevisando(false); setHora(null); setObservacao(''); }
              }}
            >
              {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
