/**
 * supabaseNode.ts — o cliente do robô, no lugar do cliente do navegador.
 *
 * ## Por que este arquivo existe
 *
 * O robô não reimplementa a importação: ele chama `importarMestre59`, a MESMA
 * função que a tela chama. Aquela função depende de `@/lib/supabaseSemTipo`,
 * que depende de `@/lib/supabase` — um cliente montado para o navegador, com
 * sessão em `localStorage` e refresh automático.
 *
 * No empacotamento (`build.mjs`), `@/lib/supabase` é apontado para cá. Nada no
 * caminho de importação muda: o parser é o mesmo, o mapeamento das 28 colunas é
 * o mesmo, a ordem abrir → inserir → promover é a mesma.
 *
 * É essa a razão de o robô ser Node e não um script em PowerShell. Reescrever a
 * leitura do CSV noutra linguagem criaria uma segunda interpretação do mesmo
 * arquivo — e duas interpretações divergem num dia qualquer, em silêncio.
 *
 * ## O cliente é preguiçoso, e isso não é detalhe
 *
 * Criá-lo no carregamento do módulo faz a falta de uma variável estourar ANTES
 * de qualquer `try`, e o que aparece é um stack trace de importação de módulo.
 * Quem está instalando isso às sete da manhã merece ler «falta ROBO_EMAIL», não
 * quarenta linhas de `node:internal/modules`.
 *
 * O `Proxy` adia a criação até o primeiro uso, sem mudar nada para quem importa
 * `supabase` — que continua sendo um objeto com `.rpc` e `.from`.
 *
 * ## A sessão não é persistida
 *
 * `persistSession: false` porque não há navegador: cada execução entra, faz o
 * trabalho e sai. `autoRefreshToken: false` pelo mesmo motivo — o token dura
 * muito mais que os segundos da importação, e um timer de refresh só seguraria
 * o processo aberto depois do fim.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pareceEmailEntregavel } from '../../src/lib/identificadorLogin';
import { obrigatorio } from './env';

/** O robô só existe para a BookPlay — é o único tenant que tem o 59. */
const TENANT_DO_ROBO = 'bookplay';

let real: SupabaseClient | null = null;

function cliente(): SupabaseClient {
  real ??= createClient(
    obrigatorio('SUPABASE_URL'),
    obrigatorio('SUPABASE_ANON_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-robo': 'robo59' } },
    },
  );
  return real;
}

/**
 * O mesmo nome que `@/lib/supabase` exporta, para a cadeia de importação não
 * saber que mudou de lado. A criação só acontece no primeiro acesso.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_alvo, prop) => Reflect.get(cliente(), prop, cliente()),
});

/**
 * Entra com a conta do robô.
 *
 * A conta NÃO é super_admin — ela tem só a permissão
 * `mestre_importar_automatico`, que abre as três portas da importação do 59 e
 * nada mais. É por isso que a senha pode morar num PC de trabalho: quem a pegar
 * consegue importar o relatório, não apagar o sistema.
 */
export async function entrar(): Promise<string> {
  const { data, error } = await cliente().auth.signInWithPassword({
    email:    await emailDoLogin(),
    password: obrigatorio('ROBO_SENHA'),
  });
  if (error) throw new Error(`Login do robô: ${error.message}`);
  if (!data.user) throw new Error('Login do robô não devolveu usuário.');
  return data.user.id;
}

/**
 * O e-mail com que o robô entra, a partir do login digitado no `.env`.
 *
 * A conta do robô é criada pela tela de Usuários com um NOME DE USUÁRIO, e o
 * e-mail dela é sintético. Quem instala conhece o login, não o e-mail — então o
 * robô resolve do mesmo jeito que a tela de login: parece e-mail, vai direto;
 * senão, pergunta ao banco pelas mesmas duas RPCs, na mesma ordem.
 *
 * `ROBO_EMAIL` continua aceito para quem já configurou assim.
 */
async function emailDoLogin(): Promise<string> {
  const login = (process.env.ROBO_LOGIN ?? process.env.ROBO_EMAIL ?? '').trim();
  if (!login) obrigatorio('ROBO_LOGIN');
  if (pareceEmailEntregavel(login)) return login;

  const porEmpresa = await cliente().rpc('buscar_email_por_usuario_empresa', {
    p_usuario: login, p_empresa_slug: TENANT_DO_ROBO,
  });
  if (!porEmpresa.error && porEmpresa.data) return porEmpresa.data as string;

  const global = await cliente().rpc('buscar_email_por_usuario', { p_usuario: login });
  if (!global.error && global.data) return global.data as string;

  throw new Error(`Login do robô: o usuário «${login}» não foi encontrado. `
    + 'Confira o login em Usuários — é o nome de usuário, não o nome de exibição.');
}

/**
 * A empresa em que o robô importa.
 *
 * `ROBO_EMPRESA_ID` vence, se estiver preenchida. Sem ela, vale a empresa da
 * própria conta do robô — que é a única em que a permissão dele foi ligada, e
 * portanto a única em que a importação pode dar certo.
 */
export async function empresaDoRobo(usuarioId: string): Promise<string> {
  const doEnv = process.env.ROBO_EMPRESA_ID?.trim();
  if (doEnv) return doEnv;

  const { data, error } = await cliente()
    .from('perfis').select('empresa_id').eq('id', usuarioId).maybeSingle();
  if (error) throw new Error(`Empresa do robô: ${error.message}`);
  const empresaId = (data as { empresa_id: string | null } | null)?.empresa_id;
  if (!empresaId) throw new Error('A conta do robô não está vinculada a nenhuma empresa.');
  return empresaId;
}

export async function sair(): Promise<void> {
  await cliente().auth.signOut().catch(() => { /* saída é cortesia, não requisito */ });
}
