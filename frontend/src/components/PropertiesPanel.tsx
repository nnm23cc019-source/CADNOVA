import React from 'react';
import { useUIStore } from '../store/uiStore';
import { useCadStore } from '../store/cadStore';

const PropertiesPanel = () => {
  const { selectedElementId } = useUIStore();
  const { devices, shapes } = useCadStore();

  const selectedDevice = devices.find(d => d.id === selectedElementId);
  const selectedShape = shapes.find(s => s.id === selectedElementId);

  if (!selectedElementId) {
    return (
      <div className="absolute top-4 right-4 z-40 w-64 bg-slate-900/90 backdrop-blur border border-white/10 rounded-xl p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-400 mb-2">Properties</h3>
        <p className="text-xs text-slate-500">No element selected</p>
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-40 w-64 bg-slate-900/90 backdrop-blur border border-white/10 rounded-xl p-4 shadow-xl">
      <h3 className="text-sm font-semibold text-white mb-4">Properties</h3>
      
      {selectedDevice && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Name</span>
            <span className="text-white">{selectedDevice.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Type</span>
            <span className="text-white capitalize">{selectedDevice.type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">X</span>
            <span className="text-white">{Math.round(selectedDevice.x)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Y</span>
            <span className="text-white">{Math.round(selectedDevice.y)}</span>
          </div>
        </div>
      )}

      {selectedShape && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Name</span>
            <span className="text-white">{selectedShape.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Type</span>
            <span className="text-white capitalize">{selectedShape.type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Material</span>
            <span className="text-white">{selectedShape.material}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertiesPanel;
