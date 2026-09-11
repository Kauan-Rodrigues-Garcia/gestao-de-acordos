/**
 * useSetorNucleo — qual setor é o Núcleo de Inteligência e Gestão desta empresa?
 *
 * Existe para o cadastro e a transferência de pessoas saberem onde o cargo
 * Assistente ADM cabe (`cargoDoNucleo.ts`). Não serve a `useNucleo`: aquele
 * responde «EU sou do Núcleo?», e este, «QUAL setor é o Núcleo?», para quem
 * cadastra gente.
 *
 * `null` enquanto carrega, quando a empresa não tem Núcleo e quando a função do
 * banco ainda não existe. Nos três casos a tela se comporta como antes do cargo
 * existir — e é também o que o banco faz sem a trava aplicada.
 */
import { useEffect, useState } from 'react';
import { buscarSetorNucleo } from '@/services/numeros/numeros.service';

export function useSetorNucleo(empresaId: string | null | undefined): string | null {
  const [setorId, setSetorId] = useState<string | null>(null);

  useEffect(() => {
    if (!empresaId) { setSetorId(null); return; }
    let cancelado = false;
    void buscarSetorNucleo(empresaId).then(id => { if (!cancelado) setSetorId(id); });
    return () => { cancelado = true; };
  }, [empresaId]);

  return setorId;
}
