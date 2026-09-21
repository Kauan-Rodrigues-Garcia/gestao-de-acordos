/**
 * useChipsFisicos — a separação Chips Físicos, com o alcance de quem olha.
 *
 * ## Três alcances
 *
 *   proprios .. só os chips da própria pessoa (`ver_chips_fisicos`);
 *   setor ..... os do setor inteiro — a escada da aba `chips` chega ao setor;
 *   todos ..... os de todos os setores (`chips_fisicos_todos_setores`).
 *
 * Como em `useMeusChips`, o BANCO recorta (policy `chips_fisicos_select`) e a
 * tela só pergunta o alcance para saber o que DESENHAR: os blocos por pessoa, o
 * filtro de setor, o seletor de pessoa no cadastro. Nada aqui filtra o que veio.
 *
 * ## Sem tempo real
 *
 * A tabela não entra no Realtime (migration 20260921160000). A lista é relida
 * ao voltar para a aba do navegador e depois de cada ação — o que muda um chip
 * é uma pessoa clicando, e ela vê o resultado na hora.
 *
 * ## Tabela ausente
 *
 * Antes de a migration ser aplicada, a leitura volta `PGRST205`. Em vez de um
 * erro genérico, `instalado` vira `false` e a tela explica.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { escopoEfetivo } from '@/lib/permissoes-escopo';
import { reconciliarLista } from '@/lib/dadosVivos';
import {
  eTabelaAusente, listarChipsFisicos, listarPessoas, mensagemDeErro,
  type ChipFisicoRow, type PessoaChipRow,
} from '@/services/chipsFisicos/chipsFisicos.service';
import { listarSetores, type SetorNome } from '@/services/numeros/numeros.service';

export type AlcanceChipsFisicos = 'proprios' | 'setor' | 'todos';

interface Retorno {
  /** `false` = a separação está fechada para esta pessoa. */
  habilitado: boolean;
  alcance: AlcanceChipsFisicos;
  /** Pode cadastrar e alterar pelos colegas que enxerga. */
  podeCuidarColegas: boolean;
  chips: ChipFisicoRow[];
  /** Por id: quem a tela sabe nomear. Na visão «proprios», só a própria pessoa. */
  pessoas: Map<string, PessoaChipRow>;
  /** Os setores da empresa, para o filtro e os títulos da visão «todos». */
  setores: SetorNome[];
  meuId: string | null;
  meuSetorId: string | null;
  instalado: boolean;
  loading: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useChipsFisicos(): Retorno {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao, loading: permLoading } = useCargoPermissoes();

  const empresaId = empresa?.id ?? null;
  const meuId = perfil?.id ?? null;
  const meuSetorId = perfil?.setor_id ?? null;

  const habilitado = !permLoading && temPermissao('ver_chips_fisicos');
  const alcance = useMemo<AlcanceChipsFisicos>(() => {
    if (temPermissao('chips_fisicos_todos_setores')) return 'todos';
    return escopoEfetivo('chips', temPermissao) === 'setor' ? 'setor' : 'proprios';
  }, [temPermissao]);
  const podeCuidarColegas = temPermissao('chips_fisicos_gerenciar_setor');

  const [chips, setChips]         = useState<ChipFisicoRow[]>([]);
  const [listaPessoas, setListaPessoas] = useState<PessoaChipRow[]>([]);
  const [setores, setSetores]     = useState<SetorNome[]>([]);
  const [instalado, setInstalado] = useState(true);
  const [loading, setLoading]     = useState(true);
  const [erro, setErro]           = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId || !habilitado) {
      setChips([]); setListaPessoas([]); setLoading(false);
      return;
    }
    try {
      const lidos = await listarChipsFisicos(empresaId);
      setChips(anterior => reconciliarLista(anterior, lidos, { chave: c => c.id }));
      setInstalado(true);
      setErro(null);
    } catch (e) {
      if (eTabelaAusente(e)) {
        setInstalado(false);
        setChips([]);
      } else {
        setErro(mensagemDeErro(e));
      }
      setLoading(false);
      return;
    }

    // Os nomes vêm depois, e uma falha aqui não apaga a lista: sem nome, o
    // bloco diz «Pessoa não encontrada», e o chip continua na tela.
    try {
      const [pessoas, sets] = await Promise.all([
        // Quem enxerga o setor mas não tem setor não tem quem nomear além de si.
        alcance === 'proprios' || (alcance === 'setor' && !meuSetorId)
          ? Promise.resolve<PessoaChipRow[]>([])
          : listarPessoas(empresaId, alcance === 'setor' ? meuSetorId : null),
        alcance === 'todos' ? listarSetores(empresaId) : Promise.resolve<SetorNome[]>([]),
      ]);
      setListaPessoas(pessoas);
      setSetores(sets);
    } catch {
      // Mantém o que já havia.
    } finally {
      setLoading(false);
    }
  }, [empresaId, habilitado, alcance, meuSetorId]);

  // A chave chegando depois das permissões também é «primeira carga»: sem isto
  // a tela piscaria «nenhum chip» antes da lista.
  useEffect(() => { setLoading(true); }, [empresaId, habilitado]);
  useEffect(() => { void carregar(); }, [carregar]);

  // Relê quando a pessoa volta para a aba: é quando a lista pode ter mudado
  // pelas mãos de outra pessoa.
  useEffect(() => {
    if (!habilitado) return;
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void carregar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [habilitado, carregar]);

  const pessoas = useMemo(() => {
    const mapa = new Map(listaPessoas.map(p => [p.id, p]));
    // A própria pessoa sempre tem nome, mesmo na visão «proprios».
    if (perfil?.id && !mapa.has(perfil.id)) {
      mapa.set(perfil.id, {
        id: perfil.id,
        nome: perfil.nome ?? 'Você',
        foto_url: (perfil as { foto_url?: string | null }).foto_url ?? null,
        setor_id: perfil.setor_id ?? null,
        ativo: true,
      });
    }
    return mapa;
  }, [listaPessoas, perfil]);

  return {
    habilitado, alcance, podeCuidarColegas, chips, pessoas, setores,
    meuId, meuSetorId, instalado, loading, erro, recarregar: carregar,
  };
}
