import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { usePageMeta } from '../lib/seo';

interface Charla {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  hora: string;
  duracion_min: number;
  ponente: string | null;
  meet_link: string | null;
  es_activa: boolean;
}

const TEMAS = [
  { id: 'nutricion',    label: 'Nutrición' },
  { id: 'kinesiologia', label: 'Kinesiología' },
  { id: 'dolor',        label: 'Dolor crónico' },
  { id: 'salud_mental', label: 'Salud mental' },
  { id: 'deporte',      label: 'Deporte y actividad física' },
  { id: 'otro',         label: 'Otro' },
];

const fmtFecha = (fecha: string) => {
  const d = new Date(fecha + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

interface FormState {
  nombre: string; apellido: string; email: string; emailRepeat: string;
  celular: string; ciudad: string; temas: string[]; acepta: boolean;
}

const defaultForm = (): FormState => ({
  nombre: '', apellido: '', email: '', emailRepeat: '',
  celular: '', ciudad: '', temas: [], acepta: false,
});

const Charlas: React.FC = () => {
  const navigate = useNavigate();

  usePageMeta({
    title: 'Charlas de salud gratuitas en Ovalle y Región de Coquimbo | Clínica Mas Life',
    description: 'Inscríbete gratis en nuestras charlas de salud: kinesiología, nutrición y bienestar. Cupos limitados, presenciales y online, en la Región de Coquimbo.',
    canonicalPath: '/charlas',
  });

  const [charlas, setCharlas] = useState<Charla[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Charla | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('charlas')
      .select('*')
      .eq('es_activa', true)
      .order('fecha', { ascending: true })
      .then(({ data }) => {
        setCharlas((data as Charla[]) || []);
        setLoading(false);
      });
  }, []);

  const openModal = (c: Charla) => {
    setSelected(c);
    setForm(defaultForm());
    setSuccess(false);
    setError('');
  };

  const closeModal = () => {
    setSelected(null);
    setSuccess(false);
    setError('');
  };

  const toggleTema = (id: string) => {
    setForm(f => ({
      ...f,
      temas: f.temas.includes(id) ? f.temas.filter(t => t !== id) : [...f.temas, id],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim()) return setError('Ingresa tu nombre.');
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('Ingresa un email válido.');
    if (form.email.trim().toLowerCase() !== form.emailRepeat.trim().toLowerCase()) return setError('Los emails no coinciden.');
    if (!form.acepta) return setError('Debes aceptar las comunicaciones para inscribirte.');

    setSubmitting(true);
    const { error: err } = await supabase.from('charla_registrations').insert({
      charla_id: selected!.id,
      charla_titulo: selected!.titulo,
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim() || null,
      email: form.email.trim().toLowerCase(),
      celular: form.celular.trim() || null,
      ciudad: form.ciudad.trim() || null,
      temas_interes: form.temas.length > 0 ? form.temas : null,
      acepta_comunicaciones: form.acepta,
    });
    setSubmitting(false);
    if (err) {
      // 23505 = ya inscrito (índice único por charla + email): tratarlo como éxito
      // amable en vez de un error genérico, y no duplicar la inscripción.
      if ((err as { code?: string }).code === '23505') {
        setSuccess(true);
      } else {
        setError('Ocurrió un error. Intenta de nuevo.');
      }
    } else {
      setSuccess(true);
    }
  };

  const esPasada = (fecha: string) => new Date(fecha + 'T23:59:59') < new Date();

  return (
    <div className="flex-1 w-full overflow-y-auto bg-slate-50">

      {/* Hero */}
      <div className="bg-gradient-to-br from-teal-600 to-teal-800 text-white px-6 py-16 lg:py-24 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-5">
            <span className="bg-white/20 text-white text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-icons-round text-sm">videocam</span>
              Google Meet · Sin costo
            </span>
          </div>
          <h1 className="text-3xl lg:text-5xl font-black mb-4 leading-tight">
            Charlas gratuitas de salud
          </h1>
          <p className="text-teal-100 text-base lg:text-xl max-w-xl mx-auto">
            Aprende con los profesionales de Clínica Mas Life. Charlas en vivo, prácticas y sin tecnicismos.
          </p>
          <button onClick={() => navigate('/')}
            className="mt-8 inline-flex items-center gap-2 text-teal-200 hover:text-white text-sm font-bold transition-colors">
            <span className="material-icons-round text-base">arrow_back</span>
            Volver al inicio
          </button>
        </div>
      </div>

      {/* Grid de charlas */}
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-12">
        {loading ? (
          <div className="text-center py-20">
            <span className="material-icons-round text-4xl text-teal-400 animate-spin block mb-3">sync</span>
            <p className="text-slate-500 font-bold">Cargando charlas...</p>
          </div>
        ) : charlas.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-icons-round text-5xl text-slate-300 block mb-4">event_busy</span>
            <p className="text-slate-500 font-bold text-lg">No hay charlas programadas por ahora</p>
            <p className="text-slate-400 text-sm mt-2">Regístrate en el inicio para recibir notificaciones de próximas charlas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {charlas.map(c => {
              const pasada = esPasada(c.fecha);
              return (
                <div key={c.id} className={`bg-white rounded-3xl border shadow-md overflow-hidden flex flex-col transition-all ${pasada ? 'border-slate-200 opacity-70' : 'border-teal-100 hover:shadow-xl hover:-translate-y-0.5'}`}>
                  {/* Cabecera color */}
                  <div className={`px-6 py-4 flex items-center justify-between ${pasada ? 'bg-slate-100' : 'bg-teal-50'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black px-2.5 py-1 rounded-full ${pasada ? 'bg-slate-200 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>
                        {pasada ? 'Finalizada' : 'Gratuita'}
                      </span>
                      <span className="bg-blue-100 text-blue-700 text-xs font-black px-2.5 py-1 rounded-full flex items-center gap-1">
                        <span className="material-icons-round text-sm">videocam</span>
                        Meet
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-500">{c.duracion_min} min</span>
                  </div>

                  {/* Contenido */}
                  <div className="p-6 flex flex-col gap-3 flex-1">
                    <h2 className="text-lg font-black text-slate-900 leading-snug">{c.titulo}</h2>
                    {c.descripcion && <p className="text-slate-500 text-sm leading-relaxed">{c.descripcion}</p>}

                    <div className="flex flex-col gap-1.5 mt-1">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <span className="material-icons-round text-teal-500 text-base">calendar_today</span>
                        <span className="font-bold capitalize">{fmtFecha(c.fecha)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <span className="material-icons-round text-teal-500 text-base">schedule</span>
                        <span className="font-bold">{c.hora} hrs</span>
                      </div>
                      {c.ponente && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="material-icons-round text-teal-500 text-base">person</span>
                          <span className="font-bold">{c.ponente}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-auto pt-4">
                      {pasada ? (
                        <p className="text-slate-400 text-sm font-bold text-center">Esta charla ya finalizó</p>
                      ) : c.meet_link ? (
                        <a href={c.meet_link} target="_blank" rel="noopener noreferrer"
                          className="w-full py-3 bg-teal-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-teal-600 transition-all shadow-md shadow-teal-500/25">
                          <span className="material-icons-round text-base">videocam</span>
                          Unirse a la charla
                        </a>
                      ) : (
                        <button onClick={() => openModal(c)}
                          className="w-full py-3 bg-teal-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-teal-600 active:scale-[0.98] transition-all shadow-md shadow-teal-500/25">
                          <span className="material-icons-round text-base">how_to_reg</span>
                          Inscribirme gratis
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal inscripción */}
      {selected && (
        <div className="fixed inset-0 z-[200] flex items-end lg:items-center justify-center p-0 lg:p-6"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl lg:rounded-3xl shadow-2xl z-10">

            {/* Header modal */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-3 rounded-t-3xl lg:rounded-t-3xl">
              <div>
                <p className="text-[11px] font-black text-teal-600 uppercase tracking-widest">Inscripción gratuita</p>
                <h3 className="text-base font-black text-slate-900 leading-snug mt-0.5">{selected.titulo}</h3>
                <p className="text-xs text-slate-500 mt-1 font-bold capitalize">{fmtFecha(selected.fecha)} · {selected.hora} hrs</p>
              </div>
              <button onClick={closeModal} className="shrink-0 p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
                <span className="material-icons-round text-slate-400">close</span>
              </button>
            </div>

            {/* Contenido modal */}
            <div className="p-6">
              {success ? (
                <div className="text-center py-8">
                  <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="material-icons-round text-emerald-500 text-4xl">check_circle</span>
                  </div>
                  <h4 className="text-xl font-black text-slate-900 mb-2">¡Inscripción confirmada!</h4>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    Te escribiremos a <strong>{form.email}</strong> con el link de Google Meet cuando esté disponible.
                  </p>
                  <button onClick={closeModal}
                    className="mt-6 px-6 py-3 bg-teal-500 text-white rounded-2xl font-black text-sm hover:bg-teal-600 transition-all">
                    Cerrar
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Nombre *</label>
                      <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                        placeholder="Tu nombre"
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Apellido</label>
                      <input value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))}
                        placeholder="Tu apellido"
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Email *</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="tu@email.com"
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all" />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Repetir email *</label>
                    <input type="email" value={form.emailRepeat} onChange={e => setForm(f => ({ ...f, emailRepeat: e.target.value }))}
                      placeholder="Repite tu email"
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Celular</label>
                      <input value={form.celular} onChange={e => setForm(f => ({ ...f, celular: e.target.value }))}
                        placeholder="+56 9 ..."
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Ciudad</label>
                      <input value={form.ciudad} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))}
                        placeholder="Ej: Ovalle"
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-2">Temas de interés</label>
                    <div className="flex flex-wrap gap-2">
                      {TEMAS.map(t => (
                        <button key={t.id} type="button" onClick={() => toggleTema(t.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black border-2 transition-all ${form.temas.includes(t.id) ? 'bg-teal-500 border-teal-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300'}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-slate-50 rounded-2xl p-4">
                    <input type="checkbox" id="acepta" checked={form.acepta} onChange={e => setForm(f => ({ ...f, acepta: e.target.checked }))}
                      className="w-4 h-4 rounded mt-0.5 accent-teal-500 shrink-0 cursor-pointer" />
                    <label htmlFor="acepta" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                      He leído los <a href="/privacidad" target="_blank" className="text-teal-600 font-bold underline">términos de privacidad</a> y acepto recibir comunicaciones de Clínica Mas Life sobre charlas y contenido de salud.
                    </label>
                  </div>

                  {error && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                      <span className="material-icons-round text-rose-500 text-base shrink-0 mt-0.5">error</span>
                      <p className="text-sm text-rose-700 font-medium">{error}</p>
                    </div>
                  )}

                  <button type="submit" disabled={submitting}
                    className="w-full py-4 bg-teal-500 text-white rounded-2xl font-black text-sm hover:bg-teal-600 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-teal-500/25 mt-1">
                    {submitting ? (
                      <><span className="material-icons-round text-base animate-spin">sync</span>Inscribiendo...</>
                    ) : (
                      <><span className="material-icons-round text-base">how_to_reg</span>INSCRIBIRME</>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Charlas;
