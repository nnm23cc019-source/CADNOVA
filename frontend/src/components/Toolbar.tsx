import React from 'react';
import { useUIStore } from '../store/uiStore';
import { MousePointer2, Pencil, Eraser, Box, Square, GripHorizontal } from 'lucide-react';

const Toolbar = () => {
  const { currentDrawMode, setDrawMode, currentEngineMode, setEngineMode } = useUIStore();

  return (
    <div className="absolute top-4 left-4 z-40 flex flex-col gap-2">
      <div className="bg-slate-900/90 backdrop-blur border border-white/10 rounded-xl p-2 flex flex-col gap-2 shadow-xl">
        <button 
          onClick={() => setDrawMode('select')}
          className={`p-2 rounded-lg transition-colors ${currentDrawMode === 'select' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          title="Select (V)"
        >
          <MousePointer2 className="w-5 h-5" />
        </button>
        <button 
          onClick={() => setDrawMode('draw')}
          className={`p-2 rounded-lg transition-colors ${currentDrawMode === 'draw' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          title="Draw (D)"
        >
          <Pencil className="w-5 h-5" />
        </button>
        <button 
          onClick={() => setDrawMode('erase')}
          className={`p-2 rounded-lg transition-colors ${currentDrawMode === 'erase' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          title="Erase (E)"
        >
          <Eraser className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-slate-900/90 backdrop-blur border border-white/10 rounded-xl p-2 flex flex-col gap-2 shadow-xl mt-4">
        <button 
          onClick={() => setEngineMode('2d')}
          className={`p-2 rounded-lg transition-colors text-xs font-bold ${currentEngineMode === '2d' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
        >
          2D
        </button>
        <button 
          onClick={() => setEngineMode('3d')}
          className={`p-2 rounded-lg transition-colors text-xs font-bold ${currentEngineMode === '3d' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
        >
          3D
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
