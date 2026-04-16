/**
 * src/hooks/usePresence.ts
 *
 * Re-exporta `useOnlineUsers` do PresenceProvider para compatibilidade
 * com o código existente que chama `usePresence`.
 *
 * O canal Supabase Presence é criado e gerenciado exclusivamente pelo
 * PresenceProvider (singleton em App.tsx). Este hook apenas lê o Context.
 */
export { useOnlineUsers as usePresence } from '@/providers/PresenceProvider';
