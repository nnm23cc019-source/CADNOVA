import { create } from 'zustand';
import type { Device, Shape3D, Wall, Room } from '../types/cad';

interface CadState {
  devices: Device[];
  shapes: Shape3D[];
  walls: Wall[];
  rooms: Room[];
  addDevice: (device: Device) => void;
  updateDevice: (id: string, data: Partial<Device>) => void;
  removeDevice: (id: string) => void;
  addShape: (shape: Shape3D) => void;
  updateShape: (id: string, data: Partial<Shape3D>) => void;
  removeShape: (id: string) => void;
  addWall: (wall: Wall) => void;
  addRoom: (room: Room) => void;
  // TODO: Add remaining state modifier actions (undo/redo, etc.)
}

export const useCadStore = create<CadState>((set) => ({
  devices: [],
  shapes: [],
  walls: [],
  rooms: [],
  addDevice: (device) => set((state) => ({ devices: [...state.devices, device] })),
  updateDevice: (id, data) => set((state) => ({
    devices: state.devices.map(d => d.id === id ? { ...d, ...data } : d)
  })),
  removeDevice: (id) => set((state) => ({ devices: state.devices.filter(d => d.id !== id) })),
  
  addShape: (shape) => set((state) => ({ shapes: [...state.shapes, shape] })),
  updateShape: (id, data) => set((state) => ({
    shapes: state.shapes.map(s => s.id === id ? { ...s, ...data } : s)
  })),
  removeShape: (id) => set((state) => ({ shapes: state.shapes.filter(s => s.id !== id) })),
  
  addWall: (wall) => set((state) => ({ walls: [...state.walls, wall] })),
  addRoom: (room) => set((state) => ({ rooms: [...state.rooms, room] })),
}));
