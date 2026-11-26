/**
 * SorteioAoVivo — a porta do sorteio ao vivo do Desafio do Vale no `Layout`
 * (26/11/2026). Leve: uma leitura ao abrir o app e o sinal do tópico pessoal;
 * o palco só desce quando a pessoa está na plateia de um sorteio no ar.
 *
 * Minimizar vale para a fase atual: quando o sorteio muda de fase (começou a
 * contagem, revelou), o palco volta a abrir sozinho.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuthOpcional } from '@/hooks/useAuth';
import { comNovaTentativa } from '@/lib/sobDemanda';
import { ligarSorteioAoVivo, useSorteioAoVivo } from './banco';

const PalcoSorteio = lazy(comNovaTentativa(() => import('./PalcoSorteio')));

export function SorteioAoVivo() {
  const auth = useAuthOpcional();
  const usuario = auth?.user?.id ?? null;
  const superAdmin = auth?.perfil?.perfil === 'super_admin';
  const { show } = useSorteioAoVivo();
  const [minimizado, setMinimizado] = useState<string | null>(null);

  useEffect(() => (usuario ? ligarSorteioAoVivo(usuario) : undefined), [usuario]);

  if (!show || show.estado === 'encerrado' || show.estado === 'cancelado') return null;
  const fase = `${show.id}:${show.estado}`;

  if (minimizado === fase) {
    return (
      <button type="button" className="sav-pilula" onClick={() => setMinimizado(null)}>
        <i aria-hidden /> Sorteio ao vivo · {show.setor_nome} — assistir
      </button>
    );
  }
  return (
    <Suspense fallback={null}>
      <PalcoSorteio show={show} eu={usuario} superAdmin={superAdmin} onMinimizar={() => setMinimizado(fase)} />
    </Suspense>
  );
}
