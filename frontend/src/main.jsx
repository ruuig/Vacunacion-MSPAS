import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/nunito';
import App from './App.jsx';
import { ProveedorDialogos } from './componentes/Dialogos.jsx';
import './estilos.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ProveedorDialogos>
        <App />
      </ProveedorDialogos>
    </BrowserRouter>
  </React.StrictMode>
);
