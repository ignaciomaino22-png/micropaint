import React, { useState } from 'react';
import { useFirebase } from '../context/FirebaseContext';
import { LogIn, LogOut, User as UserIcon, ShieldAlert, CheckCircle, RefreshCw } from 'lucide-react';

export const AuthBar: React.FC = () => {
  const { 
    user, 
    userProfile, 
    logout, 
    loginWithGoogle, 
    loginAnonymously, 
    isAdmin, 
    isBanned,
    simulationAdminActive,
    setSimulationAdminActive
  } = useFirebase();

  const [guestName, setGuestName] = useState('');
  const [isAnonChangeOpen, setIsAnonChangeOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    setIsSubmitting(true);
    try {
      await loginAnonymously(guestName);
      setIsAnonChangeOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="auth-bar-card" className="w-full bg-white rounded-3xl border border-zinc-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
      {/* LEFT ASPECT: ACCOUNT STATUS */}
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-2xl ${user ? 'bg-indigo-50 text-indigo-600' : 'bg-zinc-100 text-zinc-400'}`}>
          <UserIcon className="w-6 h-6" />
        </div>
        <div>
          {user ? (
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-zinc-850 text-sm tracking-tight">
                  {userProfile?.displayName || user.displayName || 'Jugador Anónimo'}
                </span>
                
                {/* Admin Status indicators */}
                {user.email === 'ignaciomaino22@gmail.com' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white font-mono animate-pulse uppercase tracking-wider">
                    Admin Oficial
                  </span>
                ) : isAdmin ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white font-mono uppercase tracking-wider">
                    Admin Simulado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-100 text-zinc-650 font-semibold uppercase tracking-wider">
                    {user.isAnonymous ? 'Invitado' : 'Jugador'}
                  </span>
                )}

                {/* Account verification / Banned status */}
                {isBanned && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-100 uppercase tracking-wider animate-bounce">
                    Baneado
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-mono">
                {user.isAnonymous ? `Anon ID: ${user.uid.slice(0, 8)}...` : `Correo: ${user.email}`}
              </p>
            </div>
          ) : (
            <div>
              <span className="font-bold text-zinc-900 text-sm tracking-tight">Conexión requerida para participar</span>
              <p className="text-xs text-zinc-500 mt-1">
                Conéctate con Google o ingresa un nombre temporal para empezar a pintar en el lienzo compartido.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT ASPECT: INTERACTIVE LOGIN CONTROLS */}
      <div className="flex flex-wrap items-center gap-3">
        {user ? (
          <>
            {/* Real-time Simulated Admin Switch for evaluation/testing */}
            <div className="flex items-center gap-2 bg-zinc-50 px-3.5 py-2 rounded-xl border border-zinc-200">
              <label htmlFor="admin-simulation-toggle" className="text-xs text-zinc-650 font-bold tracking-tight cursor-pointer">
                Simular Admin (Pruebas)
              </label>
              <input
                id="admin-simulation-toggle"
                type="checkbox"
                checked={simulationAdminActive}
                onChange={(e) => setSimulationAdminActive(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-zinc-350 rounded focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            <button
              onClick={logout}
              className="text-xs text-zinc-600 hover:text-rose-600 hover:bg-rose-50/50 flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 hover:border-rose-200 transition-all font-semibold"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cerrar sesión
            </button>
          </>
        ) : (
          <>
            {/* Google provider button */}
            <button
              onClick={loginWithGoogle}
              className="text-xs text-zinc-900 bg-white hover:bg-zinc-55 flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 transition-all font-semibold shadow-xs hover:border-zinc-300"
            >
              <LogIn className="w-3.5 h-3.5 text-indigo-600" />
              Conectar Google Auth
            </button>

            {/* Quick Guest popup trigger */}
            {isAnonChangeOpen ? (
              <form onSubmit={handleGuestSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Tu alias..."
                  required
                  maxLength={15}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="text-xs px-3 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium w-36"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 rounded-xl font-bold shadow-sm transition-colors"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setIsAnonChangeOpen(false)}
                  className="text-xs text-zinc-500 hover:bg-zinc-150 px-3 py-2.5 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsAnonChangeOpen(true)}
                className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5 px-4 py-2.5 rounded-xl transition-all font-bold shadow-xs"
              >
                Ingresar como Invitado
              </button>
            )}
          </>
        )}
      </div>
    </div>

  );
};
