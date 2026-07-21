export interface DeviceProperties {
  brightness?: number;
  color?: string;
  temperature?: number;
  humidity?: number;
  volume?: number;
  track?: string;
  motionDetected?: boolean;
  pinCode?: string;
  isLocked?: boolean;
  lockAttempts?: number;
  scale?: number;
}

export interface Device {
  id: string;
  name: string;
  type: 'light' | 'camera' | 'thermostat' | 'speaker' | 'lock' | 'plug' | 'sensor' | 'motion';
  room: string;
  x: number;
  y: number;
  state: boolean;
  properties: DeviceProperties;
  groupId?: string;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  powerUsage?: number;
  price?: number;
}

export interface Shape3D {
  id: string;
  type: 'cube' | 'cylinder' | 'gear' | 'shaft';
  name: string;
  material: 'Steel' | 'Aluminum' | 'PLA' | 'ABS' | 'Copper';
  x: number;
  y: number;
  z: number;
  size?: number; // cube
  radius?: number; // cylinder
  height?: number; // cylinder
  teeth?: number; // gear
  thickness?: number; // gear thickness (face width)
  diameter?: number; // shaft
  length?: number; // shaft
  groupId?: string;
  rotationY?: number;
}

export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
  color?: string;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  emoji: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  area?: number;
}
