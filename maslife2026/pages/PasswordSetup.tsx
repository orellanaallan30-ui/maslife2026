
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfessionalProfile } from '../types';

interface PasswordSetupProps {
  profile: ProfessionalProfile;
  onComplete: (updated: ProfessionalProfile) => void;
}

const PasswordSetup: React.FC<PasswordSetupProps> = ({ profile, onComplete }) => {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    const updatedProfile: ProfessionalProfile = {
      ...profile,
      password: newPassword,
      tempCode: undefined,
      needsPasswordReset: false,
      isVerified: true
    };

    setIsSuccess(true);
    setTimeout(() => {
      onComplete(updatedProfile);
      navigate('/pro/dashboard');
    }, 2500);
  };

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] flex flex-col items-center justify-center p-6 relative">
       <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px]"></div>
       </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="bg-indigo-600 w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-2xl shadow-indigo-600/20 mx-auto mb-6">
            <span className="material-icons-round text-white text-3xl">shield</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Activar Mi Cuenta</h1>
          <p className="text-slate-500 font-bold mt-2 tracking-tight">Bienvenido a la red, {profile.name.split(' ')[0]}</p>
        </div>

        <div className="bg-white p-8 md:p-12 rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] border border-slate-100">
          {!isSuccess ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-2xl mb-4 text-center">
                 <p className="text-xs font-black text-indigo-600 uppercase tracking-widest leading-relaxed">Seguridad Obligatoria: Crea una clave privada para reemplazar el código temporal.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Nueva Contraseña</label>
                <div className="relative">
                  <span className="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">lock_open</span>
                  <input 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-50 border-transparent rounded-2xl py-4 pl-12 pr-4 font-bold text-sm focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 transition-all"
                    placeholder="Mínimo 8 caracteres"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Confirmar Contraseña</label>
                <div className="relative">
                  <span className="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">verified_user</span>
                  <input 
                    type="password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50 border-transparent rounded-2xl py-4 pl-12 pr-4 font-bold text-sm focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 transition-all"
                    placeholder="Repite tu contraseña"
                    required
                  />
                </div>
              </div>

              {error && <p className="text-rose-500 text-xs font-black text-center uppercase tracking-widest">{error}</p>}

              <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-indigo-700 transition-all active:scale-95">ESTABLECER Y ENTRAR</button>
            </form>
          ) : (
            <div className="text-center py-12 animate-in zoom-in-95 duration-700">
               <div className="w-24 h-24 bg-emerald-500 text-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/30">
                  <span className="material-icons-round text-5xl">check_circle</span>
               </div>
               <h3 className="text-2xl font-black text-slate-900 mb-2">¡Acceso Configurado!</h3>
               <p className="text-slate-500 font-bold mb-8">Tu perfil ha sido verificado con éxito.</p>
               <div className="flex items-center justify-center gap-3">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
                  <p className="text-xs font-black text-emerald-600 uppercase tracking-[0.2em]">Sincronizando Dashboard...</p>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PasswordSetup;
