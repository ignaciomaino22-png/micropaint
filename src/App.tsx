import React from 'react';
import { FirebaseProvider, useFirebase } from './context/FirebaseContext';
import { AuthBar } from './components/AuthBar';
import { CanvasBoard } from './components/CanvasBoard';
import { AdminPanel } from './components/AdminPanel';
import { ShieldAlert, Sparkles, HelpCircle, Layers } from 'lucide-react';

const AppContent: React.FC = () => {
  const { loading, user, isAdmin, drawings } = useFirebase();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center select-none font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-zinc-200 border-t-indigo-600 animate-spin"></div>
          <div>
            <h3 className="font-bold text-zinc-900 tracking-tight">Sincronizando MicroPaint...</h3>
            <p className="text-xs text-zinc-400 mt-1 font-mono">Cargando base de datos en tiempo real</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate dynamic stats
  const totalDrawings = drawings?.length || 0;
  const estimatedSurface = totalDrawings * 145000; // scaled virtual surface coordinates revealed
  const percentRemaining = Math.max(99.1, 100 - (totalDrawings * 0.005)); // canvas is so huge it feels endless

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-700 flex flex-col items-center justify-start py-8 px-4 md:px-8 max-w-7xl mx-auto selection:bg-indigo-150">
      
      {/* 1. APP HEADER */}
      <header className="w-full bg-white border border-zinc-200 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-md shadow-indigo-100 shrink-0">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-zinc-900">
                <span className="text-indigo-600 font-extrabold">MicroPaint</span> de 1,000,000²
              </h1>
              <span className="px-2.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-extrabold rounded-lg uppercase tracking-wider animate-pulse">Live</span>
            </div>
            <p className="text-xs md:text-sm text-zinc-500 mt-2 max-w-2xl leading-relaxed">
              Un gigantesco canvas colaborativo en tiempo real con resolución lógica de <strong className="text-indigo-600 font-extrabold">1,000,000 × 1,000,000</strong> de coordenadas. Explora, desplázate y revela tu arte con persistencia.
            </p>
          </div>
        </div>
        
        {/* HELP BADGE */}
        <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-250/60 rounded-2xl p-4 shrink-0">
          <HelpCircle className="w-5 h-5 text-zinc-500 flex-shrink-0" />
          <div className="text-left font-mono">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400">Guía del Creador</div>
            <div className="text-[10px] text-zinc-650 mt-0.5">Navega el mapa • Sube imagen • Revela tu sector de 1M²</div>
          </div>
        </div>
      </header>

      {/* 2. TOP HORIZONTAL GRID: AUTH + STATS BENTO */}
      <section className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
        <div className="md:col-span-8 flex flex-col">
          <AuthBar />
        </div>
        
        {/* Statistics (Bento Column 9-12) */}
        <div className="md:col-span-4 bg-indigo-50 border border-indigo-100 rounded-3xl p-6 flex flex-col justify-between shadow-xs transition-all hover:shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] font-extrabold text-indigo-400 uppercase tracking-widest block mb-1">Superficie Revelada</span>
              <p className="text-2xl font-black text-indigo-900 tracking-tight">
                {estimatedSurface.toLocaleString()} <span className="text-xs font-normal text-indigo-500">unidades²</span>
              </p>
            </div>
            <div className="p-2 bg-white rounded-xl shadow-xs text-indigo-600 border border-indigo-100/50">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          
          <div className="mt-4">
            <div className="w-full h-2 bg-indigo-200/50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-600 rounded-full transition-all duration-700" 
                style={{ width: `${Math.min(95, 100 - percentRemaining)}%` }}
              ></div>
            </div>
            <p className="text-[10px] text-indigo-550 mt-2 font-bold uppercase tracking-widest font-mono">
              {percentRemaining}% de espacio virgen disponible
            </p>
          </div>
        </div>
      </section>

      {/* 3. MULTIPLAYER CANVAS & ACTION PANELS */}
      <main className="w-full flex-1 flex flex-col gap-8">
        
        {/* Collaborative Canvas Workspace */}
        <section className="w-full">
          <CanvasBoard />
        </section>

        {/* 4. MODERATOR PANEL */}
        <section id="moderation-admin-area" className="w-full pt-4">
          <div className="flex items-center gap-3 mb-4 px-1">
            <div className="p-2 bg-zinc-200/60 text-zinc-650 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-zinc-900 tracking-tight text-sm">Controles de Moderación Especiales</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Acceso administrativo inmediato sobre usuarios infractores y perímetros trazados.</p>
            </div>
          </div>
          <AdminPanel />
        </section>

      </main>

      {/* 5. APP FOOTER */}
      <footer className="w-full border-t border-zinc-205 pt-8 mt-16 text-center text-xs text-zinc-400 font-mono">
        <p>© 2026 MicroPaint. Impulsado por Google AI Studio y Firestore.</p>
        <p className="mt-1 text-[10px] text-zinc-400">Diseño Bento Grid Limpio • Navegación Infinita 1M² • Compresión Instantánea.</p>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <FirebaseProvider>
      <AppContent />
    </FirebaseProvider>
  );
}
