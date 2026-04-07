// supabaseClient.ts — cliente único con Supabase Auth
// Credenciales SIEMPRE desde variables de entorno (.env.local)
import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL  as string;
const akey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !akey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY en .env.local\n' +
    'Copia .env.example → .env.local y rellena los valores.'
  );
}

export const supabase = createClient(url, akey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,           // captura el token de recuperación del URL
    storage: window.localStorage,
  },
});

// Exporta la URL base para construir links de verificación/QR
export const APP_URL = 'https://www.clinicamaslife.cl';
