// Páginas por ciudad/especialidad que muestran la landing oficial con su propia
// etiqueta. Debe coincidir con seo/paginas.json (lo verifica __tests__/paginasSeo.test.ts).
export const ETIQUETAS_LANDING: Record<string, string> = {
  'escoliosis-tratamiento-la-serena': "Escoliosis: Tratamiento en La Serena",
  'escoliosis-tratamiento-ovalle': "Escoliosis: Tratamiento en Ovalle",
  'fonoaudiologo-coquimbo': "Fonoaudiólogo en Coquimbo",
  'fonoaudiologo-la-serena': "Fonoaudiólogo en La Serena",
  'fonoaudiologo-ovalle': "Fonoaudiólogo en Ovalle",
  'kinesiologia-coquimbo': "Kinesiólogo en Coquimbo",
  'kinesiologia-domicilio-coquimbo': "Kinesiología a Domicilio en Coquimbo",
  'kinesiologia-domicilio-la-serena': "Kinesiología a Domicilio en La Serena",
  'kinesiologia-domicilio-ovalle': "Kinesiología a Domicilio en Ovalle",
  'kinesiologia-la-serena': "Kinesiólogo en La Serena",
  'kinesiologia-ovalle': "Kinesiólogo en Ovalle",
  'kinesiologo-coquimbo': "Kinesiólogo en Coquimbo",
  'kinesiologo-la-serena': "Kinesiólogo en La Serena",
  'kinesiologo-ovalle': "Kinesiólogo en Ovalle",
  'lesiones-deportivas-coquimbo': "Lesiones Deportivas en Coquimbo",
  'lesiones-deportivas-la-serena': "Lesiones Deportivas en La Serena",
  'lesiones-deportivas-ovalle': "Lesiones Deportivas en Ovalle",
  'nutricionista-ovalle': "Nutricionista en Ovalle",
  'psicologo-coquimbo': "Psicólogo en Coquimbo",
  'psicologo-ovalle': "Psicólogo en Ovalle",
  'rehabilitacion-post-operatoria-coquimbo': "Rehabilitación Post-Operatoria en Coquimbo",
  'rehabilitacion-post-operatoria-la-serena': "Rehabilitación Post-Operatoria en La Serena",
  'rehabilitacion-post-operatoria-ovalle': "Rehabilitación Post-Operatoria en Ovalle",
  'tendinitis-tratamiento-coquimbo': "Tendinitis: Tratamiento en Coquimbo",
  'tratamiento-dolor-lumbar-coquimbo': "Tratamiento Dolor Lumbar en Coquimbo",
  'tratamiento-dolor-lumbar-la-serena': "Tratamiento Dolor Lumbar en La Serena",
  'tratamiento-dolor-lumbar-ovalle': "Tratamiento Dolor Lumbar en Ovalle",
};

export const esRutaLanding = (pathname: string): boolean =>
  pathname === '/' || Object.prototype.hasOwnProperty.call(ETIQUETAS_LANDING, pathname.replace(/^\/+|\/+$/g, ''));
