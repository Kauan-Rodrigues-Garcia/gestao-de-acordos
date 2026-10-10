/**
 * icones.ts — o ícone de cada categoria de ticket.
 *
 * Fora de `categorias.ts` de propósito: lá mora a regra (que campos cada pedido
 * pede), testada sem montar nada; aqui é só desenho. Categoria sem ícone (uma
 * gravada antes de existir esta lista) cai no balão genérico.
 */
import {
  KeyRound, Lock, FileWarning, ShoppingCart, Bug, Scale, Receipt, UserCog, Users,
  Lightbulb, MessageCircle, type LucideIcon,
} from 'lucide-react';

const ICONES: Record<string, LucideIcon> = {
  senha: KeyRound,
  acesso: Lock,
  erro_acordo: FileWarning,
  erro_venda: ShoppingCart,
  erro_sistema: Bug,
  recebimento: Scale,
  divergencia_venda: Receipt,
  cadastro_usuario: UserCog,
  equipe: Users,
  melhoria: Lightbulb,
  outro: MessageCircle,
};

export function iconeDaCategoria(chave: string): LucideIcon {
  return ICONES[chave] ?? MessageCircle;
}
