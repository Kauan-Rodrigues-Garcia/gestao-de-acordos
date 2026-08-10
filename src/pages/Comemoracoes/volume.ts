/**
 * volume.ts — quão alto a comemoração pode tocar.
 *
 * A comemoração passa por cima de gente atendendo. O volume que parece certo
 * para quem está montando, de fone, num escritório silencioso, é o mesmo que
 * entra na ligação do colega ao lado — daí o padrão baixo, o aviso e a trava.
 *
 * As três regras moram aqui, e não espalhadas pelo JSX, porque a tela, a
 * prévia ("Testar") e o INSERT precisam concordar sobre o mesmo número.
 */
import type { AlvoTipo } from '@/services/comemoracoes.service';

/**
 * Onde a barra nasce.
 *
 * Era 100 (o volume cheio de cada som). Quem montava não mexia — não havia
 * motivo aparente — e a festa saía no talo na tela de todo mundo.
 */
export const VOLUME_PADRAO = 25;

/** A partir daqui a tela avisa que pode atrapalhar quem está em ligação. */
export const VOLUME_AVISO = 60;

/**
 * Teto da meta de SETOR.
 *
 * Meta de setor explode na empresa inteira (`empresa_inteira`, 20260801a):
 * é a única comemoração que toca em quem não faz ideia de que ela existe, em
 * todos os setores ao mesmo tempo. Aqui o volume não é sugestão, é trava.
 */
export const VOLUME_SETOR = 25;

/** O alvo escolhido tira o controle do volume de quem monta? */
export function volumeTravado(alvo: AlvoTipo): boolean {
  return alvo === 'setor';
}

/**
 * O volume que vale de fato — o escolhido, ou o teto quando o alvo trava.
 *
 * Deriva em vez de sobrescrever o estado: quem passou o volume para 80, mudou
 * para Setor e voltou atrás recupera os 80 que tinha escolhido.
 */
export function volumeEfetivo(volume: number, alvo: AlvoTipo): number {
  return volumeTravado(alvo) ? VOLUME_SETOR : volume;
}

/** Alto o bastante para entrar na ligação de quem está ao lado? */
export function volumeAtrapalha(volume: number): boolean {
  return volume >= VOLUME_AVISO;
}
