/**
 * PetNomeVotacaoLembrete — janela de votação do nome do mascote (Aura / Lupi / Albi).
 *
 * Reaproveita a mesma tabela/serviço da votação original (petNomeVotacao.service):
 * quem já votou nunca vê essa janela de novo (voto é final, sem UPDATE/DELETE na
 * tabela). Quem ainda não votou vê a cada sessão até votar — lembrete, não só
 * uma pergunta única.
 *
 * `pronto` controla quando a checagem de voto pode rodar: só depois que o
 * usuário aceitou os termos de uso e terminou o tour de onboarding — a janela
 * antiga perguntava antes disso e atropelava os dois fluxos.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { PetAura } from './PetAura';
import {
  getMeuVotoNome, votarNome, OPCOES_NOME, type NomeMascote,
} from '@/services/pet/petNomeVotacao.service';

type Fase = 'aguardando' | 'oculto' | 'votando' | 'obrigado';

interface PetNomeVotacaoLembreteProps {
  /** Só passa a checar/abrir depois que termos + tour estiverem concluídos. */
  pronto: boolean;
}

export function PetNomeVotacaoLembrete({ pronto }: PetNomeVotacaoLembreteProps) {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const [fase, setFase]         = useState<Fase>('aguardando');
  const [escolha, setEscolha]   = useState<NomeMascote | null>(null);
  const [enviando, setEnviando] = useState(false);
  const decididoRef = useRef(false);

  // Só consulta o voto quando pronto (pós termos + tour) — uma vez por sessão.
  useEffect(() => {
    if (!pronto || !perfil?.id || decididoRef.current) return;
    let vivo = true;
    getMeuVotoNome().then(v => {
      if (!vivo) return;
      decididoRef.current = true;
      setFase(!v.indisponivel && !v.votou ? 'votando' : 'oculto');
    });
    return () => { vivo = false; };
  }, [pronto, perfil?.id]);

  async function confirmar() {
    if (!escolha || !perfil?.id) return;
    setEnviando(true);
    const ok = await votarNome(perfil.id, empresa?.id ?? null, escolha);
    setEnviando(false);
    if (ok) {
      setFase('obrigado');
      setTimeout(() => setFase('oculto'), 2200);
    }
  }

  const aberto = fase === 'votando' || fase === 'obrigado';

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          key="votacao-lembrete-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            key="votacao-lembrete-card"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-[380px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="relative pt-5 pb-3" style={{ background: 'linear-gradient(180deg, rgba(143,134,216,.18), transparent)' }}>
              <div className="mx-auto w-24 h-24">
                <PetAura humor={fase === 'obrigado' ? 'comemorando' : 'feliz'} roupa="nenhuma" className="w-full h-full drop-shadow" />
              </div>
            </div>

            {fase === 'obrigado' ? (
              <div className="px-6 pb-6 pt-1 text-center space-y-2">
                <p className="text-base font-bold text-foreground flex items-center justify-center gap-1.5">
                  <Heart className="w-4 h-4 text-primary fill-primary" /> Voto registrado!
                </p>
                <p className="text-sm text-muted-foreground">
                  Obrigado por ajudar a batizar o mascote. Em breve a gente conta o resultado! 💜
                </p>
              </div>
            ) : (
              <div className="px-5 pb-5 pt-1 space-y-4">
                <div className="text-center space-y-1.5">
                  <h2 className="text-base font-bold text-foreground">
                    🗳️ Seu voto ainda não foi feito!
                  </h2>
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                    Sua participação é importante: ajude a escolher o nome do mascote.
                  </p>
                </div>

                <div className="space-y-2">
                  {OPCOES_NOME.map(nome => {
                    const ativa = escolha === nome;
                    return (
                      <button
                        key={nome}
                        type="button"
                        onClick={() => setEscolha(nome)}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 transition-all text-left',
                          ativa
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/40 hover:bg-accent/40',
                        )}
                      >
                        <span
                          className={cn(
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                            ativa ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                          )}
                        >
                          {ativa && <Check className="w-3 h-3" />}
                        </span>
                        <span className={cn('text-sm font-semibold', ativa ? 'text-foreground' : 'text-foreground/80')}>
                          {nome}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-1.5 pt-1">
                  <Button
                    className="w-full gap-1.5"
                    disabled={!escolha || enviando}
                    onClick={confirmar}
                  >
                    {enviando
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                      : <>Confirmar voto</>}
                  </Button>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
                    onClick={() => setFase('oculto')}
                  >
                    Talvez depois
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
