/**
 * Conta quem ativou e quem recusou o tema do GTA VI (migration
 * 20261118120000). O tema não depende disto: quem manda é o navegador
 * (`tema.ts`), e erro aqui só faz tentar de novo na próxima abertura.
 *
 * Cada resposta vai uma vez: o que já chegou ao banco fica anotado no
 * navegador. Quem respondeu antes de esta contagem existir é enviado quando
 * abrir o sistema. Impersonação não grava nada no nome da pessoa.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';

const chaveEnviada = (pessoa: string) => `vi:enviada:${pessoa}`;
const emAndamento = new Set<string>();

function lerEnviada(pessoa: string): string | null {
  try { return localStorage.getItem(chaveEnviada(pessoa)); } catch { return null; }
}

export async function enviarEscolhaVi(pessoa: string, escolha: 'sim' | 'nao'): Promise<void> {
  if (getImpersonacaoAtiva() || lerEnviada(pessoa) === escolha) return;
  const envio = `${pessoa}:${escolha}`;
  if (emAndamento.has(envio)) return;
  emAndamento.add(envio);
  try {
    const { error } = await rpcSemTipo('fn_vi_registrar_escolha', { p_escolha: escolha });
    if (error) return;
    try { localStorage.setItem(chaveEnviada(pessoa), escolha); } catch { /* modo privado */ }
  } catch {
    /* sem rede: tenta de novo na próxima abertura */
  } finally {
    emAndamento.delete(envio);
  }
}
