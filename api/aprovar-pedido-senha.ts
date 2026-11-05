/**
 * Função serverless (Vercel) — APROVAR um pedido de reset de senha (05/11/2026).
 *
 * A liderança pede o reset no diálogo de Usuários (`fn_senha_pedir`); o super
 * admin aprova no canal «Senhas» do chat, e o clique chega aqui:
 *
 *   1. RESERVA o pedido com o JWT de quem clicou (`fn_senha_pedido_reservar`).
 *      O banco confere que é super admin, que o pedido está aberto e que a
 *      pessoa ainda pode ter a senha resetada. Dois super admins no mesmo
 *      pedido: o segundo recebe `em_andamento`;
 *   2. gera a senha aleatória AQUI, no servidor (6 caracteres, minúsculas e
 *      números, sem os que se confundem ao ditar: 0/o, 1/l/i);
 *   3. redefine no GoTrue (Admin API, service_role);
 *   4. CONCLUI no banco (`fn_senha_pedido_concluir`, só service_role): guarda a
 *      senha no pedido para quem pediu ler, liga
 *      `perfis.senha_troca_obrigatoria` e avisa quem pediu. Se o passo 3
 *      falhar, `fn_senha_pedido_falhou` devolve o pedido a pendente com o erro.
 *
 * A senha nunca entra em log nem em notificação. A SERVICE_ROLE_KEY nunca chega
 * ao navegador. Mesmo padrão de `api/alterar-senha.ts`.
 */
import { randomInt } from 'node:crypto';

interface ReqLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (data: unknown) => void;
}

function header(req: ReqLike, nome: string): string | undefined {
  const v = req.headers?.[nome] ?? req.headers?.[nome.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function enderecoCliente(req: ReqLike): string | null {
  const cru = header(req, 'x-forwarded-for') ?? header(req, 'x-real-ip');
  if (!cru) return null;
  return cru.split(',')[0].trim().slice(0, 400) || null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * O alfabeto da senha. Escrito aqui e em `src/lib/senhaAleatoria.ts` (o botão
 * «Gerar» de quem redefine direto): este arquivo roda fora do bundle do app,
 * sem o alias `@`. Os dois são conferidos pelo mesmo teste.
 */
const LETRAS = 'abcdefghjkmnpqrstuvwxyz';
const NUMEROS = '23456789';
const ALFABETO = LETRAS + NUMEROS;
const TAMANHO = 6;

/** 6 caracteres, ao menos uma letra e um número. */
export function gerarSenhaProvisoria(sortear: (max: number) => number = randomInt): string {
  for (;;) {
    let s = '';
    for (let i = 0; i < TAMANHO; i++) s += ALFABETO[sortear(ALFABETO.length)];
    if (/[a-z]/.test(s) && /[0-9]/.test(s)) return s;
  }
}

const MENSAGEM_ERRO: Record<string, string> = {
  so_super_admin: 'Só o super admin aprova reset de senha.',
  pedido_inexistente: 'Pedido não encontrado.',
  em_andamento: 'Outro super admin está aprovando este pedido agora.',
  ja_decidido: 'Este pedido já foi decidido.',
  sem_efeito: 'A pessoa foi desligada, excluída ou mudou para um cargo de cúpula. O pedido foi cancelado.',
};

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(503).json({ error: 'Reset de senha não configurado no servidor (falta SUPABASE_SERVICE_ROLE_KEY).' });
    return;
  }
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || serviceKey;

  const auth = header(req, 'authorization') || '';
  const callerJwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!callerJwt) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }

  const admin = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  const rpcAdmin = (nome: string, args: Record<string, unknown>) => fetch(`${url}/rest/v1/rpc/${nome}`, {
    method: 'POST', headers: admin, body: JSON.stringify(args),
  });

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { pedidoId?: unknown };
    const pedidoId = body?.pedidoId;
    if (typeof pedidoId !== 'string' || !UUID.test(pedidoId)) {
      res.status(400).json({ error: 'pedidoId inválido.' });
      return;
    }

    // 1) Quem chamou
    const userResp = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${callerJwt}` },
    });
    const caller = userResp.ok ? ((await userResp.json()) as { id?: string }) : null;
    if (!caller?.id) {
      res.status(401).json({ error: 'Sessão inválida.' });
      return;
    }

    // 2) Reserva — com o JWT de quem clicou: o banco decide se pode.
    const resResp = await fetch(`${url}/rest/v1/rpc/fn_senha_pedido_reservar`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${callerJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_pedido: pedidoId }),
    });
    if (!resResp.ok) {
      const txt = await resResp.text().catch(() => '');
      if (resResp.status === 404 || /could not find the function/i.test(txt)) {
        res.status(503).json({ error: 'Migration 20261105100000 pendente — aplique-a no Supabase.' });
        return;
      }
      res.status(502).json({ error: `Falha ao reservar o pedido (${resResp.status}).` });
      return;
    }
    const reserva = (await resResp.json()) as {
      ok?: boolean; erro?: string; por?: string | null;
      alvo_id?: string; alvo_nome?: string; empresa_id?: string; solicitante_nome?: string;
    };
    if (!reserva?.ok || !reserva.alvo_id) {
      const base = MENSAGEM_ERRO[reserva?.erro ?? ''] ?? `Não foi possível aprovar (${reserva?.erro ?? 'erro'}).`;
      res.status(409).json({ error: reserva?.por ? `${base} (${reserva.por})` : base, codigo: reserva?.erro ?? null });
      return;
    }

    // 3) Senha nova no GoTrue
    const senha = gerarSenhaProvisoria();
    const updResp = await fetch(`${url}/auth/v1/admin/users/${reserva.alvo_id}`, {
      method: 'PUT',
      headers: admin,
      body: JSON.stringify({ password: senha }),
    });
    if (!updResp.ok) {
      const msg = (await updResp.text().catch(() => '')).slice(0, 300);
      await rpcAdmin('fn_senha_pedido_falhou', { p_pedido: pedidoId, p_erro: `GoTrue ${updResp.status}: ${msg}` })
        .catch(() => {/* o pedido volta sozinho em 5 min */});
      res.status(502).json({ error: `Falha ao redefinir a senha (${updResp.status}). O pedido continua aberto.` });
      return;
    }

    // 4) Concluir no banco
    let aviso: string | null = null;
    try {
      const fim = await rpcAdmin('fn_senha_pedido_concluir', { p_pedido: pedidoId, p_senha: senha, p_por: caller.id });
      const r = fim.ok ? ((await fim.json()) as { ok?: boolean; erro?: string }) : null;
      if (!r?.ok) aviso = 'A senha foi trocada, mas o pedido não foi atualizado. Avise quem pediu com a senha abaixo.';
    } catch {
      aviso = 'A senha foi trocada, mas o pedido não foi atualizado. Avise quem pediu com a senha abaixo.';
    }

    // 5) Auditoria (best-effort). A senha NUNCA entra no log.
    const perfilResp = await fetch(`${url}/rest/v1/perfis?id=eq.${caller.id}&select=nome,empresa_id`, { headers: admin })
      .catch(() => null);
    const eu = perfilResp?.ok ? ((await perfilResp.json()) as Array<{ nome?: string; empresa_id?: string }>)[0] : undefined;
    await fetch(`${url}/rest/v1/logs_sistema`, {
      method: 'POST',
      headers: { ...admin, Prefer: 'return=minimal' },
      body: JSON.stringify({
        usuario_id: caller.id,
        usuario_nome: eu?.nome ?? null,
        acao: 'senha_redefinida',
        categoria: 'seguranca',
        severidade: 'critico',
        descricao: `Aprovou o reset de senha de ${reserva.alvo_nome ?? 'um usuário'} (pedido de ${reserva.solicitante_nome ?? '—'})`,
        tabela: 'auth.users',
        registro_id: reserva.alvo_id,
        alvo_tipo: 'usuario',
        alvo_rotulo: reserva.alvo_nome ?? reserva.alvo_id,
        empresa_id: eu?.empresa_id ?? null,
        origem: 'api',
        detalhes: {
          admin_nome: eu?.nome ?? null,
          alvo_id: reserva.alvo_id,
          alvo_nome: reserva.alvo_nome ?? null,
          via_pedido: pedidoId,
          solicitante_nome: reserva.solicitante_nome ?? null,
          exige_troca_no_proximo_acesso: true,
        },
        ip: enderecoCliente(req),
        user_agent: header(req, 'user-agent') ?? null,
      }),
    }).catch(() => {/* auditoria falhou, segue */});

    res.status(200).json({ success: true, senha, alvo: { id: reserva.alvo_id, nome: reserva.alvo_nome ?? '' }, aviso });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao aprovar o reset de senha.';
    res.status(500).json({ error: msg });
  }
}
