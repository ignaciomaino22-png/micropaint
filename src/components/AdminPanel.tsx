import React, { useState } from 'react';
import { useFirebase } from '../context/FirebaseContext';
import { Shield, Trash2, Ban, UserCheck, Search, Image as ImageIcon, Check, Calendar, Skull, AlertCircle } from 'lucide-react';

export const AdminPanel: React.FC = () => {
  const { 
    user,
    isAdmin, 
    allDrawingsAdmin, 
    bans, 
    deleteDrawingAdmin, 
    banUserAdmin, 
    unbanUserAdmin,
    simulationAdminActive
  } = useFirebase();

  const [banUserIdInput, setBanUserIdInput] = useState('');
  const [banReasonInput, setBanReasonInput] = useState('');
  const [banEmailInput, setBanEmailInput] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  
  const [actFeedback, setActFeedback] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className="bg-zinc-900 border border-zinc-850 rounded-3xl p-6 text-center max-w-lg mx-auto text-zinc-305 shadow-xl">
        <Shield className="w-12 h-12 text-rose-500 mx-auto mb-3 animate-pulse" />
        <h3 className="font-bold text-white text-base tracking-tight">Panel de Administración & Moderación</h3>
        <p className="text-xs text-zinc-400 leading-relaxed mt-2 animate-fade-in">
          Esta sección está protegida bajo cifrado y solo es accesible en tiempo real por el correo oficial configurado en el sistema (<span className="font-extrabold text-indigo-400 font-mono">ignaciomaino22@gmail.com</span>).
        </p>
        <div className="h-px bg-zinc-800/60 my-4"></div>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Si es usted el desarrollador y desea probar los flujos de moderación de este panel en el entorno de pruebas, active la casilla <strong className="text-zinc-300">"Simular Admin"</strong> en la barra de usuario superior.
        </p>
      </div>
    );
  }

  const triggerFeedback = (message: string) => {
    setActFeedback(message);
    setTimeout(() => {
      setActFeedback(null);
    }, 3500);
  };

  const handleManualBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banUserIdInput.trim()) return;
    try {
      await banUserAdmin(banUserIdInput.trim(), banEmailInput.trim(), banReasonInput.trim() || 'Moderación manual del Administrador');
      triggerFeedback(`Usuario ${banUserIdInput} baneado exitosamente.`);
      setBanUserIdInput('');
      setBanEmailInput('');
      setBanReasonInput('');
    } catch (err: any) {
      console.error(err);
      triggerFeedback(`Fallo al banear: ${err.message || err}`);
    }
  };

  const handleDrawingDelete = async (drawingId: string) => {
    try {
      await deleteDrawingAdmin(drawingId);
      triggerFeedback('Estampado / Imagen borrado con éxito del lienzo.');
    } catch (err: any) {
      console.error(err);
      triggerFeedback(`Fallo al borrar: ${err.message}`);
    }
  };

  const handleUserBanFromDrawing = async (userId: string, userName: string) => {
    try {
      await banUserAdmin(userId, `Invitado (${userName})`, 'Baneo inmediato por moderación de imagen');
      triggerFeedback(`Usuario ${userName} ha sido silenciado y bloqueado.`);
    } catch (err: any) {
      console.error(err);
      triggerFeedback(`Fallo al banear: ${err.message}`);
    }
  };

  const handleUserUnban = async (userId: string) => {
    try {
      await unbanUserAdmin(userId);
      triggerFeedback('El usuario ha sido desbaneado del juego.');
    } catch (err: any) {
      console.error(err);
      triggerFeedback(`Fallo al desbanear: ${err.message}`);
    }
  };

  // Filter drawings based on search
  const filteredDrawings = allDrawingsAdmin.filter(dr => 
    dr.userName.toLowerCase().includes(filterSearch.toLowerCase()) || 
    dr.userId.includes(filterSearch)
  );

  return (
    <div className="w-full bg-zinc-900 rounded-3xl border border-zinc-800 p-5 md:p-6 shadow-xl flex flex-col gap-6 text-zinc-100">
      {/* HEADER SECTION */}
      <div className="flex flex-wrap justify-between items-center bg-zinc-950 p-4 rounded-2xl border border-zinc-850 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-7 bg-indigo-500 rounded-full animate-pulse"></div>
          <div>
            <h2 className="text-sm font-extrabold tracking-widest uppercase text-white font-sans">Mesa de Control Admin</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Control de seguridad para <span className="font-mono text-indigo-400 font-bold">{user?.email === 'ignaciomaino22@gmail.com' ? 'ignaciomaino22@gmail.com' : 'Sesión de Prueba'}</span>.
            </p>
          </div>
        </div>
        {simulationAdminActive && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-black font-mono">
            Modo Simulador
          </span>
        )}
      </div>

      {actFeedback && (
        <div id="admin-act-feedback" className="bg-indigo-950/80 border border-indigo-500/30 text-indigo-350 text-xs py-2.5 px-4 rounded-xl flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="font-bold">{actFeedback}</span>
        </div>
      )}

      {/* THREE VIEW GRID: BANS, DRAWINGS LIST, MANUAL CONTROLS */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* VIEW 1: MANAGE REVEALS (DRAWINGS) */}
        <div className="xl:col-span-2 flex flex-col gap-4 bg-zinc-950 p-5 rounded-2xl border border-zinc-850">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Auditoría Real</span>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-zinc-450" />
                Historial de Revelaciones
              </h3>
            </div>
            
            {/* SEARCH */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar por alias o Id..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="text-xs bg-zinc-900 text-white pl-8 pr-3 py-1.5 border border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44 placeholder-zinc-500"
              />
            </div>
          </div>

          <div className="overflow-y-auto max-h-[350px] border border-zinc-850 rounded-xl">
            {filteredDrawings.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500 font-medium">
                Ninguna revelación registrada en el sistema coincidentes.
              </div>
            ) : (
              <table className="w-full text-left text-xs text-zinc-300 border-collapse">
                <thead className="bg-zinc-905/80 text-zinc-400 font-mono text-[9px] uppercase tracking-wider sticky top-0 border-b border-zinc-855">
                  <tr>
                    <th className="p-3">Miniatura</th>
                    <th className="p-3">Jugador</th>
                    <th className="p-3">Hora</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-right">Filtros</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850">
                  {filteredDrawings.map((drawing) => (
                    <tr key={drawing.id} className={`hover:bg-zinc-900/40 transition-colors ${drawing.isDeleted ? 'bg-zinc-950/20 text-zinc-500' : ''}`}>
                      {/* Image Thumbnail */}
                      <td className="p-3">
                        <div className="w-10 h-10 rounded-lg bg-zinc-900 overflow-hidden border border-zinc-800">
                          <img 
                            src={drawing.imageUrl} 
                            alt="Drawing thumb" 
                            className={`w-full h-full object-cover ${drawing.isDeleted ? 'opacity-30 grayscale' : ''}`}
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </td>
                      {/* Username and UID */}
                      <td className="p-3">
                        <div className="font-bold text-white text-[13px]">{drawing.userName}</div>
                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5 select-all">UID: {drawing.userId.slice(0, 8)}...</div>
                      </td>
                      {/* Date */}
                      <td className="p-3 font-mono text-[10px] text-zinc-400">
                        {drawing.createdAt ? (
                          new Date(drawing.createdAt.seconds * 1000).toLocaleTimeString()
                        ) : (
                          'Procesando'
                        )}
                      </td>
                      {/* Status badge */}
                      <td className="p-3">
                        {drawing.isDeleted ? (
                          <span className="bg-rose-500/10 text-rose-450 text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">Eliminado</span>
                        ) : (
                          <span className="bg-emerald-500/10 text-emerald-400 text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">Visible</span>
                        )}
                      </td>
                      {/* Action buttons */}
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          {/* Soft Delete */}
                          {!drawing.isDeleted && (
                            <button
                              onClick={() => handleDrawingDelete(drawing.id)}
                              title="Borrar imagen del lienzo"
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          
                          {/* Ban Author */}
                          {!bans.some(b => b.userId === drawing.userId) && (
                            <button
                              onClick={() => handleUserBanFromDrawing(drawing.userId, drawing.userName)}
                              title="Banear usuario inmediatamente"
                              className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-505/20 hover:text-indigo-300 transition-all cursor-pointer"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* VIEW 2: ACTIVE BANS & MANUAL CONTROL */}
        <div className="flex flex-col gap-6">
          {/* BAN FORM */}
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-850">
            <h3 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
              <Skull className="w-4 h-4 text-rose-505 animate-pulse" />
              Sancionar UID Manual
            </h3>
            <form onSubmit={handleManualBan} className="flex flex-col gap-3">
              <div>
                <label className="block text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-widest mb-1">ID Único de Usuario (UID)</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: dG98bH... o baneo directo"
                  value={banUserIdInput}
                  onChange={(e) => setBanUserIdInput(e.target.value)}
                  className="text-xs px-3 py-2.5 w-full bg-zinc-900 text-white border border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-widest mb-1">Email (Opcional)</label>
                <input
                  type="email"
                  placeholder="Ej: atacante@gmail.com"
                  value={banEmailInput}
                  onChange={(e) => setBanEmailInput(e.target.value)}
                  className="text-xs px-3 py-2.5 w-full bg-zinc-900 text-white border border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-widest mb-1">Motivo del Baneo</label>
                <input
                  type="text"
                  placeholder="Ej: Carga de imagen obscena"
                  value={banReasonInput}
                  onChange={(e) => setBanReasonInput(e.target.value)}
                  className="text-xs px-3 py-2.5 w-full bg-zinc-900 text-white border border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="w-full text-xs text-white bg-rose-600 hover:bg-rose-550 font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm mt-1 cursor-pointer transition-all"
              >
                <Ban className="w-3.5 h-3.5" />
                Registrar Baneo Activo
              </button>
            </form>
          </div>

          {/* ACTIVE BANS LIST */}
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-850 flex-1 flex flex-col gap-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-indigo-400" />
              Baneos Activos ({bans.length})
            </h3>
            <div className="overflow-y-auto max-h-[170px] border border-zinc-850 rounded-xl flex-1">
              {bans.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500 font-medium">
                  Ningún usuario bloqueado activamente.
                </div>
              ) : (
                <div className="divide-y divide-zinc-850">
                  {bans.map((ban) => (
                    <div key={ban.userId} className="p-3 text-xs flex items-center justify-between gap-3 hover:bg-zinc-900/30">
                      <div>
                        <div className="font-bold text-white font-mono text-[10px]">ID: {ban.userId.slice(0, 10)}...</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">{ban.bannedEmail || 'Sin correo público'}</div>
                        <div className="text-[9px] text-rose-450 font-semibold mt-1">Causa: {ban.reason}</div>
                      </div>
                      <button
                        onClick={() => handleUserUnban(ban.userId)}
                        title="Levantar veto de usuario"
                        className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors flex-shrink-0 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>

  );
};
