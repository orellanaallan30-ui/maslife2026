import React from 'react';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();
  const updated = '5 de junio de 2026';

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-slate-600 hover:text-primary transition-colors">
          <span className="material-icons-round text-lg">arrow_back</span>
          <span className="text-sm font-bold">Volver al inicio</span>
        </button>
        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Política de Privacidad</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 space-y-10">
        {/* Title */}
        <div className="space-y-3">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Política de Privacidad</h1>
          <p className="text-sm text-slate-500">Clínica Mas Life — <strong>clinicamaslife.cl</strong></p>
          <p className="text-xs text-slate-400">Última actualización: {updated}</p>
        </div>

        <Section title="1. Quiénes somos">
          <p>
            Clínica Mas Life (en adelante, "nosotros" o "la Clínica") opera la plataforma de gestión clínica y
            agendamiento en línea disponible en <strong>clinicamaslife.cl</strong>. Somos responsables del
            tratamiento de los datos personales de pacientes y profesionales de salud que utilizan nuestros servicios.
          </p>
        </Section>

        <Section title="2. Datos que recopilamos">
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Pacientes:</strong> nombre completo, RUT, fecha de nacimiento, teléfono, correo electrónico, dirección, previsión de salud, historial clínico, diagnósticos, y datos de fichas clínicas ingresados por el profesional tratante.</li>
            <li><strong>Profesionales:</strong> nombre, RUT, especialidad, datos de contacto, horarios de atención, foto de perfil, y credenciales de acceso.</li>
            <li><strong>Datos de uso:</strong> registro de accesos, acciones realizadas en la plataforma, dirección IP y agente de usuario (para auditoría y seguridad).</li>
            <li><strong>Integraciones externas:</strong> si conectas Google Calendar, almacenamos de forma segura los tokens de autorización necesarios para sincronizar tu agenda.</li>
          </ul>
        </Section>

        <Section title="3. Finalidad del tratamiento">
          <ul className="list-disc pl-5 space-y-2">
            <li>Gestionar el agendamiento de citas y prestaciones de salud.</li>
            <li>Mantener fichas clínicas electrónicas según la normativa vigente en Chile.</li>
            <li>Permitir la comunicación entre pacientes y profesionales.</li>
            <li>Sincronizar agendas con servicios de calendario externos (Google Calendar) cuando el profesional lo autorice explícitamente.</li>
            <li>Cumplir con obligaciones legales y reglamentarias aplicables.</li>
          </ul>
        </Section>

        <Section title="4. Base legal">
          <p>
            El tratamiento de datos se realiza en conformidad con la <strong>Ley N° 19.628 sobre Protección de la Vida Privada</strong> de Chile y sus modificaciones. La base legal es el consentimiento del titular, la ejecución de un contrato de servicios, y el cumplimiento de obligaciones legales del prestador de salud.
          </p>
        </Section>

        <Section title="5. Integración con Google Calendar">
          <p>
            Cuando un profesional decide conectar Google Calendar mediante la sección de Configuración de la plataforma:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>Solicitamos acceso de lectura y escritura al calendario mediante el protocolo OAuth 2.0 de Google.</li>
            <li>Almacenamos los tokens de acceso de forma cifrada en nuestra base de datos.</li>
            <li>Los tokens se utilizan <strong>exclusivamente</strong> para sincronizar las citas agendadas en Clínica Mas Life con el Google Calendar del profesional.</li>
            <li>No compartimos, vendemos ni cedemos estos tokens a terceros.</li>
            <li>El profesional puede revocar el acceso en cualquier momento desde la sección de Configuración o directamente en su cuenta de Google (<a href="https://myaccount.google.com/permissions" className="text-primary underline" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>).</li>
          </ul>
        </Section>

        <Section title="6. Almacenamiento y seguridad">
          <p>
            Los datos se almacenan en servidores seguros provistos por <strong>Supabase</strong> (PostgreSQL cifrado) y <strong>Vercel</strong>, ambos con altos estándares de seguridad. Aplicamos cifrado en tránsito (TLS 1.2+), autenticación de doble factor disponible para profesionales, y auditoría de accesos.
          </p>
        </Section>

        <Section title="7. Transferencia de datos">
          <p>
            Los datos personales no se transfieren a terceros con fines comerciales. Únicamente se comparten con proveedores de infraestructura técnica (Supabase, Vercel, Google LLC para servicios de calendario) en la medida necesaria para prestar el servicio, quienes están sujetos a sus propias políticas de privacidad.
          </p>
        </Section>

        <Section title="8. Derechos del titular">
          <p>De acuerdo con la legislación chilena, los titulares de datos tienen derecho a:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Acceder a sus datos personales.</li>
            <li>Rectificar datos inexactos o incompletos.</li>
            <li>Solicitar la eliminación de sus datos (salvo obligación legal de conservarlos).</li>
            <li>Oponerse al tratamiento de sus datos.</li>
          </ul>
          <p className="mt-3">
            Para ejercer estos derechos, escríbenos a: <a href="mailto:contacto@clinicamaslife.cl" className="text-primary underline">contacto@clinicamaslife.cl</a>
          </p>
        </Section>

        <Section title="9. Conservación de datos">
          <p>
            Los datos clínicos se conservan por el período mínimo exigido por la normativa sanitaria chilena. Las fichas clínicas eliminadas por el profesional se mantienen en estado de retención por 90 días antes de su eliminación definitiva, permitiendo su recuperación en caso de error.
          </p>
        </Section>

        <Section title="10. Cambios a esta política">
          <p>
            Nos reservamos el derecho de actualizar esta política. Los cambios sustanciales serán notificados a los usuarios registrados por correo electrónico con al menos 15 días de anticipación.
          </p>
        </Section>

        <Section title="11. Contacto">
          <p>
            Para consultas sobre privacidad o ejercicio de derechos, contáctanos en:<br />
            <strong>Clínica Mas Life</strong><br />
            Correo: <a href="mailto:contacto@clinicamaslife.cl" className="text-primary underline">contacto@clinicamaslife.cl</a><br />
            Sitio web: <a href="https://clinicamaslife.cl" className="text-primary underline">clinicamaslife.cl</a>
          </p>
        </Section>
      </main>

      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Clínica Mas Life · <a href="/" className="hover:text-primary">clinicamaslife.cl</a>
      </footer>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-3">
    <h2 className="text-base font-black text-slate-900">{title}</h2>
    <div className="text-sm text-slate-600 leading-relaxed space-y-3">{children}</div>
  </section>
);

export default PrivacyPolicy;
