// Folha de contato só para conferência (não entra no vídeo).
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { TODAS } from './elenco';

export const Folha: React.FC = () => (
  <AbsoluteFill style={{ background: '#fff', display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start' }}>
    {TODAS.map((p, i) => (
      <div key={i} style={{ width: 274, height: 330, padding: 4, boxSizing: 'border-box', fontFamily: 'sans-serif', fontSize: 16 }}>
        <Img src={staticFile(p.foto)} style={{ width: '100%', height: 290, objectFit: 'contain', background: '#ddd' }} />
        <div>{i} {p.setor.id} {p.nome}</div>
      </div>
    ))}
  </AbsoluteFill>
);
