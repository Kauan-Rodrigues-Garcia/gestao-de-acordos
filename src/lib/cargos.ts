/**
 * O cadastro de cargos — espelho de `public.cargos` (migration 20261002173500).
 *
 * ## Por que existe
 *
 * O cargo era só texto em `perfis.perfil`, e o que cada cargo É (se pertence a
 * setor, se conta no recebimento, se tem acesso total) estava respondido em
 * uma dúzia de listas soltas: `PERFIS_ESCOPO_EMPRESA`, `CARGOS_ACESSO_TOTAL`,
 * `PERFIS_QUE_CONTAM_NO_RECEBIMENTO`, `CARGOS_FORA_DO_NUCLEO`... Cada cargo
 * novo exigia lembrar de todas, e `PERFIL_NIVEL` já tinha esquecido `rh` e
 * `assistente_adm`.
 *
 * Aqui cada cargo é UMA linha com atributos, e as listas saem deles.
 *
 * ## Desde a fase 3, a fonte das listas
 *
 * `PERFIS_ESCOPO_EMPRESA`, `CARGOS_ACESSO_TOTAL`, `PERFIL_LABELS` e as demais
 * saem de `CARGOS_DERIVADOS`, lá embaixo. O teste `__tests__/cargos.test.ts`
 * prova que as linhas abaixo são as mesmas da migration e fixa o conteúdo de
 * cada lista: mudar um atributo que dá ou tira acesso reprova o teste até
 * alguém decidir isso de propósito.
 *
 * Cargos são GLOBAIS (decisão de 02/10/2026): valem para todas as empresas.
 * O que muda por empresa é a permissão, em `cargos_permissoes`.
 */
import type { PerfilUsuario } from '@/lib/supabase';

export interface Cargo {
  slug:                 PerfilUsuario;
  nome:                 string;
  /** `PERFIL_NIVEL`. `null` onde nunca foi definido (rh, assistente_adm). */
  nivel:                number | null;
  /** Ordem do painel de permissões. */
  ordem:                number;
  /** `false` = cúpula: pertence à empresa, não a um setor. */
  pertence_a_setor:     boolean;
  /** Tipo de setor exclusivo do cargo (`'nucleo'`), ou `null`. */
  exige_tipo_setor:     string | null;
  acesso_total:         boolean;
  conta_no_recebimento: boolean;
  lidera_equipe:        boolean;
  ativo:                boolean;
}

/** As linhas da migration, na mesma ordem. Mudou lá, muda aqui. */
export const CARGOS: readonly Cargo[] = [
  { slug: 'operador',       nome: 'Operador',       nivel: 1,    ordem: 1,  pertence_a_setor: true,  exige_tipo_setor: null,     acesso_total: false, conta_no_recebimento: true,  lidera_equipe: false, ativo: true },
  { slug: 'ouvidoria',      nome: 'Ouvidoria',      nivel: 2,    ordem: 2,  pertence_a_setor: true,  exige_tipo_setor: null,     acesso_total: false, conta_no_recebimento: false, lidera_equipe: false, ativo: true },
  { slug: 'lider',          nome: 'Líder',          nivel: 2,    ordem: 3,  pertence_a_setor: true,  exige_tipo_setor: null,     acesso_total: false, conta_no_recebimento: false, lidera_equipe: true,  ativo: true },
  { slug: 'elite',          nome: 'Elite',          nivel: 3,    ordem: 4,  pertence_a_setor: true,  exige_tipo_setor: null,     acesso_total: false, conta_no_recebimento: true,  lidera_equipe: true,  ativo: true },
  { slug: 'gerencia',       nome: 'Gerência',       nivel: 4,    ordem: 5,  pertence_a_setor: true,  exige_tipo_setor: null,     acesso_total: false, conta_no_recebimento: false, lidera_equipe: false, ativo: true },
  { slug: 'diretoria',      nome: 'Diretoria',      nivel: 5,    ordem: 6,  pertence_a_setor: false, exige_tipo_setor: null,     acesso_total: false, conta_no_recebimento: false, lidera_equipe: false, ativo: true },
  { slug: 'rh',             nome: 'RH',             nivel: null, ordem: 7,  pertence_a_setor: true,  exige_tipo_setor: null,     acesso_total: false, conta_no_recebimento: false, lidera_equipe: false, ativo: true },
  { slug: 'assistente_adm', nome: 'Assistente ADM', nivel: null, ordem: 8,  pertence_a_setor: true,  exige_tipo_setor: 'nucleo', acesso_total: false, conta_no_recebimento: false, lidera_equipe: false, ativo: true },
  { slug: 'administrador',  nome: 'Administrador',  nivel: 6,    ordem: 9,  pertence_a_setor: false, exige_tipo_setor: null,     acesso_total: true,  conta_no_recebimento: false, lidera_equipe: false, ativo: true },
  { slug: 'super_admin',    nome: 'Super Admin',    nivel: 7,    ordem: 10, pertence_a_setor: false, exige_tipo_setor: null,     acesso_total: true,  conta_no_recebimento: false, lidera_equipe: false, ativo: true },
];

const slugs = (cargos: readonly Cargo[], filtro: (c: Cargo) => boolean): PerfilUsuario[] =>
  [...cargos].sort((a, b) => a.ordem - b.ordem).filter(filtro).map(c => c.slug);

/**
 * As listas de hoje, derivadas dos atributos. Recebem o cadastro como
 * parâmetro para servir tanto ao espelho estático quanto ao que vier do banco.
 */
export const derivar = (cargos: readonly Cargo[] = CARGOS) => ({
  /** `PERFIS_ESCOPO_EMPRESA` */
  escopoEmpresa:       slugs(cargos, c => !c.pertence_a_setor),
  /** `CARGOS_ACESSO_TOTAL` e `PERFIS_ADMIN` */
  acessoTotal:         slugs(cargos, c => c.acesso_total),
  /** `CARGOS_CONFIGURAVEIS` */
  configuraveis:       slugs(cargos, c => c.ativo && !c.acesso_total),
  /** `PERFIS_QUE_CONTAM_NO_RECEBIMENTO` */
  contamNoRecebimento: slugs(cargos, c => c.conta_no_recebimento),
  /** `PERFIS_QUE_SO_LIDERAM` */
  soLideram:           slugs(cargos, c => c.lidera_equipe && !c.conta_no_recebimento),
  /**
   * `PERFIS_QUE_SUPERVISIONAM_SETOR` — cuidam de um setor sem receber nem
   * liderar equipe (a gerência): a tela do setor no app (06/10/2026).
   */
  supervisionamSetor:  slugs(cargos, c => c.pertence_a_setor && !c.conta_no_recebimento && !c.lidera_equipe
    && !c.acesso_total && c.exige_tipo_setor === null && (c.nivel ?? 0) >= 4),
  /** `CARGO_DO_NUCLEO` */
  doNucleo:            slugs(cargos, c => c.exige_tipo_setor === 'nucleo'),
  /** `CARGOS_FORA_DO_NUCLEO`: pertencem a setor e não são exclusivos de um tipo. */
  foraDoNucleo:        slugs(cargos, c => c.pertence_a_setor && c.exige_tipo_setor === null),
  /** `PERFIL_LABELS` */
  rotulos:             Object.fromEntries(cargos.map(c => [c.slug, c.nome])) as Record<PerfilUsuario, string>,
  /** `PERFIL_NIVEL`, só onde há nível */
  niveis:              Object.fromEntries(
    cargos.filter(c => c.nivel !== null).map(c => [c.slug, c.nivel as number]),
  ) as Partial<Record<PerfilUsuario, number>>,
});

/**
 * As listas derivadas do espelho estático. É daqui que `lib/index.ts`,
 * `permissoes-catalogo.ts`, `cargoDoNucleo.ts` e `permissoes-chat.ts` tiram as
 * listas de cargo desde a fase 3 — nenhuma delas é mais escrita à mão.
 */
export const CARGOS_DERIVADOS = derivar();

/*
 * ── O cadastro vivo ─────────────────────────────────────────────────────────
 *
 * Desde a tela de Cargos (Configurações > Cargos) o cadastro muda pelo painel,
 * sem deploy. As listas acima são exportadas como valores (`PERFIS_ADMIN`,
 * `PERFIL_LABELS`...) e lidas fora do React, então em vez de trocá-las por
 * funções o cadastro lido do banco é aplicado DENTRO dos mesmos objetos:
 * quem guardou a referência passa a ver o conteúdo novo. O espelho estático
 * continua valendo até a leitura chegar, e se ela falhar.
 */

let cadastroAtual: readonly Cargo[] = CARGOS;
let versaoCadastro = 0;
const ouvintes = new Set<() => void>();

/** Troca o conteúdo das listas derivadas pelo cadastro lido do banco. */
export function aplicarCadastro(lidos: readonly Cargo[]): void {
  if (!lidos.length) return;
  cadastroAtual = [...lidos].sort((a, b) => a.ordem - b.ordem);
  const novo = derivar(cadastroAtual);
  const alvo = CARGOS_DERIVADOS as Record<string, unknown>;
  for (const [chave, valor] of Object.entries(novo)) {
    const atual = alvo[chave];
    if (Array.isArray(atual) && Array.isArray(valor)) {
      atual.splice(0, atual.length, ...valor);
    } else if (atual && typeof atual === 'object') {
      const registro = atual as Record<string, unknown>;
      for (const k of Object.keys(registro)) delete registro[k];
      Object.assign(registro, valor);
    }
  }
  versaoCadastro += 1;
  ouvintes.forEach(fn => fn());
}

/** O cadastro em uso agora: o do banco, ou o espelho estático. */
export function cargosAtuais(): readonly Cargo[] {
  return cadastroAtual;
}

export function assinarCadastro(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

export function versaoDoCadastro(): number {
  return versaoCadastro;
}

/**
 * O slug de um cargo novo, a partir do nome: «Supervisor de Qualidade» vira
 * `supervisor_de_qualidade`. O banco aceita só `^[a-z][a-z_]*$`.
 */
export function slugDoNome(nome: string): string {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
