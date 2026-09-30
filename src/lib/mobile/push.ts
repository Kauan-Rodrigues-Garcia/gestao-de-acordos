/**
 * Aviso de pagamento no aparelho (Web Push) — Etapa 2 do mobile.
 *
 * Spec: docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md §3.
 *
 *   • a permissão do navegador é pedida SÓ no toque em «Ativar» — pedida ao
 *     abrir, a pessoa recusa por reflexo e desfazer é difícil;
 *   • a inscrição vai para `push_inscricoes` por `fn_push_inscrever` (troca o
 *     dono quando outra pessoa ativa no mesmo aparelho);
 *   • ao ativar, a Edge Function `enviar-push` manda um aviso de teste;
 *   • ao sair da conta, o aparelho deixa de receber (celular compartilhado).
 *
 * Sem `VITE_VAPID_PUBLIC_KEY` no build o recurso fica desligado: a tela nem
 * oferece o botão. É o que deixa publicar o código antes de configurar.
 */
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { registrarServiceWorker, suportaServiceWorker } from './sw';
import { ehIPhone, estaInstalado } from './instalar';

export type EstadoPush =
  | 'desligado'        // sem chave VAPID no build: o recurso não existe ainda
  | 'sem-suporte'      // navegador sem Web Push
  | 'precisa-instalar' // iPhone fora do app instalado
  | 'negado'           // a pessoa bloqueou nas configurações
  | 'inativo'          // pode ativar
  | 'ativo';

export interface AmbientePush {
  chavePublica: string | undefined;
  suportaPush: boolean;
  iPhone: boolean;
  instalado: boolean;
  permissao: NotificationPermission | 'indisponivel';
  inscrito: boolean;
}

/** Pura, para teste: o que a tela deve oferecer. */
export function estadoPush(a: AmbientePush): EstadoPush {
  if (!a.chavePublica) return 'desligado';
  // No iPhone o PushManager só existe dentro do app instalado (iOS 16.4+).
  if (a.iPhone && !a.instalado) return 'precisa-instalar';
  if (!a.suportaPush) return 'sem-suporte';
  if (a.permissao === 'denied') return 'negado';
  if (a.inscrito && a.permissao === 'granted') return 'ativo';
  return 'inativo';
}

export function chavePublicaVapid(): string | undefined {
  const v = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim();
  return v || undefined;
}

function suportaPush(): boolean {
  return suportaServiceWorker() && typeof window !== 'undefined'
    && 'PushManager' in window && 'Notification' in window;
}

async function inscricaoAtual(): Promise<PushSubscription | null> {
  if (!suportaPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function lerAmbientePush(): Promise<AmbientePush> {
  return {
    chavePublica: chavePublicaVapid(),
    suportaPush: suportaPush(),
    iPhone: ehIPhone(),
    instalado: estaInstalado(),
    permissao: typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission,
    inscrito: !!(await inscricaoAtual().catch((): null => null)),
  };
}

/** A chave VAPID em base64url → os bytes que o `subscribe` pede. */
export function chaveParaBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function rotuloDoAparelho(ua: string = navigator.userAgent): string {
  const so = /iPhone|iPad/i.test(ua) ? 'iPhone' : /Android/i.test(ua) ? 'Android'
    : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Outro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${so} · ${nav}`;
}

/**
 * Ativa o aviso NESTE aparelho. Chamar só dentro do toque do botão: é lá que o
 * navegador aceita pedir a permissão.
 */
export async function ativarPush(empresaId: string): Promise<void> {
  const chave = chavePublicaVapid();
  if (!chave) throw new Error('Aviso ainda não configurado.');
  if (!suportaPush()) throw new Error('Este navegador não recebe avisos.');

  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') throw new Error('Permissão de notificação não concedida.');

  const reg = await registrarServiceWorker();
  if (!reg) throw new Error('Não foi possível preparar o aviso neste aparelho.');
  await navigator.serviceWorker.ready;

  const insc = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveParaBytes(chave) as BufferSource,
    });
  const json = insc.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Inscrição incompleta do navegador.');
  }

  const { error } = await rpcSemTipo('fn_push_inscrever', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_aparelho: rotuloDoAparelho(),
    p_empresa_id: empresaId,
  });
  if (error) throw new Error(error.message);

  // O aviso de teste confirma na hora que chegou. Falha aqui não desfaz nada.
  await supabase.functions.invoke('enviar-push', { body: { acao: 'teste' } }).catch(() => {});
}

/** Desliga NESTE aparelho: apaga a linha (RLS: só a própria) e cancela no navegador. */
export async function desativarPush(): Promise<void> {
  const insc = await inscricaoAtual().catch((): null => null);
  if (!insc) return;
  await supabase.from('push_inscricoes' as never).delete().eq('endpoint', insc.endpoint);
  await insc.unsubscribe().catch(() => false);
}

/**
 * Antes do logout: quem sai não pode continuar recebendo o pagamento de quem
 * entrar depois no mesmo celular. Nunca lança — sair da conta não pode falhar
 * por causa do aviso.
 */
export async function esquecerAparelhoAoSair(): Promise<void> {
  try { await desativarPush(); } catch { /* segue o logout */ }
}
