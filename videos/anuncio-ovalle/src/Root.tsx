import React from 'react';
import { Composition } from 'remotion';
import { Anuncio } from './Anuncio';

export const Root: React.FC = () => (
  <Composition id="Anuncio" component={Anuncio} durationInFrames={300} fps={30} width={1080} height={1920} />
);
