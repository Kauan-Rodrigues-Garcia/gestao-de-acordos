/**
 * De que empresa a pessoa sai e para qual ela vai, numa transferência.
 *
 * ## Por que não é a empresa da tela
 *
 * Desde o Usuários 2.0 (04/10/2026) a lista da cobrança junta BookPlay e
 * PaguePlay, e o seletor de setor do `DialogTransferencia` mostra os setores
 * das duas. O diálogo tomava a empresa aberta na tela como origem E destino:
 * escolher o Conecta Play (PaguePlay) para alguém do Play 5 (BookPlay) virava
 * uma troca de SETOR, o UPDATE gravava só o `setor_id`, e a FK composta
 * `perfis_setor_da_empresa_fkey` (20261002210000) recusava com 409 — o caso da
 * Layane Brito, 08/10/2026.
 *
 * Quem diz a empresa é o dado, não a tela: a de origem é a do perfil, e a de
 * destino é a do setor escolhido.
 */
import type { Perfil, Setor } from '@/lib/supabase';
import { marcaDaCidade } from '@/lib/marca';

/** A empresa de onde a pessoa sai: a do perfil dela. */
export function empresaDeOrigem(
  perfil: Pick<Perfil, 'empresa_id'>, empresaDaTela: string,
): string {
  return perfil.empresa_id || empresaDaTela;
}

/**
 * A empresa para onde a pessoa vai: a do setor escolhido. Sem setor (ou setor
 * sem `empresa_id`), a escolhida no campo Empresa, e por fim a da tela.
 */
export function empresaDoDestino(
  setor: Pick<Setor, 'empresa_id'> | null | undefined,
  empresaEscolhida: string | null | undefined,
  empresaDaTela: string,
): string {
  return setor?.empresa_id || empresaEscolhida || empresaDaTela;
}

/** Os setores da lista vêm de mais de uma empresa? Então o nome precisa dela. */
export function setoresDeVariasEmpresas(setores: Pick<Setor, 'empresa_id'>[]): boolean {
  return new Set(setores.map(s => s.empresa_id).filter(Boolean)).size > 1;
}

// ── O destino pela MARCA, não pela empresa (19/10/2026) ─────────────────────
//
// O campo «Empresa» do diálogo ainda separava BookPlay e PaguePlay como
// empresas: escolher PaguePlay listava os setores da EMPRESA PaguePlay, e não
// os de Marília. Mas BookPlay e PaguePlay são só a marca, e quem diz a marca é
// a cidade do setor (`lib/marca.ts`): Birigui é BookPlay, Marília é PaguePlay
// — o Conecta Play incluído, que é de Marília com a regra Cofen. A empresa de
// destino continua saindo do setor escolhido (`empresaDoDestino`).

/** Uma opção do campo de destino: uma marca (pela cidade) ou uma empresa sem marca. */
export interface GrupoDeDestino<S> {
  chave: string;
  rotulo: string;
  setores: S[];
}

type SetorDoGrupo = Pick<Setor, 'id' | 'nome' | 'empresa_id' | 'cidade_id'>;

/**
 * Os setores agrupados para o campo de destino: «BookPlay · Birigui»,
 * «PaguePlay · Marília» e, depois, cada empresa com setores fora das duas
 * cidades (pelo nome da empresa). Grupo vazio não aparece.
 */
export function gruposDeDestino<S extends SetorDoGrupo>(
  setores: readonly S[],
  cidades: readonly { id: string; nome: string }[],
  empresas: readonly { id: string; nome: string }[],
): GrupoDeDestino<S>[] {
  const nomeDaCidade = new Map(cidades.map(c => [c.id, c.nome]));
  const bookplay: S[] = [];
  const pagueplay: S[] = [];
  const porEmpresa = new Map<string, S[]>();
  for (const s of setores) {
    const marca = marcaDaCidade(s.cidade_id ? nomeDaCidade.get(s.cidade_id) : null);
    if (marca?.nome === 'BookPlay') bookplay.push(s);
    else if (marca?.nome === 'PaguePlay') pagueplay.push(s);
    else {
      const e = s.empresa_id ?? '';
      porEmpresa.set(e, [...(porEmpresa.get(e) ?? []), s]);
    }
  }
  const porNome = (a: S, b: S) => a.nome.localeCompare(b.nome, 'pt-BR');
  const grupos: GrupoDeDestino<S>[] = [
    { chave: 'marca:bookplay', rotulo: 'BookPlay · Birigui', setores: bookplay.sort(porNome) },
    { chave: 'marca:pagueplay', rotulo: 'PaguePlay · Marília', setores: pagueplay.sort(porNome) },
  ];
  const nomeDaEmpresa = new Map(empresas.map(e => [e.id, e.nome]));
  const outras = [...porEmpresa.entries()]
    .map(([id, lista]) => ({
      chave: `empresa:${id}`,
      rotulo: nomeDaEmpresa.get(id) ? `${nomeDaEmpresa.get(id)} · sem cidade` : 'Sem cidade',
      setores: lista.sort(porNome),
    }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  return [...grupos, ...outras].filter(g => g.setores.length > 0);
}

/** O grupo em que está o setor (o da pessoa, ao abrir o diálogo). */
export function grupoDoSetor<S extends SetorDoGrupo>(
  grupos: readonly GrupoDeDestino<S>[], setorId: string | null | undefined,
): string | null {
  if (!setorId) return null;
  return grupos.find(g => g.setores.some(s => s.id === setorId))?.chave ?? null;
}
