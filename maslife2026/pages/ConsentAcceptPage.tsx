// pages/ConsentAcceptPage.tsx
// Wrapper para usar ConsentAcceptPage desde react-router-dom
import React from 'react';
import { useParams } from 'react-router-dom';
import { ConsentAcceptPage as ConsentAcceptPageComponent } from '../components/ConsentFlow';

const ConsentAcceptPage: React.FC = () => {
  // La ruta define el parámetro como :id (App.tsx). Antes se leía 'consentId',
  // que siempre era undefined → "ID no especificado" para TODOS los enlaces.
  const { id: consentId } = useParams<{ id: string }>();
  if (!consentId) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-slate-500">ID de consentimiento no especificado</p>
    </div>
  );
  return <ConsentAcceptPageComponent consentId={consentId} />;
};

export { ConsentAcceptPage };
export default ConsentAcceptPage;
