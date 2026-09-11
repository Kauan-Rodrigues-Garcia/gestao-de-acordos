/**
 * useMeusChips — a aba do setor, nas duas visões que ela tem.
 *
 * ## Quem vê o quê, e onde isso é decidido
 *
 * Duas vezes, de propósito, e as duas concordam:
 *
 *   - o BANCO recorta (`fn_numeros_visivel`). O operador recebe só os números
 *     lançados para ele; a liderança recebe o setor inteiro. Quem burlar a tela
 *     não recebe uma linha a mais;
 *   - a TELA pergunta o mesmo, por `escopoEfetivo('chips')`, para saber o que
 *     DESENHAR. Sem isso ela teria de adivinhar se mostra a coluna "operador" e
 *     o botão de lançar.
 *
 * A tela nunca filtra o que o banco mandou. Ela só decide a forma.
 *
 * ## A exceção: `comigo`
 *
 * A visão individual mostra «os números lançados para você», e para o operador
 * de um setor de cobrança isso é a lista inteira — a RLS já recortou. Para quem
 * é do Núcleo, não: `fn_numeros_visivel` entrega ao Núcleo TODOS os números da
 * empresa, e desde 11/09/2026 o Núcleo também abre esta aba. Sem o filtro, o
 * acervo inteiro apareceria sob aquele título.
 *
 * `comigo` não esconde nada que a pessoa não possa ver em outra tela; ele só faz
 * o título dizer a verdade.
 *
 * ## `visao` é derivada, não escolhida
 *
 * `escopoEfetivo` devolve o nível MAIS AMPLO que a pessoa alcança. Quem tem
 * `chips_escopo_setor` recebe `'setor'` mesmo tendo também o individual — o de
 * setor é superconjunto do outro, e oferecer a escolha criaria um seletor que
 * esconde dados de quem já pode vê-los.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { escopoEfetivo } from '@/lib/permissoes-escopo';
import { assinarTabela } from '@/lib/realtime';
import { reconciliarLista } from '@/lib/dadosVivos';
import {
  listarCelulares, listarNumeros,
  type CelularRow, type NumeroRow,
} from '@/services/numeros/numeros.service';

/** O que a tela desenha. `null` = a aba está fechada para esta pessoa. */
export type VisaoChips = 'individual' | 'setor' | null;

interface Retorno {
  visao: VisaoChips;
  /** Tudo o que o banco deixou esta pessoa ver. */
  numeros: NumeroRow[];
  /** Os aparelhos do setor, para a tela dizer onde cada número mora. */
  celulares: CelularRow[];
  /** Liberados ao setor e ainda sem dono. Vazio na visão individual. */
  semOperador: NumeroRow[];
  /** Lançados a alguém — na visão individual, os da própria pessoa. */
  comOperador: NumeroRow[];
  /** Só os que estão lançados para a própria pessoa. Ver o cabeçalho. */
  comigo: NumeroRow[];
  /** O id de quem está logado, para a tela saber o que é dela. */
  meuId: string | null;
  loading: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useMeusChips(): Retorno {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao, loading: permLoading } = useCargoPermissoes();

  const empresaId = empresa?.id ?? null;
  const meuId = perfil?.id ?? null;

  const [numeros, setNumeros]     = useState<NumeroRow[]>([]);
  const [celulares, setCelulares] = useState<CelularRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [erro, setErro]           = useState<string | null>(null);

  const primeiraCarga = useRef(true);

  const visao = useMemo<VisaoChips>(() => {
    if (permLoading) return null;
    const nivel = escopoEfetivo('chips', temPermissao);
    // A aba só tem dois níveis registrados; qualquer outra coisa é aba fechada.
    return nivel === 'setor' || nivel === 'individual' ? nivel : null;
  }, [permLoading, temPermissao]);

  const carregar = useCallback(async () => {
    if (!empresaId || visao === null) {
      setNumeros([]); setCelulares([]); setLoading(false);
      return;
    }
    try {
      // Sem filtro por setor nem por operador: a RLS já recortou. Repetir o
      // filtro aqui criaria uma segunda régua para divergir da primeira.
      const [nums, cels] = await Promise.all([
        listarNumeros(empresaId),
        listarCelulares(empresaId),
      ]);
      setNumeros(anterior => reconciliarLista(anterior, nums, { chave: n => n.id }));
      setCelulares(anterior => reconciliarLista(anterior, cels, { chave: c => c.id }));
      setErro(null);
    } catch (e) {
      setErro((e as { message?: string }).message ?? 'Não foi possível carregar.');
    } finally {
      if (primeiraCarga.current) {
        primeiraCarga.current = false;
        setLoading(false);
      }
    }
  }, [empresaId, visao]);

  useEffect(() => { primeiraCarga.current = true; setLoading(true); }, [empresaId]);
  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    if (!empresaId || visao === null) return;
    return assinarTabela(
      {
        topico: `chips:${empresaId}`,
        escutas: [
          { tabela: 'numeros_whatsapp',  filtro: `empresa_id=eq.${empresaId}` },
          { tabela: 'numeros_celulares', filtro: `empresa_id=eq.${empresaId}` },
        ],
      },
      {
        onEvento:      () => { void carregar(); },
        onReconectado: () => { void carregar(); },
      },
    );
  }, [empresaId, visao, carregar]);

  // `posse === 'setor'` em ambos: o que ainda está no Núcleo não chega aqui,
  // mas conferir é barato e deixa a intenção escrita.
  const semOperador = useMemo(
    () => numeros.filter(n => n.posse === 'setor' && n.operador_id === null),
    [numeros],
  );
  const comOperador = useMemo(
    () => numeros.filter(n => n.posse === 'setor' && n.operador_id !== null),
    [numeros],
  );
  const comigo = useMemo(
    () => (meuId ? numeros.filter(n => n.operador_id === meuId) : []),
    [numeros, meuId],
  );

  return {
    visao, numeros, celulares, semOperador, comOperador, comigo, meuId,
    loading: loading || permLoading, erro, recarregar: carregar,
  };
}
