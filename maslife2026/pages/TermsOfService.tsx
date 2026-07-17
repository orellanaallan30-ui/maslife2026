import React from 'react';
import { useNavigate } from 'react-router-dom';

const TermsOfService: React.FC = () => {
  const navigate = useNavigate();
  const updated = '8 de junio de 2026';

  return (
    <div className="min-h-full bg-white font-sans text-slate-800">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-slate-600 hover:text-primary transition-colors">
          <span className="material-icons-round text-lg">arrow_back</span>
          <span className="text-sm font-bold">Volver al inicio</span>
        </button>
        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Términos de Servicio</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 space-y-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Términos y Condiciones de Uso</h1>
          <p className="text-sm text-slate-500">Clínica Mas Life — <strong>clinicamaslife.cl</strong></p>
          <p className="text-xs text-slate-400">Última actualización: {updated}</p>
        </div>

        <Section title="1. Aceptación de los Términos">
          <p>
            Al acceder y utilizar la plataforma Clínica Mas Life (en adelante, "la Plataforma"), disponible en{' '}
            <strong>clinicamaslife.cl</strong>, aceptas quedar vinculado a estos Términos y Condiciones de Uso.
            Si no estás de acuerdo con alguna de estas condiciones, no debes utilizar la Plataforma.
          </p>
        </Section>

        <Section title="2. Descripción del Servicio">
          <p>
            Clínica Mas Life es una plataforma de gestión clínica y agendamiento en línea destinada a
            profesionales de salud (médicos, kinesiólogos, psicólogos, nutricionistas y otros) y sus pacientes
            en Chile. Los servicios incluyen:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-700 mt-2">
            <li>Agendamiento de citas médicas en línea</li>
            <li>Gestión de fichas clínicas electrónicas</li>
            <li>Sincronización con Google Calendar para profesionales</li>
            <li>Portal de acceso a registros clínicos para pacientes (Ley 20.584)</li>
            <li>Facturación y gestión financiera para profesionales</li>
          </ul>
        </Section>

        <Section title="3. Uso de Google Calendar">
          <p>
            La Plataforma ofrece a los profesionales de salud la opción de conectar su cuenta de Google Calendar
            mediante OAuth 2.0. Al hacerlo, el profesional autoriza a Clínica Mas Life a:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-700 mt-2">
            <li>Crear eventos en su Google Calendar al agendar una cita</li>
            <li>Actualizar eventos al modificar una cita existente</li>
            <li>Eliminar eventos al cancelar una cita</li>
          </ul>
          <p className="mt-2">
            No se accede a datos de calendario de pacientes ni de terceros. El profesional puede revocar
            este acceso en cualquier momento desde Configuración → Seguridad, o directamente desde su
            cuenta de Google en <strong>myaccount.google.com/permissions</strong>.
          </p>
          <p className="mt-2">
            El uso de la información obtenida de las APIs de Google se limita estrictamente a la
            sincronización de citas y no se utiliza para publicidad, perfilamiento ni se comparte con terceros.
            Cumplimos con la{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80">
              Política de Datos de Usuario de los Servicios de API de Google
            </a>.
          </p>
        </Section>

        <Section title="4. Responsabilidades del Profesional">
          <p>El profesional de salud que utiliza la Plataforma es responsable de:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-700 mt-2">
            <li>Mantener la confidencialidad de sus credenciales de acceso</li>
            <li>Asegurar que la información clínica ingresada sea veraz y actualizada</li>
            <li>Cumplir con la Ley 20.584 sobre derechos y deberes de los pacientes</li>
            <li>Obtener el consentimiento informado de sus pacientes según la normativa vigente</li>
            <li>Respetar las normas del Colegio de la profesión correspondiente</li>
          </ul>
        </Section>

        <Section title="5. Confidencialidad y Datos de Salud">
          <p>
            Los datos de salud son datos sensibles según la Ley 19.628 de Protección de la Vida Privada de
            Chile. Clínica Mas Life trata esta información con el máximo nivel de confidencialidad y aplica
            medidas técnicas y organizacionales para su protección, incluyendo cifrado en tránsito (TLS 1.2+)
            y en reposo.
          </p>
          <p className="mt-2">
            El acceso a los registros clínicos está restringido exclusivamente al profesional tratante y,
            cuando el profesional lo autoriza expresamente, al propio paciente a través de enlace seguro
            de tiempo limitado (Ley 20.584, Art. 4).
          </p>
        </Section>

        <Section title="6. Propiedad Intelectual">
          <p>
            Todos los elementos de la Plataforma (diseño, código, marca Clínica Mas Life) son propiedad de
            sus desarrolladores. Los datos clínicos ingresados por los profesionales son de su exclusiva
            propiedad y responsabilidad.
          </p>
        </Section>

        <Section title="7. Limitación de Responsabilidad">
          <p>
            Clínica Mas Life provee la Plataforma "tal como está". No nos responsabilizamos por decisiones
            clínicas tomadas en base a la información registrada, interrupciones del servicio por causas
            de fuerza mayor, ni por errores en la sincronización con servicios de terceros (Google Calendar,
            MercadoPago).
          </p>
        </Section>

        <Section title="8. Modificaciones">
          <p>
            Nos reservamos el derecho de modificar estos Términos. Los cambios se comunicarán con al menos
            15 días de anticipación mediante correo electrónico o aviso en la Plataforma. El uso continuado
            de la Plataforma implica la aceptación de los nuevos términos.
          </p>
        </Section>

        <Section title="9. Legislación Aplicable">
          <p>
            Estos Términos se rigen por las leyes de la República de Chile. Cualquier disputa se someterá
            a los tribunales competentes de la ciudad de Santiago, salvo acuerdo distinto entre las partes.
          </p>
        </Section>

        <Section title="10. Contacto">
          <p>
            Para consultas sobre estos Términos, escríbenos a{' '}
            <a href="mailto:contacto@clinicamaslife.cl" className="text-primary underline hover:opacity-80">
              contacto@clinicamaslife.cl
            </a>
          </p>
        </Section>

        <Section title="11. Programa de Referidos">
          <p>
            Un profesional registrado puede invitar a otros profesionales de salud mediante un enlace
            personalizado. Al registrarse usando dicho enlace:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-700 mt-2">
            <li>El nuevo profesional referido obtiene <strong>su primer mes de suscripción completamente gratis</strong> (30 días adicionales al período de prueba estándar).</li>
            <li>El profesional referidor recibe un <strong>descuento de CLP $1.000</strong> aplicable en su próxima renovación de suscripción, de forma automática al completarse el registro del referido.</li>
          </ul>
          <p className="mt-2">
            Estos beneficios son personales e intransferibles y no son canjeables por dinero en efectivo.
            Clínica Mas Life se reserva el derecho de modificar o cancelar el programa de referidos
            con aviso previo de 15 días.
          </p>
        </Section>
      </main>

      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400 space-y-1">
        <p>© {new Date().getFullYear()} Clínica Mas Life · Todos los derechos reservados</p>
        <p>
          <a href="/privacidad" className="underline hover:text-slate-600">Política de Privacidad</a>
          {' · '}
          <a href="mailto:contacto@clinicamaslife.cl" className="underline hover:text-slate-600">Contacto</a>
        </p>
      </footer>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-3">
    <h2 className="text-base font-black text-slate-900 border-l-4 border-primary pl-3">{title}</h2>
    <div className="text-sm text-slate-700 leading-relaxed space-y-2">{children}</div>
  </section>
);

export default TermsOfService;
