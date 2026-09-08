/**
 * resolverOperadoresTransferido.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * `resolverOperadores` — quem trocou de EMPRESA continua casando com o próprio
 * login na importação da empresa de ORIGEM.
 *
 * ## Por que este teste existe
 *
 * O defeito não aparece na hora da transferência: aparece na primeira
 * REIMPORTAÇÃO depois dela, e aparece calado. O login deixa de casar, a linha
 * entra sem `operador_id`, e o recebimento da pessoa some da equipe sem
 * nenhuma mensagem de erro em lugar nenhum.
 *
 * Aconteceu na PaguePlay em 08/09/2026: onze pessoas de Conecta Play / Digital
 * transferidas para a BookPlay, 128 linhas do analítico (R$ 61.549,86) e 424 do
 * diário (R$ 108.441,66) órfãs de uma vez, depois de um "limpar e reimportar".
 *
 * O que se testa aqui é a decisão, não a soma: que o transferido ENTRA, que ele
 * entra como último recurso, e que quem está na empresa hoje sempre ganha dele.
 * Essa última é a que protege contra o estrago silencioso oposto — creditar a
 * uma pessoa o recebimento de outra que herdou o login.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let perfisDaEmpresa: Array<{ id: string; usuario: string | null; nome: string | null }> = [];
let transferidos:    Array<{ id: string; usuario: string | null; nome: string | null }> = [];
let erroRpc: { message: string } | null = null;
const rpcsChamadas: Array<{ nome: string; args: Record<string, unknown> }> = [];

function construtorPerfis() {
  const alvo: Record<string, unknown> = {};
  alvo.select = () => alvo;
  alvo.eq     = () => alvo;
  alvo.order  = () => alvo;
  alvo.then = (aceitar: (r: unknown) => unknown) =>
    Promise.resolve({ data: perfisDaEmpresa, error: null }).then(aceitar);
  return alvo;
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => construtorPerfis() } }));
vi.mock('@/lib/supabaseSemTipo', () => ({
  tabelaSemTipo: () => construtorPerfis(),
  rpcSemTipo: (nome: string, args: Record<string, unknown>) => {
    rpcsChamadas.push({ nome, args });
    return Promise.resolve({ data: erroRpc ? null : transferidos, error: erroRpc });
  },
}));

const { resolverOperadores } = await import('./analitico.service');

const EMPRESA = 'emp-pagueplay';

beforeEach(() => {
  perfisDaEmpresa = [];
  transferidos    = [];
  erroRpc         = null;
  rpcsChamadas.length = 0;
});

describe('resolverOperadores — quem trocou de empresa', () => {
  it('casa o login de quem saiu da empresa e ainda tem fantasma', async () => {
    perfisDaEmpresa = [{ id: 'p-nayara', usuario: 'nayara_cruz', nome: 'Nayara Cruz' }];
    transferidos    = [{ id: 'p-karol', usuario: 'karolaine_silva', nome: 'Karolaine Silva' }];

    const r = await resolverOperadores(EMPRESA, ['nayara_cruz', 'karolaine_silva']);

    expect(r.map['nayara_cruz']).toBe('p-nayara');
    expect(r.map['karolaine_silva']).toBe('p-karol');
    expect(r.matches['karolaine_silva']).toEqual({
      id: 'p-karol', usuarioDB: 'karolaine_silva', nome: 'Karolaine Silva',
    });
  });

  it('pergunta pela empresa de ORIGEM', async () => {
    await resolverOperadores(EMPRESA, []);

    expect(rpcsChamadas).toEqual([
      { nome: 'fn_operadores_transferidos', args: { p_empresa_id: EMPRESA } },
    ]);
  });

  it('casa sem diferenciar maiúscula de minúscula, como o resto da resolução', async () => {
    transferidos = [{ id: 'p-helton', usuario: 'helton_roldon', nome: 'Helton Paulino Roldon' }];

    const r = await resolverOperadores(EMPRESA, ['HELTON_ROLDON']);

    expect(r.map['HELTON_ROLDON']).toBe('p-helton');
  });

  it('quem está na empresa HOJE ganha do transferido no mesmo login', async () => {
    // Login reaproveitado: a pessoa nova é quem trabalha aqui agora, e o
    // recebimento é dela. O transferido é a exceção, nunca a regra.
    perfisDaEmpresa = [{ id: 'p-nova',   usuario: 'maria_moreirasantos', nome: 'Maria Nova' }];
    transferidos    = [{ id: 'p-antiga', usuario: 'maria_moreirasantos', nome: 'Maria Fernanda' }];

    const r = await resolverOperadores(EMPRESA, ['maria_moreirasantos']);

    expect(r.map['maria_moreirasantos']).toBe('p-nova');
  });

  it('não põe o transferido no seletor manual de "não encontrado"', async () => {
    perfisDaEmpresa = [{ id: 'p-nayara', usuario: 'nayara_cruz', nome: 'Nayara Cruz' }];
    transferidos    = [{ id: 'p-karol',  usuario: 'karolaine_silva', nome: 'Karolaine Silva' }];

    const r = await resolverOperadores(EMPRESA, ['karolaine_silva']);

    expect(r.todosPerfis.map(p => p.id)).toEqual(['p-nayara']);
  });

  it('migration pendente não derruba a importação', async () => {
    perfisDaEmpresa = [{ id: 'p-nayara', usuario: 'nayara_cruz', nome: 'Nayara Cruz' }];
    erroRpc = { message: 'function public.fn_operadores_transferidos(uuid) does not exist' };

    const r = await resolverOperadores(EMPRESA, ['nayara_cruz', 'karolaine_silva']);

    expect(r.map['nayara_cruz']).toBe('p-nayara');
    expect(r.map['karolaine_silva']).toBeNull();
  });

  it('login vazio no cadastro do transferido é ignorado', async () => {
    // `dbIndex['']` casaria com qualquer coluna em branco do relatório e
    // creditaria a ele o recebimento de ninguém.
    transferidos = [{ id: 'p-sem-login', usuario: '', nome: 'Sem Login' }];

    const r = await resolverOperadores(EMPRESA, ['']);

    expect(r.map['']).toBeNull();
  });
});
