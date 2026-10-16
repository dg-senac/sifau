import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AvisoDeAtualizacao } from './components/AvisoDeAtualizacao';
// As fontes vêm do próprio bundle (ver o porquê em `fonts.ts`), e por isso
// entram antes do CSS: as declarações de @font-face precisam existir quando a
// folha de estilo for aplicada.
import './fonts';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/*
      Fora do App de propósito: o aviso de versão nova não pertence a nenhuma
      tela — ele também precisa aparecer na tela de entrada, antes de o fiscal
      entrar. Como é posicionado por CSS, o lugar na árvore não importa.
    */}
    <AvisoDeAtualizacao />
  </StrictMode>
);
