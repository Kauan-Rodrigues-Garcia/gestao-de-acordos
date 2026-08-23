/**
 * AvatarParticipante — a foto do operador, com as iniciais quando não há foto.
 *
 * Usa `foto_url`, o cadastro de foto que já existe (o mesmo que a barra lateral
 * e o card de comemoração leem). Não há segundo cadastro, e não há upload
 * nenhum nesta aba.
 *
 * Três casos, e o terceiro é o que costuma faltar:
 *
 *   • com foto           → a imagem;
 *   • sem foto           → as iniciais;
 *   • foto QUEBRADA      → as iniciais também. `AvatarImage` do Radix cai no
 *     `AvatarFallback` quando o `onError` da imagem dispara, então a URL morta
 *     não deixa um quadrado vazio no ranking.
 */
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/** Primeiras letras do primeiro e do último nome — `Kauan Rodrigues` → `KR`. */
function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

interface Props {
  nome: string;
  fotoUrl?: string | null;
  /** Desligado na configuração da campanha → todo mundo aparece por iniciais. */
  mostrarFoto?: boolean;
  className?: string;
}

export function AvatarParticipante({ nome, fotoUrl, mostrarFoto = true, className }: Props) {
  return (
    <Avatar className={cn('border border-border', className)}>
      {mostrarFoto && fotoUrl && (
        <AvatarImage src={fotoUrl} alt={nome} className="object-cover" />
      )}
      <AvatarFallback className="bg-primary/10 text-primary font-bold">
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );
}

export default AvatarParticipante;
