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
import { obrigatorio } from './env';

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
    email:    obrigatorio('ROBO_EMAIL'),
    password: obrigatorio('ROBO_SENHA'),
  });
  if (error) throw new Error(`Login do robô: ${error.message}`);
  if (!data.user) throw new Error('Login do robô não devolveu usuário.');
  return data.user.id;
}

export async function sair(): Promise<void> {
  await cliente().auth.signOut().catch(() => { /* saída é cortesia, não requisito */ });
}
