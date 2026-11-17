/**
 * visaoDaEmpresa.ts — como chamar uma empresa no seletor e na aba Multiempresa.
 *
 * ## Por que não o nome do cadastro
 *
 * O nome da linha de `empresas` («BOOKPLAY», «PAGUEPLAY») é onde o cadastro
 * mora, não o que a pessoa vai ver ao trocar. Desde 04/10/2026 (CLAUDE.md,
 * «Cofen não é PaguePlay»):
 *
 *   - o que muda a TELA é a regra de negócio do setor: Nosso produto, Cofen —
 *     e, fora da cobrança, o produto (Comercial, Cantina, RH);
 *   - BookPlay / PaguePlay é só a MARCA, dada pela cidade do setor
 *     (Birigui = BookPlay, Marília = PaguePlay, `lib/marca.ts`).
 *
 * A empresa BOOKPLAY guarda os setores de Birigui E de Marília, todos Nosso
 * produto; a PAGUEPLAY guarda o Conecta Play, Cofen. Chamar a primeira de
 * «BookPlay» escondia Marília, e chamar a segunda de «PaguePlay» dizia que a
 * marca PaguePlay é Cofen — que é justamente o que deixou de ser verdade.
 *
 * Quem fornece regras e cidades é `fn_empresas_visao()` (migration
 * 20261117190000). Sem ela, cai no nome do cadastro.
 */
import { ROTULO_REGRA, ehRegraDoSetor, type RegraDoSetor } from '@/lib/regraDoSetor';
import { marcaDaCidade } from '@/lib/marca';

export interface VisaoEmpresaBruta {
  empresa_id: string;
  nome: string;
  slug: string;
  produto: string | null;
  regras: string[] | null;
  cidades: string[] | null;
  setores: string[] | null;
}

export interface VisaoEmpresa {
  /** O que a tela mostra em destaque: a regra ou o produto. */
  titulo: string;
  /** Marcas/cidades ou setores — de onde vem quem trabalha ali. */
  detalhe: string | null;
  /** As regras dos setores, quando é cobrança. */
  regras: RegraDoSetor[];
}

const PRODUTO: Readonly<Record<string, string>> = {
  comercial: 'Comercial',
  cantina:   'Cantina',
  rh:        'RH',
};

function marcasDasCidades(cidades: string[]): string | null {
  const partes: string[] = [];
  const vistas = new Set<string>();
  for (const cidade of cidades) {
    const marca = marcaDaCidade(cidade);
    const texto = marca ? `${marca.nome} (${cidade})` : cidade;
    if (vistas.has(texto)) continue;
    vistas.add(texto);
    partes.push(texto);
  }
  return partes.length ? partes.join(' · ') : null;
}

/** A visão de uma empresa, a partir do que `fn_empresas_visao` devolve. */
export function visaoDaEmpresa(bruta: VisaoEmpresaBruta | null | undefined, nomeReserva = ''): VisaoEmpresa {
  if (!bruta) return { titulo: nomeReserva, detalhe: null, regras: [] };

  const regras = (bruta.regras ?? []).filter(ehRegraDoSetor);
  const cidades = bruta.cidades ?? [];
  const setores = bruta.setores ?? [];

  if (bruta.produto && PRODUTO[bruta.produto]) {
    return { titulo: PRODUTO[bruta.produto], detalhe: null, regras: [] };
  }

  if (bruta.produto === 'cobranca' || regras.length) {
    if (regras.length === 0) return { titulo: bruta.nome, detalhe: null, regras };

    const titulo = regras
      .slice()
      .sort((a, b) => (a === 'nosso_produto' ? -1 : b === 'nosso_produto' ? 1 : 0))
      .map(r => ROTULO_REGRA[r])
      .join(' + ');

    // Cofen se reconhece pelo setor (Conecta Play); Nosso produto, pelas marcas.
    const detalhe = regras.length === 1 && regras[0] === 'cofen'
      ? (setores.join(' · ') || marcasDasCidades(cidades))
      : marcasDasCidades(cidades);

    return { titulo, detalhe, regras };
  }

  return { titulo: bruta.nome, detalhe: null, regras: [] };
}

/** Índice por id, para quem tem a lista de empresas e quer o rótulo de cada uma. */
export function indexarVisoes(lista: VisaoEmpresaBruta[]): Map<string, VisaoEmpresa> {
  return new Map(lista.map(v => [v.empresa_id, visaoDaEmpresa(v, v.nome)]));
}
