import React from 'react';
import { useCadStore } from '../store/cadStore';
import { useUIStore } from '../store/uiStore';
import type { Device, Wall, Room } from '../types/cad';

const ICON_SVG: Record<string, string> = {
  light: `<path d="M12 15c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.5 1.5-3.5A5 5 0 0 0 7 9c0 1 .4 2.5 1.5 3.5.7.8 1.3 1.5 1.5 2.5" fill="none" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="18" x2="16" y2="18" stroke-width="2"/><line x1="10" y1="21" x2="14" y2="21" stroke-width="2"/>`,
  camera: `<path d="M21 17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="none" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke-width="2"/>`,
  thermostat: `<line x1="12" y1="8" x2="12" y2="20" stroke-width="2"/><path d="M15.5 7A5 5 0 1 0 8.5 7" fill="none" stroke-width="2"/><circle cx="12" cy="4" r="1.5" stroke-width="2"/>`,
  speaker: `<rect x="5" y="3" width="14" height="18" rx="2" ry="2" fill="none" stroke-width="2"/><circle cx="12" cy="14" r="3" fill="none" stroke-width="2"/><line x1="12" y1="6" x2="12.01" y2="6" stroke-width="3"/>`,
  lock: `<rect x="5" y="10" width="14" height="11" rx="2" ry="2" fill="none" stroke-width="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4" fill="none" stroke-width="2"/>`,
  plug: `<path d="M17 10h-1.5a3.5 3.5 0 0 0-7 0H7a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1.5a3.5 3.5 0 0 0 7 0H17a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2z" fill="none" stroke-width="2"/><line x1="12" y1="3" x2="12" y2="6" stroke-width="2"/>`,
  sensor: `<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" fill="none" stroke-width="2"/>`,
  motion: `<circle cx="12" cy="12" r="3" fill="none" stroke-width="2"/><path d="M5.5 5C7 3.5 9.5 3 12 3s4.5.5 6.5 2" fill="none" stroke-width="2" stroke-linecap="round"/><path d="M3 8.5C5 6 8.5 4.5 12 4.5s7 1.5 9 4" fill="none" stroke-width="2" stroke-linecap="round"/>`,
};

const ACCENT_COLORS: Record<string, string> = {
  light: '#e95d3c',
  camera: '#2b8a3e',
  thermostat: '#1971c2',
  speaker: '#9c36b5',
  lock: '#f59f00',
  plug: '#0ca678',
  sensor: '#005477',
  motion: '#c2255c'
};

const Canvas2D = () => {
  const { devices, walls, rooms } = useCadStore();
  const { zoomScale, panX, panY, selectedElementId, setSelectedElementId, currentDrawMode } = useUIStore();

  const handleDeviceClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (currentDrawMode === 'select') {
      setSelectedElementId(id);
    }
  };

  const handleCanvasClick = () => {
    if (currentDrawMode === 'select') {
      setSelectedElementId(null);
    }
  };

  return (
    <div 
      className="absolute inset-0 bg-slate-900 overflow-hidden cursor-crosshair"
      onClick={handleCanvasClick}
    >
      {/* Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #4f46e5 1px, transparent 1px),
            linear-gradient(to bottom, #4f46e5 1px, transparent 1px)
          `,
          backgroundSize: `${40 * zoomScale}px ${40 * zoomScale}px`,
          backgroundPosition: `${panX}px ${panY}px`
        }}
      />
      
      <svg 
        className="w-full h-full absolute inset-0"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoomScale})`,
          transformOrigin: '0 0'
        }}
      >
        {/* Draw Rooms */}
        {rooms.map((room) => (
          <rect 
            key={room.id}
            x={room.x}
            y={room.y}
            width={room.width}
            height={room.height}
            fill={room.color}
            fillOpacity={0.1}
            stroke={room.color}
            strokeWidth={2}
            className="transition-colors"
          />
        ))}

        {/* Draw Walls */}
        {walls.map((wall) => (
          <line
            key={wall.id}
            x1={wall.x1}
            y1={wall.y1}
            x2={wall.x2}
            y2={wall.y2}
            stroke={wall.color || '#94a3b8'}
            strokeWidth={wall.thickness || 8}
            strokeLinecap="round"
          />
        ))}

        {/* Draw Devices */}
        {devices.map((device) => {
          const isSelected = selectedElementId === device.id;
          const color = ACCENT_COLORS[device.type] || '#fff';
          
          return (
            <g 
              key={device.id}
              transform={`translate(${device.x}, ${device.y}) rotate(${device.rotation || 0}) scale(${device.flipH ? -1 : 1}, ${device.flipV ? -1 : 1})`}
              onClick={(e) => handleDeviceClick(e as unknown as React.MouseEvent, device.id)}
              className="cursor-pointer"
            >
              <circle 
                cx="0" 
                cy="0" 
                r="24" 
                fill="#1e293b" 
                stroke={isSelected ? '#6366f1' : '#334155'}
                strokeWidth={isSelected ? 3 : 2}
                className="transition-colors hover:stroke-indigo-400"
              />
              <g 
                transform="translate(-12, -12)" 
                stroke={color}
                dangerouslySetInnerHTML={{ __html: ICON_SVG[device.type] || '' }}
              />
              {/* Online/State indicator */}
              <circle 
                cx="16" 
                cy="-16" 
                r="4" 
                fill={device.state ? '#22c55e' : '#ef4444'} 
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default Canvas2D;
