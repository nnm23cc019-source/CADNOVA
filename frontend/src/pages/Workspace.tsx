import React, { useEffect } from 'react';
import Toolbar from '../components/Toolbar';
import PropertiesPanel from '../components/PropertiesPanel';
import Canvas2D from '../components/Canvas2D';
import Canvas3D from '../components/Canvas3D';
import { useUIStore } from '../store/uiStore';
import { useCadStore } from '../store/cadStore';

const Workspace = () => {
  const { currentEngineMode } = useUIStore();
  const { addDevice, addWall } = useCadStore();

  // Load some initial mock data for testing Phase 2
  useEffect(() => {
    // Check if empty, if so populate some data
    const unsubscribe = useCadStore.subscribe((state) => {
      // Logic for listening to store changes if needed
    });
    
    // Using setTimeout to allow mount
    setTimeout(() => {
      const state = useCadStore.getState();
      if (state.devices.length === 0 && state.walls.length === 0) {
        addWall({ id: 'w1', x1: 100, y1: 100, x2: 400, y2: 100, thickness: 10 });
        addWall({ id: 'w2', x1: 400, y1: 100, x2: 400, y2: 400, thickness: 10 });
        addWall({ id: 'w3', x1: 400, y1: 400, x2: 100, y2: 400, thickness: 10 });
        addWall({ id: 'w4', x1: 100, y1: 400, x2: 100, y2: 100, thickness: 10 });
        
        addDevice({
          id: 'd1', name: 'Living Room Light', type: 'light', room: 'living', 
          x: 250, y: 250, state: true, properties: {}
        });
      }
    }, 100);

    return () => unsubscribe();
  }, [addDevice, addWall]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30">
      <Toolbar />
      <PropertiesPanel />
      
      {currentEngineMode === '2d' ? <Canvas2D /> : <Canvas3D />}
      
      {/* Top Navigation Bar embedded in Workspace */}
      <div className="absolute top-0 left-0 w-full h-12 border-b border-white/10 bg-slate-900/80 backdrop-blur flex items-center justify-between px-4 z-30">
        <div className="ml-16 font-semibold text-sm tracking-tight text-white flex items-center gap-2">
          CADNOVA.io Workspace
        </div>
        <div className="flex gap-4">
          <button className="px-3 py-1 bg-indigo-500 hover:bg-indigo-600 rounded-md text-xs font-medium transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default Workspace;
