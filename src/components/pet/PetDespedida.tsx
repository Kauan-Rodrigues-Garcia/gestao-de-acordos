/**
 * PetDespedida — o adeus do mascote.
 *
 * O pet sai de cena por um tempo para abrir espaço para outro jogo. Some sem
 * aviso seria estranho para quem convive com ele todo dia, então quem já usava
 * o sistema (`perfis.pet_despedida = 'pendente'`, migration 20260809c) recebe
 * este card uma vez. Quem nunca acessou nunca fica sabendo que existiu um pet.
 *
 * ## Fechar de qualquer jeito é se despedir
 *
 * Botão, clique fora, X e Esc chamam o MESMO `despedir()`. Não existe handler
 * de "fechar sem fazer nada": com um fechar neutro, quem clicasse fora todo dia
 * nunca se despediria e veria este card para sempre. O pet vai embora de
 * qualquer forma — todo jeito de dispensar entrega o adeus em vez de adiá-lo.
 *
 * ## A ordem importa
 *
 * Grava `'concluida'` e dispara a animação, mas **não** chama `refreshPerfil`:
 * isso fecharia o gate do widget e o desmontaria antes de o pet acenar. Quem
 * chama o refresh é o próprio widget, quando termina de sair (ver PetWidget).
 *
 * A gravação acontece ao FECHAR, não ao fim da animação: se um dia a animação
 * não completar, a pessoa fica sem o pet — não presa vendo o mesmo card em toda
 * sessão. Falha de rede mantém 'pendente' e o card volta depois, que é o
 * comportamento desejado.
 *
 * Ver docs/superpowers/specs/2026-08-09-despedida-do-pet-design.md
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { concluirDespedidaPet } from '@/services/pet/petDespedida.service';
import { PetAura } from './PetAura';
import { useFasePet } from './petConfig';
import { despedirPet } from './petEvents';

interface PetDespedidaProps {
  /** Só abre depois que termos de uso e tour estiverem concluídos. */
  pronto: boolean;
}

export function PetDespedida({ pronto }: PetDespedidaProps) {
  const { perfil } = useAuth();
  const fase = useFasePet();

  const [aberto, setAberto] = useState(false);
  const despedindoRef = useRef(false);

  useEffect(() => {
    if (pronto && fase === 'despedindo') setAberto(true);
  }, [pronto, fase]);

  function despedir() {
    // Guard de reentrada: Esc e clique no backdrop podem disparar juntos.
    if (despedindoRef.current) return;
    despedindoRef.current = true;

    setAberto(false);
    despedirPet();

    // `void` sobre uma CHAMADA de função async: ela executa e roda sozinha. Não
    // confundir com `void supabase.from(...)`, que era o defeito daqui — o
    // builder do supabase-js é preguiçoso e só dispara no `.then()`. Ver o
    // cabeçalho de petDespedida.service.
    //
    // Continua sem `refreshPerfil`: recarregar o perfil agora fecharia o gate e
    // desmontaria o pet antes do aceno. Quem chama é o widget, ao terminar.
    if (perfil?.id) void concluirDespedidaPet(perfil.id);
  }

  // Esc fecha — e fechar é se despedir, como qualquer outro caminho.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') despedir(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- despedir é estável na prática (guard de reentrada) e recriá-la reinstalaria o listener a cada render.
  }, [aberto]);

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          key="pet-despedida-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={despedir}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            key="pet-despedida-card"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            // Sem isto, clicar dentro do card borbulha até o backdrop e fecha.
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-[380px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <button
              type="button"
              onClick={despedir}
              aria-label="Fechar e se despedir do mascote"
              className="absolute top-2.5 right-2.5 z-10 w-7 h-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div
              className="relative pt-5 pb-3"
              style={{ background: 'linear-gradient(180deg, rgba(143,134,216,.18), transparent)' }}
            >
              <div className="mx-auto w-24 h-24">
                <PetAura humor="feliz" roupa="nenhuma" cena="aceno" className="w-full h-full drop-shadow" />
              </div>
            </div>

            <div className="px-6 pb-6 pt-1 text-center space-y-2.5">
              <h2 className="text-base font-bold text-foreground">
                Até logo, por enquanto! 👋
              </h2>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                O mascote vai tirar umas férias. Estamos preparando algo novo por
                aqui, e ele volta em breve — com novidades.
              </p>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                Obrigado por ter cuidado dele até aqui. 💜
              </p>

              <div className="pt-2">
                <Button className="w-full" onClick={despedir}>
                  Até logo
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
