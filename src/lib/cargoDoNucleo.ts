/**
 * cargoDoNucleo — a regra do cargo Assistente ADM, do lado da tela.
 *
 * ## A regra
 *
 * O Núcleo de Inteligência e Gestão tem cargo próprio desde 11/09/2026, e ele é
 * exclusivo nos dois sentidos:
 *
 *   - `assistente_adm` só existe no setor apontado em `numeros_config`;
 *   - o setor do Núcleo só aceita `assistente_adm`.
 *
 * Administrador e super_admin atravessam as duas — acesso total não tem lado.
 *
 * ## Quem manda é o banco
 *
 * `fn_perfis_cargo_do_nucleo` (migration 20260911121000) recusa a combinação
 * errada em toda porta: cadastro, edição, transferência, SQL Editor. Este arquivo
 * é o espelho, e existe por um motivo prático: no cadastro a recusa chega como
 * «Database error» — o `signUp` engole a mensagem da trigger —, e a tela precisa
 * dizer o motivo ANTES de ir até lá.
 *
 * ## Sem Núcleo configurado
 *
 * `setorNucleoId = null` quer dizer «não se sabe qual setor é o Núcleo»: a
 * empresa não tem o módulo, ou a migration ainda não foi aplicada. Aí o
 * Assistente ADM não é oferecido — o banco o recusaria — e nenhum outro cargo é
 * barrado.
 *
 * Não é decisão de acesso por cargo: é o filtro de CADASTRO que diz em que setor
 * um cargo pode ser gravado, da mesma família de `AdminEquipes` escolhendo quem
 * pode ser líder. O que cada cargo enxerga continua saindo do painel.
 */
import type { PerfilUsuario } from '@/lib/supabase';

/** O cargo do Núcleo. Uma constante, e não o literal espalhado pelas telas. */
export const CARGO_DO_NUCLEO = 'assistente_adm' as const satisfies PerfilUsuario;

/** Acesso total atravessa a trava. Espelha o primeiro `IF` da trigger. */
const ATRAVESSAM: readonly string[] = ['administrador', 'super_admin'];

/**
 * Os cargos oferecidos a quem SAI do Núcleo numa transferência: os que
 * pertencem a um setor. A cúpula fica de fora — ela não tem setor, e a
 * transferência é justamente mudar alguém de setor.
 */
export const CARGOS_FORA_DO_NUCLEO: readonly PerfilUsuario[] = [
  'operador', 'lider', 'elite', 'gerencia', 'ouvidoria', 'rh',
];

/**
 * Por que este cargo não pode ser gravado neste setor — ou `null` quando pode.
 *
 * `setorId` é o setor que vai ser GRAVADO. Para a cúpula (empresa inteira) quem
 * chama passa `null`: o gatilho `a_trg_perfis_escopo_empresa` zera o vínculo
 * antes de a trava olhar. As frases são as da trigger, para a tela e o banco
 * dizerem a mesma coisa.
 */
export function motivoCargoForaDoSetor(
  cargo: string, setorId: string | null, setorNucleoId: string | null,
): string | null {
  if (ATRAVESSAM.includes(cargo)) return null;

  if (cargo === CARGO_DO_NUCLEO) {
    if (!setorNucleoId) {
      return 'Assistente ADM é o cargo do Núcleo de Inteligência e Gestão, e esta '
        + 'empresa não tem o Núcleo configurado.';
    }
    return setorId === setorNucleoId
      ? null
      : 'Assistente ADM só pode estar no setor Núcleo de Inteligência e Gestão.';
  }

  if (setorNucleoId && setorId === setorNucleoId) {
    return 'O setor Núcleo de Inteligência e Gestão só aceita o cargo Assistente ADM.';
  }
  return null;
}

/** O cargo pode ser gravado neste setor? */
export function cargoCabeNoSetor(
  cargo: string, setorId: string | null, setorNucleoId: string | null,
): boolean {
  return motivoCargoForaDoSetor(cargo, setorId, setorNucleoId) === null;
}

interface FormularioDeCargo {
  perfil: PerfilUsuario;
  setor_id: string;
}

/**
 * O formulário de cadastro depois de trocar o CARGO, com cargo e setor coerentes.
 *
 *   - virou Assistente ADM → o setor vai para o Núcleo, e trava lá;
 *   - deixou de ser Assistente ADM estando no Núcleo → o setor vai para o
 *     primeiro que não é o Núcleo, o mesmo «primeiro da lista» que a criação já
 *     usa. Ficar no Núcleo com o cargo novo seria recusado.
 */
export function aoTrocarCargo<F extends FormularioDeCargo>(
  form: F,
  cargo: PerfilUsuario,
  ctx: { setorNucleoId: string | null; setores: readonly { id: string }[] },
): F {
  const { setorNucleoId } = ctx;

  if (cargo === CARGO_DO_NUCLEO && setorNucleoId) {
    return { ...form, perfil: cargo, setor_id: setorNucleoId };
  }
  if (setorNucleoId && form.setor_id === setorNucleoId && !ATRAVESSAM.includes(cargo)) {
    const outro = ctx.setores.find(s => s.id !== setorNucleoId)?.id ?? '';
    return { ...form, perfil: cargo, setor_id: outro };
  }
  return { ...form, perfil: cargo };
}

/**
 * O formulário de cadastro depois de trocar o SETOR.
 *
 * Escolher o Núcleo põe o cargo em Assistente ADM — é o único que ele aceita.
 * O caminho inverso não chega aqui: quem é Assistente ADM tem o setor travado
 * no Núcleo e não troca.
 */
export function aoTrocarSetor<F extends FormularioDeCargo>(
  form: F,
  setorId: string,
  ctx: { setorNucleoId: string | null },
): F {
  if (ctx.setorNucleoId && setorId === ctx.setorNucleoId && !ATRAVESSAM.includes(form.perfil)) {
    return { ...form, setor_id: setorId, perfil: CARGO_DO_NUCLEO };
  }
  return { ...form, setor_id: setorId };
}

/**
 * O que acontece com o cargo de alguém que vai para este setor.
 *
 *   `'manter'` ......... o cargo atual cabe no destino — a transferência comum;
 *   `CARGO_DO_NUCLEO` .. vai ENTRAR no Núcleo: vira Assistente ADM;
 *   `'escolher'` ....... vai SAIR do Núcleo: quem transfere escolhe o cargo novo.
 */
export function ajusteDeCargoNaTransferencia(
  cargoAtual: string, destinoSetorId: string | null, setorNucleoId: string | null,
): 'manter' | 'escolher' | typeof CARGO_DO_NUCLEO {
  if (cargoCabeNoSetor(cargoAtual, destinoSetorId, setorNucleoId)) return 'manter';
  if (setorNucleoId && destinoSetorId === setorNucleoId) return CARGO_DO_NUCLEO;
  return 'escolher';
}
