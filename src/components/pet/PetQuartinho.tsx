/**
 * PetQuartinho — painel que abre ao clicar no pet: cenário do quarto,
 * prateleira de colecionáveis, ações (alimentar/dormir) e lojinhas (esboço).
 * Sem sistema financeiro ainda — comidas ficam "em breve".
 */
import { useState, type ComponentType } from 'react';
import { motion } from 'framer-motion';
import { X, UtensilsCrossed, Moon, Sun, Shirt, Store, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import type { PetSvgProps } from './PetAura';
import {
  ROUPAS_CATALOGO, COMIDAS_CATALOGO,
  type PetHumor, type PetRoupa,
} from './petConfig';

interface PetQuartinhoProps {
  petNome:        string;
  PetSvg:         ComponentType<PetSvgProps>;
  humor:          PetHumor;
  roupa:          PetRoupa;
  /** Cargos sem interação ainda: pet dormindo + mensagem "Em breve". */
  modoTeaser?:    boolean;
  /** Saldo atual de moedas (0 quando o banco ainda não tem a economia). */
  moedas?:          number;
  /** Recompensa do recebimento do dia ainda não resgatada. */
  recompensaMoedas?: number;
  recompensaValor?:  number;
  onResgatar?:       () => void;
  onAlimentar:    () => void;
  onAlternarSono: () => void;
  onSetRoupa:     (r: PetRoupa) => void;
  onClose:        () => void;
}

type Aba = 'quarto' | 'comidas' | 'roupas';

export function PetQuartinho({
  petNome, PetSvg, humor, roupa, modoTeaser = false,
  moedas = 0, recompensaMoedas = 0, recompensaValor = 0, onResgatar,
  onAlimentar, onAlternarSono, onSetRoupa, onClose,
}: PetQuartinhoProps) {
  const [aba, setAba] = useState<Aba>('quarto');
  const [balao, setBalao] = useState<string | null>(null);

  function alimentar() {
    if (humor === 'dormindo') { setBalao('shhh... 😴'); setTimeout(() => setBalao(null), 1500); return; }
    onAlimentar();
    setBalao('nham nham! 😋');
    setTimeout(() => setBalao(null), 1800);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.97 }}
      transition={{ type: 'tween', duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="mb-2 w-[330px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          🐾 {petNome}
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {humor === 'dormindo' ? 'dormindo'
              : humor === 'feliz' ? 'feliz'
              : humor === 'comemorando' ? 'comemorando 🎉'
              : humor === 'jogando' ? 'jogando 🎮'
              : 'de boa'}
          </span>
        </p>
        <div className="flex items-center gap-1.5">
          {!modoTeaser && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 text-amber-700 dark:text-amber-400 text-[11px] font-bold px-2 py-0.5"
              title="Suas moedas"
            >
              🪙 {moedas.toLocaleString('pt-BR')}
            </span>
          )}
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Cenário do quartinho */}
      <div className="relative h-52 overflow-hidden" style={{ background: '#f2e4cf' }}>
        {/* parede: janela + quadrinho */}
        <div className="absolute left-5 top-5 w-16 h-14 rounded-lg" style={{ background: '#bfd7e8', border: '5px solid #a8815c' }}>
          <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2" style={{ background: '#a8815c' }} />
          <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2" style={{ background: '#a8815c' }} />
          <span className="absolute right-1 top-0.5 text-[10px]">🌙</span>
        </div>
        {/* prateleira de colecionáveis */}
        <div className="absolute right-4 top-6 w-[110px]">
          <div className="flex justify-around pb-1">
            {[0, 1, 2].map(i => (
              <div key={i} title="Colecionável — em breve"
                className="w-7 h-7 rounded-full border-2 border-dashed flex items-center justify-center text-[11px] font-bold"
                style={{ borderColor: '#c9a97b', color: '#c9a97b', background: '#faf3e6' }}>
                ?
              </div>
            ))}
          </div>
          <div className="h-2 rounded-sm" style={{ background: '#a8815c' }} />
        </div>
        {/* chão + tapete */}
        <div className="absolute inset-x-0 bottom-0 h-14" style={{ background: '#d9b98c' }} />
        <div className="absolute left-1/2 bottom-2 -translate-x-1/2 w-44 h-9 rounded-[50%]" style={{ background: '#a8c5b5' }} />
        {/* plantinha */}
        <span className="absolute left-4 bottom-9 text-2xl">🪴</span>

        {/* balão de fala */}
        {balao && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 bg-white text-[#4a3b2a] text-xs font-semibold px-3 py-1.5 rounded-full shadow-md border border-black/5">
            {balao}
          </div>
        )}

        {/* o pet */}
        <div className="absolute left-1/2 bottom-3 -translate-x-1/2 w-36 h-36 text-black/70">
          <PetSvg humor={humor} roupa={roupa} className="w-full h-full" />
        </div>
      </div>

      {/* Modo teaser: só a mensagem, sem ações/lojas */}
      {modoTeaser && (
        <div className="p-4 space-y-2 text-center">
          <p className="text-sm font-bold text-foreground">🐾 Em breve!</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Seu pet ganhará novas funcionalidades! Conforme você aumentar seus
            recebimentos e atingir metas, poderá cuidar dele, interagir,
            desbloquear itens e acompanhar sua evolução.
          </p>
          <p className="text-xs font-medium text-foreground">
            Continue recebendo e prepare-se para novas aventuras! 💰✨🐾
          </p>
        </div>
      )}

      {/* Ações rápidas + lojas (modo completo) */}
      {!modoTeaser && (<>
      {/* Recompensa do recebimento do dia — converte em moedas */}
      {recompensaMoedas > 0 && (
        <button
          type="button"
          onClick={onResgatar}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-amber-400/10 hover:bg-amber-400/20 transition-colors text-left"
        >
          <span className="text-xl shrink-0">🪙</span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-bold text-foreground">
              Pegar recompensa do dia
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {formatBRL(recompensaValor)} recebido{recompensaValor > 0 ? '' : 's'} · +{recompensaMoedas} moedas
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-amber-500 text-amber-950 text-[11px] font-bold px-2.5 py-1">
            +{recompensaMoedas}
          </span>
        </button>
      )}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 flex-1" onClick={alimentar}>
          <UtensilsCrossed className="w-3.5 h-3.5" /> Alimentar
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 flex-1" onClick={onAlternarSono}>
          {humor === 'dormindo'
            ? <><Sun className="w-3.5 h-3.5" /> Acordar</>
            : <><Moon className="w-3.5 h-3.5" /> Dormir</>}
        </Button>
      </div>

      {/* Abas */}
      <div className="flex border-b border-border">
        {([
          { id: 'quarto',  label: 'Quarto',  Icon: Home },
          { id: 'comidas', label: 'Comidas', Icon: Store },
          { id: 'roupas',  label: 'Roupas',  Icon: Shirt },
        ] as { id: Aba; label: string; Icon: typeof Home }[]).map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setAba(id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
              aba === id ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground',
            )}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      <div className="p-3 min-h-[96px]">
        {aba === 'quarto' && (
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5">
            <p>
              Este é o cantinho do seu <strong className="text-foreground">{petNome}</strong>.
              Você tem <strong className="text-amber-600 dark:text-amber-400">🪙 {moedas.toLocaleString('pt-BR')} moedas</strong>.
            </p>
            <p>
              Ganhe moedas a cada recebimento do dia 💰 — clique em
              <strong className="text-foreground"> Pegar recompensa</strong> quando
              aparecer. Em breve: comidas de verdade e colecionáveis para gastá-las.
            </p>
          </div>
        )}

        {aba === 'comidas' && (
          <div className="grid grid-cols-3 gap-2">
            {COMIDAS_CATALOGO.map(c => (
              <div key={c.id} className="rounded-xl border border-border p-2 text-center space-y-1">
                <p className="text-2xl">{c.emoji}</p>
                <p className="text-[11px] font-medium text-foreground">{c.nome}</p>
                <Button size="sm" variant="outline" className="h-6 w-full text-[10px]" disabled>
                  Em breve
                </Button>
              </div>
            ))}
          </div>
        )}

        {aba === 'roupas' && (
          <div className="grid grid-cols-2 gap-2">
            {ROUPAS_CATALOGO.map(r => {
              const equipada = roupa === r.id;
              return (
                <div key={r.id} className={cn('rounded-xl border p-2 text-center space-y-1', equipada ? 'border-primary bg-primary/5' : 'border-border')}>
                  <p className="text-2xl">{r.emoji}</p>
                  <p className="text-[11px] font-medium text-foreground">{r.nome}</p>
                  <Button
                    size="sm" variant={equipada ? 'default' : 'outline'}
                    className="h-6 w-full text-[10px]"
                    onClick={() => onSetRoupa(equipada ? 'nenhuma' : r.id)}
                  >
                    {equipada ? 'Remover' : 'Equipar'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>)}
    </motion.div>
  );
}
