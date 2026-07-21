import { create } from 'zustand';

interface UIState {
  currentDrawMode: 'select' | 'draw' | 'erase';
  currentEngineMode: '2d' | '3d';
  zoomScale: number;
  panX: number;
  panY: number;
  selectedElementId: string | null;
  measureMode: boolean;
  setDrawMode: (mode: 'select' | 'draw' | 'erase') => void;
  setEngineMode: (mode: '2d' | '3d') => void;
  setZoom: (scale: number) => void;
  setPan: (x: number, y: number) => void;
  setSelectedElementId: (id: string | null) => void;
  setMeasureMode: (active: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentDrawMode: 'select',
  currentEngineMode: '2d',
  zoomScale: 1.0,
  panX: 0,
  panY: 0,
  selectedElementId: null,
  measureMode: false,
  
  setDrawMode: (mode) => set({ currentDrawMode: mode }),
  setEngineMode: (mode) => set({ currentEngineMode: mode }),
  setZoom: (scale) => set({ zoomScale: scale }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setSelectedElementId: (id) => set({ selectedElementId: id }),
  setMeasureMode: (active) => set({ measureMode: active }),
}));
