/**
 * useVendasPlacar — o cadastro que os painéis do Comercial perguntam.
 *
 * Uma ida ao banco por mês, e três respostas que a lista de vendas não dá:
 * quem é robô, em que equipe a pessoa credita, e quantos dias úteis ela perdeu
 * em ausência que abate meta.
 *
 * ## Por que não vive dentro de `useVendas`
 *
 * Porque muda noutro ritmo. A lista de vendas se remonta a cada confirmação do
 * líder — tempo real, canal de `postgres_changes`. O cadastro muda quando
 * alguém troca de equipe ou lança um atestado, o que acontece uma vez por
 * semana. Amarrar os dois recarregaria o cadastro inteiro a cada venda
 * lançada, de graça.
 *
 * ## A presença é montada aqui, e não no banco
 *
 * O banco devolve os dias perdidos POR PESSOA. Quem soma por setor e por
 * equipe é este hook, porque a régua de quem pertence a qual recorte já mora
 * em `vendasPlacar.ts` e duplicá-la em SQL criaria dois lugares para ela
 * divergir.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { indexarPessoas, type IndicePessoas } from '@/lib/vendasPlacar';
import type { PresencaDoRecorte } from '@/lib/vendasMeta';
import {
  buscarPessoasDoPlacar, type PessoaComAusencia,
} from '@/services/vendas/placar.service';

interface Params {
  empresaId: string | null;
  /** 'yyyy-MM'. Define de que mês é a conta de ausência. */
  mes: string;
  /** `false` congela: não busca nada. */
  ativo: boolean;
}

export interface PlacarDeVendas {
  pessoas: PessoaComAusencia[];
  /** O índice por id, que `vendasPlacar.ts` consome. */
  indice: IndicePessoas;
  /**
   * A presença de cada setor e de cada equipe, indexada pelo id do recorte —
   * a mesma chave que `metas.referencia_id` usa.
   */
  presencaPorRecorte: ReadonlyMap<string, PresencaDoRecorte>;
  /** Dias úteis do mês, como o BANCO os contou. Zero antes da primeira resposta. */
  diasUteisDoMes: number;
  carregando: boolean;
  /** `false` enquanto a migration da Fase 9 não for aplicada. */
  disponivel: boolean;
  erro: string | null;
  recarregar: () => void;
}

const SEM_PESSOAS: PessoaComAusencia[] = [];
const INDICE_VAZIO: IndicePessoas = new Map();
const PRESENCA_VAZIA: ReadonlyMap<string, PresencaDoRecorte> = new Map();

/**
 * Quem entra na conta de capacidade de um recorte.
 *
 * Robô fica de fora dos dois lados da divisão: automação não tira férias, e
 * somá-la ao denominador diluiria o desconto de quem tirou. Desligado também
 * sai — o perfil dele existe para a venda ter dono, não para inflar a equipe.
 */
function contaNaCapacidade(p: PessoaComAusencia): boolean {
  return !p.robo && p.situacao !== 'desligado';
}

export function useVendasPlacar({ empresaId, mes, ativo }: Params): PlacarDeVendas {
  const [pessoas, setPessoas] = useState<PessoaComAusencia[]>(SEM_PESSOAS);
  const [carregando, setCarregando] = useState(false);
  const [disponivel, setDisponivel] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId || !ativo) return;
    setCarregando(true);
    const r = await buscarPessoasDoPlacar(empresaId, mes);
    setPessoas(r.pessoas);
    setDisponivel(r.disponivel);
    // «Não instalada» já virou `disponivel: false`, e a tela diz isso com
    // outras palavras. Repetir o erro cru mostraria as duas mensagens.
    setErro(r.disponivel ? r.erro : null);
    setCarregando(false);
  }, [empresaId, mes, ativo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const indice = useMemo(
    () => (pessoas.length ? indexarPessoas(pessoas) : INDICE_VAZIO),
    [pessoas],
  );

  const presencaPorRecorte = useMemo(() => {
    if (pessoas.length === 0) return PRESENCA_VAZIA;

    const uteis = pessoas[0].diasUteisDoMes;
    // Sem dias úteis não há capacidade, e `fatorDePresenca` devolveria `null`
    // para toda linha. Devolver o mapa vazio diz a mesma coisa mais cedo.
    if (uteis <= 0) return PRESENCA_VAZIA;

    const mapa = new Map<string, { pessoas: number; diasAbatidos: number }>();
    const somar = (chave: string | null, dias: number) => {
      if (!chave) return;
      const atual = mapa.get(chave);
      if (atual) { atual.pessoas += 1; atual.diasAbatidos += dias; }
      else mapa.set(chave, { pessoas: 1, diasAbatidos: dias });
    };

    for (const p of pessoas) {
      if (!contaNaCapacidade(p)) continue;
      somar(p.setor_id, p.diasAbatidos);
      somar(p.equipe_id, p.diasAbatidos);
    }

    return new Map(
      [...mapa].map(([chave, v]) => [chave, { uteis, ...v }] as const),
    );
  }, [pessoas]);

  return {
    pessoas,
    indice,
    presencaPorRecorte,
    diasUteisDoMes: pessoas[0]?.diasUteisDoMes ?? 0,
    carregando,
    disponivel,
    erro,
    recarregar: () => { void carregar(); },
  };
}
