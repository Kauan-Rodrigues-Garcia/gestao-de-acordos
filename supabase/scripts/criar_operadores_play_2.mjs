/**
 * Lote autorizado em 08/09/2026: 26 operadores novos, BOOKPLAY / Play 2.
 * Os sete logins preexistentes foram excluidos da lista por solicitacao.
 * Usa o mesmo signUp de AdminUsuarios.tsx; nao altera contas existentes.
 *
 * Previa: node --env-file=.env.local supabase/scripts/criar_operadores_play_2.mjs
 * Execucao: defina OPERADORES_SENHA_INICIAL no ambiente e acrescente --aplicar.
 * A senha e os tokens nunca sao gravados no repositorio nem impressos.
 * Cada cadastro e independente; uma falha interrompe os seguintes.
 * Antes de repetir apos falha, confira Auth e perfis. "user_already_exists"
 * e apenas preservado, nao significa que o cadastro existente foi validado.
 */
const pessoas = [
  {
    "usuario": "isabele_barros",
    "nome": "Isabele Barros"
  },
  {
    "usuario": "cleiton_afonso",
    "nome": "Cleiton Afonso"
  },
  {
    "usuario": "leticia_s_goncalves",
    "nome": "Leticia S Goncalves"
  },
  {
    "usuario": "laiza_santos",
    "nome": "Laiza Santos"
  },
  {
    "usuario": "mariha_rodrigues",
    "nome": "Mariha Rodrigues"
  },
  {
    "usuario": "lohayny_maia",
    "nome": "Lohayny Maia"
  },
  {
    "usuario": "otavio_cestini",
    "nome": "Otavio Cestini"
  },
  {
    "usuario": "rayane_estevan",
    "nome": "Rayane Estevan"
  },
  {
    "usuario": "aline_rodrigues",
    "nome": "Aline Rodrigues"
  },
  {
    "usuario": "maria_segura",
    "nome": "Maria Segura"
  },
  {
    "usuario": "danieli_trevizan",
    "nome": "Danieli Trevizan"
  },
  {
    "usuario": "rosane_piona",
    "nome": "Rosane Piona"
  },
  {
    "usuario": "daniela_reis",
    "nome": "Daniela Reis"
  },
  {
    "usuario": "leticia_peres",
    "nome": "Leticia Peres"
  },
  {
    "usuario": "amanda_d_silva",
    "nome": "Amanda D Silva"
  },
  {
    "usuario": "jhenifer_almeida",
    "nome": "Jhenifer Almeida"
  },
  {
    "usuario": "maria_c_silva",
    "nome": "Maria C Silva"
  },
  {
    "usuario": "thamires_souza",
    "nome": "Thamires Souza"
  },
  {
    "usuario": "thaina_couto",
    "nome": "Thaina Couto"
  },
  {
    "usuario": "larissa_vieira",
    "nome": "Larissa Vieira"
  },
  {
    "usuario": "mirian_barbosa",
    "nome": "Mirian Barbosa"
  },
  {
    "usuario": "isabella_rocha",
    "nome": "Isabella Rocha"
  },
  {
    "usuario": "gabriel_fonseca",
    "nome": "Gabriel Fonseca"
  },
  {
    "usuario": "alexia_silva",
    "nome": "Alexia Silva"
  },
  {
    "usuario": "ingrid_nascimento",
    "nome": "Ingrid Nascimento"
  },
  {
    "usuario": "gabriely_ferreira",
    "nome": "Gabriely Ferreira"
  }
];
const setorId = '74b413e9-c2ce-4f11-bb53-ad2be9efcf4a';
const empresaId = '9bed94cd-605d-4d43-9afb-352c72b05c50';
const url = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const chave = process.env.VITE_SUPABASE_ANON_KEY;
const aplicar = process.argv.includes('--aplicar');

if (!aplicar) {
  console.info(JSON.stringify({ empresa: 'BOOKPLAY', setor: 'Play 2', perfil: 'operador', equipe: null, pessoas }, null, 2));
} else {
  const senha = process.env.OPERADORES_SENHA_INICIAL;
  if (url !== 'https://vfrvvoetidtsqbbhdkmj.supabase.co' || !chave) {
    throw new Error('Configuracao Supabase ausente ou projeto diferente do lote autorizado.');
  }
  if (!senha || senha.length < 6) throw new Error('Defina OPERADORES_SENHA_INICIAL com pelo menos 6 caracteres.');
  const headers = { apikey: chave, 'Content-Type': 'application/json' };
  const settingsResponse = await fetch(url + '/auth/v1/settings', { headers, signal: AbortSignal.timeout(30000) });
  if (!settingsResponse.ok) throw new Error('Nao foi possivel conferir a configuracao do Auth.');
  const settings = await settingsResponse.json();
  if (settings.disable_signup || !settings.mailer_autoconfirm) {
    throw new Error('O lote exige cadastro habilitado e confirmacao automatica, como no aplicativo.');
  }

  let criados = 0;
  let existentes = 0;
  for (const pessoa of pessoas) {
    const response = await fetch(url + '/auth/v1/signup', {
      method: 'POST', headers, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        email: pessoa.usuario + '@interno.sistema',
        password: senha,
        data: { ...pessoa, perfil: 'operador', setor_id: setorId, empresa_id: empresaId, empresa_slug: 'bookplay' },
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.error_code === 'user_already_exists' || result.code === 'user_already_exists') {
        existentes++;
        console.info('EXISTENTE PRESERVADO ' + pessoa.usuario);
        continue;
      }
      throw new Error(pessoa.usuario + ': HTTP ' + response.status + ' / ' + (result.error_code ?? result.code ?? 'erro de cadastro'));
    }
    if (!result.user?.id || !result.access_token || !result.user.email_confirmed_at) {
      throw new Error(pessoa.usuario + ': resposta sem conta confirmada e sessao; conferir Auth antes de repetir.');
    }
    const sessionHeaders = { ...headers, Authorization: 'Bearer ' + result.access_token };
    try {
      const profileResponse = await fetch(
        url + '/rest/v1/perfis?id=eq.' + encodeURIComponent(result.user.id) +
          '&select=usuario,nome,perfil,setor_id,empresa_id,equipe_id,ativo,senha_alterada',
        { headers: sessionHeaders, signal: AbortSignal.timeout(30000) },
      );
      if (!profileResponse.ok) throw new Error(pessoa.usuario + ': falha ao validar perfil; conferir antes de repetir.');
      const perfis = await profileResponse.json();
      const p = perfis[0];
      if (perfis.length !== 1 || p.usuario !== pessoa.usuario || p.nome !== pessoa.nome ||
          p.perfil !== 'operador' || p.setor_id !== setorId || p.empresa_id !== empresaId ||
          p.equipe_id !== null || p.ativo !== true || p.senha_alterada !== false) {
        throw new Error(pessoa.usuario + ': perfil divergente; conferir antes de repetir.');
      }
      criados++;
      console.info('CRIADO E VALIDADO ' + pessoa.usuario + ' | ' + pessoa.nome);
    } finally {
      const logout = await fetch(url + '/auth/v1/logout?scope=local', {
        method: 'POST', headers: sessionHeaders, signal: AbortSignal.timeout(30000),
      });
      if (!logout.ok) throw new Error(pessoa.usuario + ': falha ao encerrar sessao de cadastro.');
    }
  }
  console.info(JSON.stringify({ criados, existentesPreservados: existentes, totalDoLote: pessoas.length }));
}
