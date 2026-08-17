/**
 * logs-permissao-vs-rls.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A permissão `ver_logs` abre a ABA. O RLS decide quem LÊ a trilha. São dois
 * sistemas diferentes, e em 17/08/2026 eles discordavam:
 *
 *   • o catálogo concedia `ver_logs` por padrão a gerência e diretoria;
 *   • a política `logs_sis_admin` só admite `fn_user_is_super_admin()` ou o
 *     cargo `administrador` — que NÃO EXISTE nesta base (os cargos são
 *     diretoria, elite, gerencia, lider, operador, ouvidoria, super_admin).
 *
 * Resultado em produção: dois diretores da PaguePlay viam a aba de Logs e
 * recebiam ZERO linhas, e mais dois cargos (elite, gerência) estavam liberados
 * esperando alguém para afetar. `fn_logs_resumo` é SECURITY INVOKER, então até
 * os números do painel vinham zerados. Nenhum erro na tela — só o vazio, que
 * qualquer um lê como sistema quebrado.
 *
 * Este teste não acopla os dois sistemas: acoplá-los deixaria uma permissão de
 * tela conceder acesso a dado de auditoria, que é exatamente o que não se quer.
 * Ele apenas impede a DIVERGÊNCIA de voltar — conceder a aba a quem o banco vai
 * calar.
 *
 * Se um dia a trilha tiver de ser aberta a mais gente, mexa nos dois lados na
 * mesma migration e este teste passa a exigir o par.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PERMISSOES, CARGOS_CONFIGURAVEIS } from '../permissoes-catalogo';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

/**
 * Os cargos que a política `logs_sis_admin` admite, extraídos do SQL.
 *
 * Lê a definição MAIS RECENTE, pelo nome ordenável do arquivo: se uma migration
 * futura reescrever a política, o teste passa a comparar contra ela em vez de
 * contra uma cópia envelhecida aqui.
 */
function cargosQueLeemATrilha(): { cargos: string[]; superAdmin: boolean } {
  const arquivo = fs.readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find(f => /CREATE\s+POLICY\s+"?logs_sis_admin"?/i
      .test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')));

  if (!arquivo) throw new Error('Nenhuma migration define a política logs_sis_admin.');

  const sql = fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8');
  const linha = sql.split('\n').find(l => /CREATE\s+POLICY\s+"?logs_sis_admin"?/i.test(l));
  if (!linha) throw new Error('Política logs_sis_admin encontrada no arquivo mas não na linha.');

  // `ARRAY['administrador'::"text"]` → ['administrador']
  const arranjo = /ARRAY\s*\[([^\]]*)\]/i.exec(linha);
  const cargos = arranjo
    ? [...arranjo[1].matchAll(/'([^']+)'/g)].map(m => m[1])
    : [];

  return {
    cargos,
    superAdmin: /fn_user_is_super_admin/i.test(linha),
  };
}

const RLS = cargosQueLeemATrilha();

/** Quem o RLS deixa ler, na prática. */
const PODEM_LER = new Set<string>([
  ...RLS.cargos,
  ...(RLS.superAdmin ? ['super_admin'] : []),
]);

const VER_LOGS = PERMISSOES.find(p => p.key === 'ver_logs');

describe('a política do banco continua sendo o piso', () => {
  it('a política existe e admite super_admin', () => {
    expect(RLS.superAdmin, 'logs_sis_admin deixou de admitir super_admin').toBe(true);
  });

  it('o catálogo tem a chave `ver_logs`', () => {
    expect(VER_LOGS, 'a permissão ver_logs saiu do catálogo').toBeDefined();
  });
});

describe('`ver_logs` nunca é concedida a quem o banco vai calar', () => {
  /**
   * O caso exato de 17/08/2026: `padrao: { gerencia: true, diretoria: true }`
   * contra uma política que só admitia super_admin e um cargo inexistente.
   */
  it('nenhum cargo do padrão fica com a aba e sem o conteúdo', () => {
    const prometidos = Object.entries(VER_LOGS!.padrao ?? {})
      .filter(([, liberado]) => liberado === true)
      .map(([cargo]) => cargo);

    const enganados = prometidos.filter(c => !PODEM_LER.has(c));

    expect(
      enganados,
      `Estes cargos abririam a aba de Logs e receberiam zero linhas: `
      + `${enganados.join(', ')}. A política logs_sis_admin admite apenas `
      + `${[...PODEM_LER].join(', ')}. Corrija o padrão OU amplie a política — `
      + `os dois lados, na mesma migration.`,
    ).toEqual([]);
  });

  /**
   * O cargo `administrador` está na política por herança e não existe como
   * perfil real nesta base. Deixá-lo lá é inofensivo — o que não pode é alguém
   * concluir que "administrador tem acesso" e conceder `ver_logs` a um cargo
   * real por analogia.
   */
  it('a política cita `administrador`, que não é cargo configurável', () => {
    if (!RLS.cargos.includes('administrador')) return;   // já foi limpo: ótimo
    expect(
      (CARGOS_CONFIGURAVEIS as readonly string[]).includes('administrador'),
      'se `administrador` virar cargo configurável, revise logs_sis_admin',
    ).toBe(false);
  });

  it('o padrão de `ver_logs` está vazio hoje', () => {
    // Documenta a decisão de 17/08/2026: só super_admin lê a trilha, e a
    // permissão não é concedida por padrão a ninguém.
    expect(Object.keys(VER_LOGS!.padrao ?? {})).toEqual([]);
  });
});

/**
 * A migration que desligou a permissão tem de continuar existindo — sem ela,
 * um banco restaurado de backup antigo volta com as 6 pessoas na mesma
 * situação.
 */
describe('a correção está registrada em migration', () => {
  it('existe migration que desliga `ver_logs` fora de super_admin', () => {
    const achou = fs.readdirSync(MIGRATIONS)
      .filter(f => f.endsWith('.sql'))
      .some(f => {
        const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
        return /jsonb_set\s*\(\s*permissoes\s*,\s*'\{ver_logs\}'/i.test(sql);
      });
    expect(achou).toBe(true);
  });
});
