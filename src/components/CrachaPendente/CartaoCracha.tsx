/**
 * O cartão em forma de crachá: cordão, presilha, foto (ou iniciais), nome e os
 * 6 quadradinhos do número. As regras moram em `cracha.ts`; aqui é só a tela.
 *
 *   pedindo      a pessoa digita o número (até 8; não tem «agora não»)
 *   conferindo   «Você tem certeza?» — depois de gravado, só o RH troca
 *   pronto       agradece e sai sozinho
 *
 * `previa`: aberto por `?previa-cracha` — mesma tela, nada gravado.
 */
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFotoResolvida } from '@/components/Chat/useFotoResolvida';
import {
  DIGITOS_CRACHA, crachaCompleto, iniciais, limparCracha, primeiroNome, salvarMeuCracha,
} from './cracha';

/** Quanto o agradecimento fica na tela antes de o cartão sair. */
const AGRADECIMENTO_MS = 4500;

type Etapa = 'pedindo' | 'conferindo' | 'pronto';

export function CartaoCracha({ nome, foto, previa = false, esquerda = 0, onSalvo, onFecharPrevia }: {
  nome?: string | null;
  foto?: string | null;
  previa?: boolean;
  /** Largura do menu lateral, em px: o cartão fica logo depois dele. */
  esquerda?: number;
  onSalvo: () => void;
  /** Só a prévia fecha sem responder; o cartão de verdade fica até salvar. */
  onFecharPrevia?: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>('pedindo');
  const [numero, setNumero] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const fotoUrl = useFotoResolvida(foto ?? null);
  const n1 = primeiroNome(nome);

  useEffect(() => {
    if (etapa !== 'pronto') return;
    const t = setTimeout(onSalvo, AGRADECIMENTO_MS);
    return () => clearTimeout(t);
  }, [etapa, onSalvo]);

  const conferir = useCallback(() => {
    if (crachaCompleto(numero)) setEtapa('conferindo');
  }, [numero]);

  const confirmar = async () => {
    if (previa) { setEtapa('pronto'); return; }
    setSalvando(true);
    setErro(null);
    try {
      await salvarMeuCracha(numero);
      setEtapa('pronto');
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não deu para salvar. Confira a internet e tente de novo.');
      setEtapa('pedindo');
    } finally {
      setSalvando(false);
    }
  };

  const corrigir = () => {
    setEtapa('pedindo');
    requestAnimationFrame(() => campo.current?.focus({ preventScroll: true }));
  };

  return (
    <motion.div
      role={etapa === 'pronto' ? 'status' : 'dialog'}
      aria-label="Preencha o seu crachá"
      initial={{ opacity: 0, y: 28, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      style={{ '--cracha-esquerda': `${esquerda}px` } as React.CSSProperties}
      className="fixed bottom-4 left-3 z-[45] w-[min(340px,calc(100vw-24px))] print:hidden md:left-[calc(var(--cracha-esquerda)+16px)]"
    >
      {/* O cordão e a presilha. */}
      <div aria-hidden="true" className="flex flex-col items-center">
        <div className="flex h-6 gap-5">
          <span className="w-2.5 rounded-t-sm bg-primary/70" />
          <span className="w-2.5 rounded-t-sm bg-primary/70" />
        </div>
        <span className="relative z-10 -mb-2 h-5 w-16 rounded-md border border-border bg-muted shadow-sm" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl">
        <div className="relative bg-primary px-5 pb-10 pt-4 text-primary-foreground">
          <span aria-hidden="true" className="mx-auto block h-1.5 w-12 rounded-full bg-primary-foreground/35" />
          <p className="mt-2 text-center text-xs font-semibold uppercase tracking-[0.25em] opacity-85">Crachá</p>
          {previa && (
            <span className="absolute right-3 top-2.5 text-[11px] font-semibold uppercase tracking-wider opacity-75">prévia</span>
          )}
        </div>

        <div className="-mt-8 flex flex-col items-center gap-4 px-5 pb-5 text-center">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-semibold text-muted-foreground ring-4 ring-card">
              {fotoUrl
                ? <img src={fotoUrl} alt="" className="h-full w-full object-cover" />
                : (iniciais(nome) || '?')}
            </div>
            {etapa === 'pronto' && (
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 14 }}
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-success text-success-foreground ring-2 ring-card"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </motion.span>
            )}
          </div>

          {etapa === 'pronto' ? (
            <div className="space-y-1.5">
              <p className="text-lg font-semibold">{n1 ? `Valeu, ${n1}!` : 'Valeu!'}</p>
              <p className="text-sm text-muted-foreground">
                Crachá guardado. Obrigado por ajudar — isso vai facilitar as coisas lá na frente.
              </p>
              <Button variant="ghost" size="sm" className="mt-1" onClick={onSalvo}>Fechar</Button>
            </div>
          ) : etapa === 'conferindo' ? (
            <div className="w-full space-y-4">
              <div className="space-y-2">
                <p className="text-lg font-semibold">Você tem certeza?</p>
                <p className="font-mono text-3xl font-semibold tabular-nums tracking-[0.2em]">{numero}</p>
                <p className="text-sm text-muted-foreground">
                  Esse número será usado posteriormente e precisa estar correto.
                  Depois de salvo, só o RH consegue trocar.
                </p>
              </div>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={corrigir} disabled={salvando}>Corrigir</Button>
                <Button onClick={() => void confirmar()} disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Confirmar'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="w-full space-y-4">
              <div className="space-y-1.5">
                <p className="text-lg font-semibold leading-snug">
                  {n1 ? `Oi, ${n1}! Completa o seu crachá?` : 'Completa o seu crachá?'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Digita o número do seu crachá (até {DIGITOS_CRACHA} números). Vai ser útil daqui pra frente.
                </p>
              </div>
              <CampoDigitos
                ref={campo}
                valor={numero}
                onChange={v => { setNumero(v); setErro(null); }}
                onEnter={conferir}
              />
              {erro && <p role="alert" className="text-sm font-medium text-destructive">{erro}</p>}
              <div className={cn('flex items-center gap-2', previa ? 'justify-between' : 'justify-end')}>
                {previa && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onFecharPrevia}>
                    Fechar prévia
                  </Button>
                )}
                <Button onClick={conferir} disabled={!crachaCompleto(numero)}>Salvar</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Os 8 quadradinhos. Por baixo é UM campo só, transparente por cima deles: o
 * colar, o apagar e o teclado numérico do celular funcionam sem lógica de
 * pular de quadrado em quadrado. Sem foco automático: o cartão chega no meio
 * do trabalho e não pode roubar o cursor de quem está digitando.
 */
const CampoDigitos = forwardRef<HTMLInputElement, {
  valor: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}>(function CampoDigitos({ valor, onChange, onEnter }, ref) {
  const [focado, setFocado] = useState(false);
  const atual = Math.min(valor.length, DIGITOS_CRACHA - 1);
  return (
    <div className="relative mx-auto w-fit">
      <div aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: DIGITOS_CRACHA }, (_, i) => (
          <span
            key={i}
            className={cn(
              'flex h-12 w-8 items-center justify-center rounded-lg border border-input bg-background font-mono text-2xl font-semibold tabular-nums transition-colors',
              focado && i === atual && 'border-primary ring-2 ring-primary/25',
            )}
          >
            {valor[i] ?? ''}
          </span>
        ))}
      </div>
      <input
        ref={ref}
        value={valor}
        onChange={e => onChange(limparCracha(e.target.value))}
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        onKeyDown={e => { if (e.key === 'Enter') onEnter(); }}
        inputMode="numeric"
        autoComplete="off"
        aria-label={`Número do crachá, ${DIGITOS_CRACHA} números`}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  );
});
