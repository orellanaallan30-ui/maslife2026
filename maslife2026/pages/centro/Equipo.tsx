// Equipo del centro: profesionales, recepción y datos del centro.
// Solo quien administra puede agregar o quitar personas y editar el centro.

import React, { useCallback, useEffect, useState } from 'react';
import { useCenter } from '../../CenterContext';
import { centerApi, type Member } from '../../centerService';
import Modal, { campo, etiqueta, botonPrimario, botonSecundario, botonPeligro } from '../../components/centro/Modal';
import { toast } from '../../lib/toast';

const ROL: Record<string, string> = { admin: 'Administración', recepcion: 'Recepción', profesional: 'Profesional' };

const Equipo: React.FC = () => {
  const { active, reload } = useCenter();
  const center = active!.center;
  const esAdmin = active!.role === 'admin';
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState('');
  const [alta, setAlta] = useState<{ role: 'recepcion' | 'profesional'; email: string; name: string } | null>(null);
  const [clave, setClave] = useState<{ email: string; clave: string } | null>(null);
  const [quitar, setQuitar] = useState<Member | null>(null);
  const [datos, setDatos] = useState({ name: center.name, address: center.address, city: center.city, phone: center.phone });
  const [ocupado, setOcupado] = useState(false);
  const [errForm, setErrForm] = useState('');

  const cargar = useCallback(async () => {
    try { setMembers((await centerApi.members(center.id)).members); setError(''); }
    catch (err) { setError((err as Error).message); setMembers([]); }
  }, [center.id]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setDatos({ name: center.name, address: center.address, city: center.city, phone: center.phone }); }, [center.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alta) return;
    setErrForm(''); setOcupado(true);
    try {
      const r = await centerApi.addMember(center.id, alta);
      if (r.claveTemporal) setClave({ email: alta.email.trim().toLowerCase(), clave: r.claveTemporal });
      else toast.success(alta.role === 'profesional' ? 'Invitación enviada. El profesional debe aceptarla en sus Ajustes.' : 'Persona agregada a recepción');
      setAlta(null);
      await cargar();
    } catch (err) { setErrForm((err as Error).message); }
    finally { setOcupado(false); }
  };

  const guardarCentro = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    try { await centerApi.update(center.id, datos); await reload(); toast.success('Datos del centro guardados'); }
    catch (err) { toast.error((err as Error).message); }
    finally { setOcupado(false); }
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-5xl">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <h1 className="text-xl font-black text-slate-900">Equipo</h1>
        <div className="flex-1" />
        {esAdmin && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={botonSecundario} onClick={() => { setErrForm(''); setAlta({ role: 'profesional', email: '', name: '' }); }}>
              <span className="material-icons-round text-base">person_add</span>Invitar profesional
            </button>
            <button type="button" className={botonPrimario} onClick={() => { setErrForm(''); setAlta({ role: 'recepcion', email: '', name: '' }); }}>
              <span className="material-icons-round text-base">support_agent</span>Agregar recepción
            </button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl px-4 py-3 text-sm font-bold">{error}</p>}
      {members === null && <div className="flex justify-center py-16"><span className="material-icons-round animate-spin text-primary text-4xl">sync</span></div>}

      {members && members.length > 0 && (
        <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {members.map(m => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-10 h-10 rounded-full bg-primary/10 text-primary font-black flex items-center justify-center shrink-0">
                {(m.name || m.email || '?').trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-800 truncate">{m.name || m.email}{m.soyYo ? ' (tú)' : ''}</p>
                <p className="text-xs font-semibold text-slate-500 truncate">{[m.specialty, m.email].filter(Boolean).join(' · ')}</p>
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 shrink-0">{m.esDueno ? 'Dueño' : ROL[m.role] || m.role}</span>
              {m.status === 'invited' && <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 shrink-0">Invitación pendiente</span>}
              {esAdmin && !m.esDueno && !m.soyYo && (
                <button type="button" aria-label={`Quitar a ${m.name || m.email}`} className="w-9 h-9 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center shrink-0" onClick={() => { setErrForm(''); setQuitar(m); }}>
                  <span className="material-icons-round text-lg">person_remove</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-slate-500 max-w-3xl">
        Recepción ve la agenda y los datos de contacto de los pacientes, y nunca la ficha clínica. Un profesional invitado debe aceptar la invitación en sus Ajustes: desde ese momento recepción puede ver y gestionar todas sus citas.
      </p>

      {esAdmin && (
        <form onSubmit={guardarCentro} className="bg-white border border-slate-200 rounded-2xl p-4 lg:p-6 space-y-4">
          <h2 className="text-base font-black text-slate-900">Datos del centro</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className={etiqueta} htmlFor="ce-nombre">Nombre</label>
              <input id="ce-nombre" className={campo} value={datos.name} onChange={e => setDatos({ ...datos, name: e.target.value })} />
            </div>
            <div>
              <label className={etiqueta} htmlFor="ce-tel">Teléfono</label>
              <input id="ce-tel" type="tel" className={campo} value={datos.phone} onChange={e => setDatos({ ...datos, phone: e.target.value })} />
            </div>
            <div>
              <label className={etiqueta} htmlFor="ce-dir">Dirección</label>
              <input id="ce-dir" className={campo} value={datos.address} onChange={e => setDatos({ ...datos, address: e.target.value })} />
            </div>
            <div>
              <label className={etiqueta} htmlFor="ce-ciudad">Ciudad</label>
              <input id="ce-ciudad" className={campo} value={datos.city} onChange={e => setDatos({ ...datos, city: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className={botonPrimario} disabled={ocupado || datos.name.trim().length < 3}>Guardar</button>
          </div>
        </form>
      )}

      {/* Agregar persona */}
      {alta && (
        <Modal titulo={alta.role === 'recepcion' ? 'Agregar recepción' : 'Invitar profesional'} onClose={() => setAlta(null)} ancho="max-w-md">
          <form onSubmit={agregar} className="space-y-4" noValidate>
            <p className="text-sm text-slate-600">
              {alta.role === 'recepcion'
                ? 'Se creará una cuenta para esta persona con una clave temporal que verás una sola vez.'
                : 'Escribe el correo con el que el profesional ya tiene cuenta. Le llegará un aviso para aceptar.'}
            </p>
            {alta.role === 'recepcion' && (
              <div>
                <label className={etiqueta} htmlFor="al-nombre">Nombre</label>
                <input id="al-nombre" className={campo} value={alta.name} onChange={e => setAlta({ ...alta, name: e.target.value })} autoFocus />
              </div>
            )}
            <div>
              <label className={etiqueta} htmlFor="al-mail">Correo</label>
              <input id="al-mail" type="email" autoCapitalize="none" className={campo} value={alta.email} onChange={e => setAlta({ ...alta, email: e.target.value })} />
            </div>
            {errForm && <p role="alert" className="text-sm font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{errForm}</p>}
            <div className="flex flex-col-reverse lg:flex-row lg:justify-end gap-2">
              <button type="button" className={botonSecundario} onClick={() => setAlta(null)}>Cancelar</button>
              <button type="submit" className={botonPrimario} disabled={ocupado || !alta.email.trim() || (alta.role === 'recepcion' && alta.name.trim().length < 2)}>
                {ocupado ? 'Guardando…' : alta.role === 'recepcion' ? 'Crear cuenta' : 'Invitar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Clave temporal: se muestra una sola vez */}
      {clave && (
        <Modal titulo="Cuenta de recepción creada" onClose={() => setClave(null)} ancho="max-w-md">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Entrega estos datos a la persona. La clave no se volverá a mostrar; puede cambiarla con "Olvidé mi contraseña" en la pantalla de ingreso.</p>
            <dl className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
              <div><dt className="text-xs font-bold text-slate-500">Ingreso</dt><dd className="font-bold text-slate-800">clinicamaslife.cl/pro/login</dd></div>
              <div><dt className="text-xs font-bold text-slate-500">Correo</dt><dd className="font-bold text-slate-800 break-all">{clave.email}</dd></div>
              <div><dt className="text-xs font-bold text-slate-500">Clave temporal</dt><dd className="font-black text-slate-900 font-mono tracking-wide select-all">{clave.clave}</dd></div>
            </dl>
            <div className="flex justify-end gap-2">
              <button type="button" className={botonSecundario} onClick={() => { navigator.clipboard?.writeText(`Ingreso: https://clinicamaslife.cl/pro/login\nCorreo: ${clave.email}\nClave temporal: ${clave.clave}`).then(() => toast.success('Copiado'), () => toast.error('No se pudo copiar')); }}>
                <span className="material-icons-round text-base">content_copy</span>Copiar
              </button>
              <button type="button" className={botonPrimario} onClick={() => setClave(null)}>Listo</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quitar persona */}
      {quitar && (
        <Modal titulo="Quitar del equipo" onClose={() => setQuitar(null)} ancho="max-w-md">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <strong>{quitar.name || quitar.email}</strong> dejará de pertenecer a {center.name}.
              {quitar.role === 'profesional' ? ' Recepción ya no verá su agenda. Sus citas y pacientes no se borran.' : ' Ya no podrá entrar al panel del centro.'}
            </p>
            {errForm && <p role="alert" className="text-sm font-bold text-rose-600">{errForm}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={botonSecundario} onClick={() => setQuitar(null)}>Cancelar</button>
              <button type="button" className={botonPeligro} disabled={ocupado} onClick={async () => {
                setErrForm(''); setOcupado(true);
                try { await centerApi.removeMember(center.id, quitar.id); toast.success('Persona quitada del equipo'); setQuitar(null); await cargar(); }
                catch (err) { setErrForm((err as Error).message); }
                finally { setOcupado(false); }
              }}>Quitar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Equipo;
