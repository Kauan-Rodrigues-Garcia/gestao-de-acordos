/**
 * src/hooks/usePresence.ts
 *
 * @deprecated Use `useOnlineUsers` diretamente de '@/providers/PresenceProvider'.
 * Este arquivo existe apenas para compatibilidade com imports antigos.
 *
 * Migracao:
 *   Antigo: import { usePresence } from '@/hooks/usePresence';
 *   Novo:   import { useOnlineUsers } from '@/providers/PresenceProvider';
 */
export { useOnlineUsers as usePresence } from '@/providers/PresenceProvider';
// Re-export direto para novos imports
export { useOnlineUsers } from '@/providers/PresenceProvider';
