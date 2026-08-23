/**
 * RankingDesafio — a lista completa, do 4º em diante.
 *
 * ## Onde a ultrapassagem é detectada
 *
 * Aqui, e num lugar só. O componente guarda as posições da última renderização
 * num `ref` e compara com as novas: quem subiu ganha o aviso "Subiu N posições"
 * por alguns segundos. O DESLIZE do card não passa por este estado — ele é
 * `layout` do Framer Motion, dentro de `CardParticipante`.
 *
 * Separar as duas coisas importa: o deslize acontece sempre que a ordem muda,
 * inclusive quando a lista é filtrada; o aviso é sobre a DISPUTA, e só aparece
 * quando a posição de alguém melhorou de verdade entre duas leituras.
 *
 * O `ref` começa vazio de propósito. Na primeira renderização não há "antes", e
 * anunciar que 18 pessoas subiram ao abrir a aba seria ruído puro.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { ResultadoParticipante } from '@/services/desafios/calcularDesafio';
import type { EstiloTema } from './tema';
import { CardParticipante } from './CardParticipante';

/** Tempo que o aviso de subida fica na tela. Curto: é aviso, não troféu. */
const AVISO_MS = 4_000;

interface Props {
  lista: ResultadoParticipante[];
  tema: EstiloTema;
  mostrarFotos: boolean;
  animar: boolean;
  voceId?: string | null;
  ocultarEquipe?: boolean;
}

export function RankingDesafio({
  lista, tema, mostrarFotos, animar, voceId, ocultarEquipe,
}: Props) {
  const anterior = useRef<Map<string, number>>(new Map());
  const [subidas, setSubidas] = useState<Record<string, number>>({});

  useEffect(() => {
    const atual = new Map(lista.map(i => [i.pessoa.id, i.posicao]));
    const novas: Record<string, number> = {};

    // Primeira leitura não tem "antes" — abrir a aba não é ultrapassagem.
    if (anterior.current.size) {
      for (const [id, pos] of atual) {
        const antes = anterior.current.get(id);
        if (antes !== undefined && antes > pos) novas[id] = antes - pos;
      }
    }
    anterior.current = atual;

    if (!Object.keys(novas).length) return;
    setSubidas(novas);
    const t = setTimeout(() => setSubidas({}), AVISO_MS);
    return () => clearTimeout(t);
  }, [lista]);

  if (!lista.length) return null;

  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {lista.map(item => (
          <CardParticipante
            key={item.pessoa.id}
            item={item}
            tema={tema}
            mostrarFotos={mostrarFotos}
            animar={animar}
            ehVoce={!!voceId && item.pessoa.id === voceId}
            subiu={subidas[item.pessoa.id] ?? 0}
            ocultarEquipe={ocultarEquipe}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

export default RankingDesafio;
