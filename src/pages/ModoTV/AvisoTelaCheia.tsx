import { useTelaCheia } from './telaCheia';

/** O aviso do canto. Some sozinho quando a TV está em tela cheia. */
export function AvisoTelaCheia() {
  const cheia = useTelaCheia();
  if (cheia) return null;
  return (
    <div style={{
      position: 'absolute', left: 24, bottom: 20, zIndex: 50, display: 'flex', alignItems: 'center', gap: 10,
      background: 'rgba(0,0,0,.6)', borderRadius: 999, padding: '8px 18px',
      color: '#fff', fontSize: 18, fontWeight: 600, pointerEvents: 'none',
    }}>
      Toque na tela ou aperte qualquer tecla para tela cheia
    </div>
  );
}
