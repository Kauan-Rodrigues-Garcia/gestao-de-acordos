import { isIP } from 'node:net';

interface ReqLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}
interface ResLike {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ResLike;
  json: (data: unknown) => void;
}

interface CacheIp {
  ip: string;
  cidade: string | null;
  estado: string | null;
  estado_codigo: string | null;
  pais: string | null;
  pais_codigo: string | null;
  status: 'sucesso' | 'erro';
  consultado_em: string | null;
  ultima_tentativa_em: string;
  expira_em: string;
  ultimo_erro: string | null;
}

interface RespostaProvedor {
  success?: boolean;
  message?: string;
  ip?: string;
  city?: string;
  region?: string;
  region_code?: string;
  country?: string;
  country_code?: string;
}

const MAX_IPS = 25;
const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;
const UMA_HORA_MS = 60 * 60 * 1000;

function header(req: ReqLike, nome: string): string | undefined {
  const valor = req.headers?.[nome] ?? req.headers?.[nome.toLowerCase()];
  return Array.isArray(valor) ? valor[0] : valor;
}

function textoCurto(valor: unknown, maximo = 160): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo ? limpo.slice(0, maximo) : null;
}

function corpo(req: ReqLike): { ips?: unknown } {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) as { ips?: unknown }; } catch { return {}; }
  }
  return (req.body && typeof req.body === 'object' ? req.body : {}) as { ips?: unknown };
}

function ipPublico(ip: string): boolean {
  const versao = isIP(ip);
  if (versao === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0)
      || (a === 198 && (b === 18 || b === 19 || b === 51))
      || (a === 203 && b === 0)
    );
  }
  if (versao !== 6) return false;

  const normalizado = ip.toLowerCase();
  const ipv4Mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalizado);
  if (ipv4Mapeado) return ipPublico(ipv4Mapeado[1]);
  return !(
    normalizado === '::' || normalizado === '::1'
    || normalizado.startsWith('fc') || normalizado.startsWith('fd')
    || /^fe[89ab]/.test(normalizado)
    || normalizado.startsWith('ff')
    || normalizado.startsWith('2001:db8')
  );
}

function normalizarIps(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor
    .filter((ip): ip is string => typeof ip === 'string')
    .map(ip => ip.trim())
    .filter(ipPublico))]
    .slice(0, MAX_IPS);
}

function headersAdmin(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

async function podeVerLogs(
  url: string,
  publishableKey: string,
  jwt: string,
): Promise<boolean> {
  const resposta = await fetch(`${url}/rest/v1/rpc/fn_user_tem`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_chave: 'ver_logs' }),
  });
  return resposta.ok && (await resposta.json()) === true;
}

async function lerCache(url: string, serviceKey: string, ips: string[]): Promise<CacheIp[]> {
  if (ips.length === 0) return [];
  const params = new URLSearchParams({
    select: 'ip,cidade,estado,estado_codigo,pais,pais_codigo,status,consultado_em,ultima_tentativa_em,expira_em,ultimo_erro',
    ip: `in.(${ips.join(',')})`,
  });
  const resposta = await fetch(`${url}/rest/v1/ip_localizacoes?${params}`, {
    headers: headersAdmin(serviceKey),
  });
  if (!resposta.ok) throw new Error(`cache indisponível (${resposta.status})`);
  return await resposta.json() as CacheIp[];
}

async function consultarIp(ip: string, anterior?: CacheIp): Promise<CacheIp> {
  const agora = new Date();
  try {
    const campos = 'success,message,ip,city,region,region_code,country,country_code';
    const resposta = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=${campos}&lang=pt-BR`,
      { signal: AbortSignal.timeout(5_000) },
    );
    const dados = await resposta.json() as RespostaProvedor;
    if (!resposta.ok || dados.success !== true) {
      throw new Error(textoCurto(dados.message) ?? `consulta recusada (${resposta.status})`);
    }
    return {
      ip,
      cidade: textoCurto(dados.city),
      estado: textoCurto(dados.region),
      estado_codigo: textoCurto(dados.region_code, 16),
      pais: textoCurto(dados.country),
      pais_codigo: textoCurto(dados.country_code, 2)?.toUpperCase() ?? null,
      status: 'sucesso',
      consultado_em: agora.toISOString(),
      ultima_tentativa_em: agora.toISOString(),
      expira_em: new Date(agora.getTime() + TRINTA_DIAS_MS).toISOString(),
      ultimo_erro: null,
    };
  } catch (erro) {
    return {
      ip,
      cidade: anterior?.cidade ?? null,
      estado: anterior?.estado ?? null,
      estado_codigo: anterior?.estado_codigo ?? null,
      pais: anterior?.pais ?? null,
      pais_codigo: anterior?.pais_codigo ?? null,
      status: 'erro',
      consultado_em: anterior?.consultado_em ?? null,
      ultima_tentativa_em: agora.toISOString(),
      expira_em: new Date(agora.getTime() + UMA_HORA_MS).toISOString(),
      ultimo_erro: textoCurto(erro instanceof Error ? erro.message : 'Falha ao consultar IP'),
    };
  }
}

async function salvarCache(url: string, serviceKey: string, linhas: CacheIp[]): Promise<void> {
  if (linhas.length === 0) return;
  const resposta = await fetch(`${url}/rest/v1/ip_localizacoes?on_conflict=ip`, {
    method: 'POST',
    headers: {
      ...headersAdmin(serviceKey),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(linhas),
  });
  if (!resposta.ok) throw new Error(`não foi possível atualizar o cache (${resposta.status})`);
}

function respostaPublica(linha: CacheIp) {
  return {
    ip: linha.ip,
    cidade: linha.cidade,
    estado: linha.estado,
    estadoCodigo: linha.estado_codigo,
    pais: linha.pais,
    paisCodigo: linha.pais_codigo,
    consultadoEm: linha.consultado_em,
    aproximada: true,
  };
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const publishableKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || serviceKey
  ).trim();
  if (!url || !serviceKey || !publishableKey) {
    res.status(503).json({ error: 'Localização de IP não configurada no servidor.' });
    return;
  }

  const auth = header(req, 'authorization') ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!jwt) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }

  const ips = normalizarIps(corpo(req).ips);
  if (ips.length === 0) {
    res.status(200).json({ localizacoes: [] });
    return;
  }

  try {
    const userResp = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${jwt}` },
    });
    if (!userResp.ok) {
      res.status(401).json({ error: 'Sessão inválida.' });
      return;
    }
    if (!await podeVerLogs(url, publishableKey, jwt)) {
      res.status(403).json({ error: 'Sem permissão para consultar a localização dos logs.' });
      return;
    }

    const existentes = await lerCache(url, serviceKey, ips);
    const porIp = new Map(existentes.map(linha => [linha.ip, linha]));
    const agora = Date.now();
    const vencidos = ips.filter(ip => {
      const linha = porIp.get(ip);
      return !linha || new Date(linha.expira_em).getTime() <= agora;
    });

    const renovados = await Promise.all(vencidos.map(ip => consultarIp(ip, porIp.get(ip))));
    await salvarCache(url, serviceKey, renovados);
    renovados.forEach(linha => porIp.set(linha.ip, linha));

    res.status(200).json({
      localizacoes: ips
        .map(ip => porIp.get(ip))
        .filter((linha): linha is CacheIp => Boolean(linha?.cidade || linha?.estado || linha?.pais))
        .map(respostaPublica),
    });
  } catch (erro) {
    console.error('[localizar-ips]', erro);
    res.status(503).json({ error: 'Não foi possível consultar a localização dos IPs.' });
  }
}
