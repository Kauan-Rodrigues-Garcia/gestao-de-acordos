import { AbsoluteFill } from 'remotion';
import { Cena01Problema } from './cenas/Cena01Problema';
import { Cena02Virada } from './cenas/Cena02Virada';
import { Cena12Fechamento } from './cenas/Cena12Fechamento';
import { SecaoApp } from './cenas/SecaoApp';
import { Fundo } from './componentes/Fundo';
import { Trilha } from './Trilha';
import './tema';

/** `medir`: só o `npm run medir` liga — ver scripts/medir.mjs. */
export const Video: React.FC<{ medir?: boolean }> = ({ medir = false }) => (
  <AbsoluteFill>
    <Fundo />
    <Cena01Problema />
    <Cena02Virada />
    <SecaoApp medir={medir} />
    <Cena12Fechamento />
    <Trilha />
  </AbsoluteFill>
);
