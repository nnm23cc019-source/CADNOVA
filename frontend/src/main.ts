import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- TYPE DEFINITIONS ---

interface DeviceProperties {
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

interface Device {
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

interface Shape3D {
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

interface DesignMetadata {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  geometry?: any;
}

// Wall segment for Draw Wall tool
interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
  color?: string;
}

// Room for Add Room tool
interface Room {
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

// Log entry for action history
interface LogEntry {
  step: number;
  action: string;
  timestamp: string;
}

interface UserSession {
  id: string;
  username: string;
  role: 'student' | 'engineer' | 'admin';
}


// ==================== IOT HELPERS ====================
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function updateColorPreview(hex: string) {
  if (colorPreviewCircle) {
    colorPreviewCircle.style.background = hex;
    colorPreviewCircle.style.boxShadow = `0 0 8px ${hex}80`;
  }
  if (rgbValueDisplay) {
    const rgb = hexToRgb(hex);
    if (rgb) rgbValueDisplay.textContent = `R:${rgb.r} G:${rgb.g} B:${rgb.b}`;
  }
}

function logIotActivity(action: string, details: string) {
  if (!iotActivityLogList) return;
  const noEvents = iotActivityLogList.querySelector('.no-events');
  if (noEvents) noEvents.remove();
  
  const div = document.createElement('div');
  div.className = 'log-item';
  div.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span> <strong>${action}</strong>: ${details}`;
  iotActivityLogList.prepend(div);
  
  // Also add to notifications drawer if it's important (like connection changes)
  if (action.includes('Connection') && iotNotificationsList) {
    const notifNoEvents = iotNotificationsList.querySelector('.no-events');
    if (notifNoEvents) notifNoEvents.remove();
    const notif = div.cloneNode(true);
    iotNotificationsList.prepend(notif);
    iotNotificationsDrawer?.classList.remove('hidden');
    // auto hide after 5s
    setTimeout(() => {
       iotNotificationsDrawer?.classList.add('hidden');
    }, 5000);
  }
}

let brightnessHistory: number[] = Array(20).fill(0);
function updateBrightnessSparkline(val: number) {
  brightnessHistory.push(val);
  brightnessHistory.shift();
  if (!brightSparkPath || !brightSparkArea) return;
  
  const max = 100;
  const width = 200;
  const height = 30;
  const step = width / (brightnessHistory.length - 1);
  
  let pathD = 'M 0 ' + (height - (brightnessHistory[0] / max) * height);
  for (let i = 1; i < brightnessHistory.length; i++) {
    pathD += ` L ${i * step} ${height - (brightnessHistory[i] / max) * height}`;
  }
  brightSparkPath.setAttribute('d', pathD);
  brightSparkArea.setAttribute('d', pathD + ` L ${width} ${height} L 0 ${height} Z`);
}
// =====================================================

// --- STATE MANAGEMENT ---

let currentUser: UserSession | null = null;
let currentView: string = 'landing';

// 2D Smart Home floor plan state
let placedDevices: Device[] = [];
let selectedDeviceId: string | null = null;
let currentDesignId: string = generateUUID();
let isGridVisible: boolean = true;

// Dragging tracking for 2D SVG
let draggedElementId: string | null = null;
let dragOffsetX: number = 0;
let dragOffsetY: number = 0;

// 3D Solids modeler state
let placedShapes: Shape3D[] = [];
let selectedShapeId: string | null = null;
let currentEngineMode: '2d' | '3d' = '2d';
let currentDrawMode: 'select' | 'draw' | 'erase' = 'select';

// Multi-selection, Clipboard, Undo/Redo history, Zoom/Pan and Ruler states (Phase 2, 3, 5 additions)
let selectedDeviceIds = new Set<string>();
let selectedShapeIds = new Set<string>();
let clipboardDevices: Device[] = [];
let clipboardShapes: Shape3D[] = [];
let undoHistory: string[] = [];
let redoHistory: string[] = [];
let zoomScale: number = 1.0;
let panX: number = 0;
let panY: number = 0;
let isPanning: boolean = false;
let startPanX: number = 0;
let startPanY: number = 0;
let snapToGrid: boolean = true;
const GRID_SNAP_VAL = 20;
let measureMode: boolean = false;
let measurePoints: { x: number; y: number }[] = [];
let favoriteDeviceNames = new Set<string>(JSON.parse(localStorage.getItem('cadnova_favorites') || '[]'));
let autoSaveEnabled: boolean = true;
let simulateOfflineAI: boolean = false;

// Walls and Rooms state (Draw Wall / Add Room tools)
let placedWalls: Wall[] = [];
let placedRooms: Room[] = [];
let selectedWallId: string | null = null;
let selectedRoomId: string | null = null;
let isDrawingWall: boolean = false;
let wallStartPoint: { x: number; y: number } | null = null;

// Action history log (for Log modal)
let actionLog: LogEntry[] = [];
let actionLogStep: number = 0;

function logAction(action: string) {
  actionLogStep++;
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
  actionLog.push({ step: actionLogStep, action, timestamp: time });
  if (actionLog.length > 100) actionLog.shift();
}



// Three.js viewport variables
let threeScene: THREE.Scene | null = null;
let threeCamera: THREE.PerspectiveCamera | null = null;
let threeRenderer: THREE.WebGLRenderer | null = null;
let threeControls: OrbitControls | null = null;
let threeMeshMap = new Map<string, THREE.Mesh>();

// Voice Commands speech recognition
let speechRecognizer: any = null;
let voiceActive = false;

// Simulated team collaboration state
let collabInterval: number | null = null;

// API Base URL (connects directly to the backend Express server)
const API_BASE = import.meta.env.VITE_API_URL || '/api';

// SVG Icon templates for placed 2D canvas nodes (Original)
const ICON_SVG = {
  light: `<path d="M12 15c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.5 1.5-3.5A5 5 0 0 0 7 9c0 1 .4 2.5 1.5 3.5.7.8 1.3 1.5 1.5 2.5" fill="none" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="18" x2="16" y2="18" stroke-width="2"/><line x1="10" y1="21" x2="14" y2="21" stroke-width="2"/>`,
  camera: `<path d="M21 17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="none" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke-width="2"/>`,
  thermostat: `<line x1="12" y1="8" x2="12" y2="20" stroke-width="2"/><path d="M15.5 7A5 5 0 1 0 8.5 7" fill="none" stroke-width="2"/><circle cx="12" cy="4" r="1.5" stroke-width="2"/>`,
  speaker: `<rect x="5" y="3" width="14" height="18" rx="2" ry="2" fill="none" stroke-width="2"/><circle cx="12" cy="14" r="3" fill="none" stroke-width="2"/><line x1="12" y1="6" x2="12.01" y2="6" stroke-width="3"/>`,
  lock: `<rect x="5" y="10" width="14" height="11" rx="2" ry="2" fill="none" stroke-width="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4" fill="none" stroke-width="2"/>`,
  plug: `<path d="M17 10h-1.5a3.5 3.5 0 0 0-7 0H7a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1.5a3.5 3.5 0 0 0 7 0H17a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2z" fill="none" stroke-width="2"/><line x1="12" y1="3" x2="12" y2="6" stroke-width="2"/>`,
  sensor: `<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" fill="none" stroke-width="2"/>`,
  motion: `<circle cx="12" cy="12" r="3" fill="none" stroke-width="2"/><path d="M5.5 5C7 3.5 9.5 3 12 3s4.5.5 6.5 2" fill="none" stroke-width="2" stroke-linecap="round"/><path d="M3 8.5C5 6 8.5 4.5 12 4.5s7 1.5 9 4" fill="none" stroke-width="2" stroke-linecap="round"/>`,
};

const ACCENT_COLORS = {
  light: '#e95d3c', // Brand Orange
  camera: '#2b8a3e', // Forest Green
  thermostat: '#5c2a8f', // Brand Purple
  speaker: '#5c2a8f', // Brand Purple
  lock: '#e03131', // Danger Red
  plug: '#e95d3c', // Brand Orange
  sensor: '#e95d3c', // Brand Orange
  motion: '#5c2a8f'  // Brand Purple
};

// Material Color representations for Three.js shaders
const MATERIAL_COLORS = {
  Steel: 0xb0c4de,
  Aluminum: 0xd3d3d3,
  PLA: 0x10b981,
  ABS: 0xf59e0b,
  Copper: 0xd87a50
};

// --- DOM ELEMENTS ---

const designNameInput = document.getElementById('design-name-input') as HTMLInputElement;
const designDescInput = document.getElementById('design-desc-input') as HTMLTextAreaElement;
const btnSaveDesign = document.getElementById('btn-save-design') as HTMLButtonElement;
const btnNewDesign = document.getElementById('btn-new-design') as HTMLButtonElement;
const savedDesignsList = document.getElementById('saved-designs-list') as HTMLDivElement;

const btnToggleGrid = document.getElementById('btn-toggle-grid') as HTMLButtonElement;
const btnClearCanvas = document.getElementById('btn-clear-canvas') as HTMLButtonElement;
const gridBg = document.getElementById('grid-bg') as unknown as SVGElement;
const cadCanvas = document.getElementById('cad-canvas') as unknown as SVGSVGElement;
const placedDevicesGroup = document.getElementById('placed-devices-group') as unknown as SVGElement;

// Properties editor
const noDeviceSelected = document.getElementById('no-device-selected') as HTMLDivElement;
const deviceEditor = document.getElementById('device-editor') as HTMLDivElement;
const editorDeviceType = document.getElementById('editor-device-type') as HTMLSpanElement;
const btnDeleteDevice = document.getElementById('btn-delete-device') as HTMLButtonElement;
const propName = document.getElementById('prop-name') as HTMLInputElement;
const propRoom = document.getElementById('prop-room') as HTMLSelectElement;
const propState = document.getElementById('prop-state') as HTMLInputElement;

// Conditionals (Original Light, Camera, Thermostat, Speaker)
const ctrlLight = document.getElementById('ctrl-light') as HTMLDivElement;
const propBrightness = document.getElementById('prop-brightness') as HTMLInputElement;
const valBrightness = document.getElementById('val-brightness') as HTMLSpanElement;
const propColor = document.getElementById('prop-color') as HTMLInputElement;

const ctrlThermostat = document.getElementById('ctrl-thermostat') as HTMLDivElement;
const propTemp = document.getElementById('prop-temp') as HTMLInputElement;
const valTemp = document.getElementById('val-temp') as HTMLSpanElement;

const ctrlCamera = document.getElementById('ctrl-camera') as HTMLDivElement;
const ctrlSpeaker = document.getElementById('ctrl-speaker') as HTMLDivElement;
const propVolume = document.getElementById('prop-volume') as HTMLInputElement;
const valVolume = document.getElementById('val-volume') as HTMLSpanElement;
const propTrack = document.getElementById('prop-track') as HTMLSelectElement;

// New feature DOM references (Original sensor display)
const ctrlSensor = document.getElementById('ctrl-sensor') as HTMLDivElement;
const ctrlMotion = document.getElementById('ctrl-motion') as HTMLDivElement;
const ctrlLock = document.getElementById('ctrl-lock') as HTMLDivElement;
const liveTempDisplay = document.getElementById('live-temp-display') as HTMLSpanElement;
const liveHumidityDisplay = document.getElementById('live-humidity-display') as HTMLSpanElement;
const sparklinePath = document.getElementById('sparkline-path') as unknown as SVGPathElement;
const sparklineArea = document.getElementById('sparkline-area') as unknown as SVGPathElement;
const motionStatusDisplay = document.getElementById('motion-status-display') as HTMLDivElement;
const motionStatusText = document.getElementById('motion-status-text') as HTMLSpanElement;
const motionLastTime = document.getElementById('motion-last-time') as HTMLSpanElement;
const motionEventCount = document.getElementById('motion-event-count') as HTMLSpanElement;
const motionEventLog = document.getElementById('motion-event-log') as HTMLDivElement;
const lockStatusDisplay = document.getElementById('lock-status-display') as HTMLDivElement;
const lockIconDisplay = document.getElementById('lock-icon-display') as HTMLSpanElement;
const lockStateLabel = document.getElementById('lock-state-label') as HTMLSpanElement;
const lockAttemptsLeft = document.getElementById('lock-attempts-left') as HTMLSpanElement;
const pinDisplayDots = document.getElementById('pin-display-dots') as HTMLSpanElement;
const newPinInput = document.getElementById('new-pin-input') as HTMLInputElement;
const btnSetPin = document.getElementById('btn-set-pin') as HTMLButtonElement;
const cameraVideo = document.getElementById('camera-video') as HTMLVideoElement;
const cameraCanvasOverlay = document.getElementById('camera-canvas-overlay') as HTMLCanvasElement;
const camNoSignal = document.getElementById('cam-no-signal') as HTMLDivElement;
const camAiBadge = document.getElementById('cam-ai-badge') as HTMLSpanElement;
const btnCameraStart = document.getElementById('btn-camera-start') as HTMLButtonElement;
const btnCameraAi = document.getElementById('btn-camera-ai') as HTMLButtonElement;
const btnCameraStop = document.getElementById('btn-camera-stop') as HTMLButtonElement;
const aiDetectionsList = document.getElementById('ai-detections-list') as HTMLDivElement;
const intrusionBanner = document.getElementById('intrusion-alert-banner') as HTMLDivElement;
const intrusionAlertMessage = document.getElementById('intrusion-alert-message') as HTMLSpanElement;
const btnDismissAlert = document.getElementById('btn-dismiss-alert') as HTMLButtonElement;
const alertBadge = document.getElementById('alert-badge') as HTMLDivElement;
const securityArmToggle = document.getElementById('security-arm-toggle') as HTMLInputElement;
const securityStatusBar = document.getElementById('security-status-bar') as HTMLDivElement;
const securityStatusIcon = document.getElementById('security-status-icon') as HTMLSpanElement;
const securityStatusLabel = document.getElementById('security-status-label') as HTMLSpanElement;
const secMetricAlerts = document.getElementById('sec-metric-alerts') as HTMLSpanElement;
const secMetricCameras = document.getElementById('sec-metric-cameras') as HTMLSpanElement;
const secMetricLocks = document.getElementById('sec-metric-locks') as HTMLSpanElement;
const secMetricSensors = document.getElementById('sec-metric-sensors') as HTMLSpanElement;
const globalAlertLog = document.getElementById('global-alert-log') as HTMLDivElement;
const btnLightToggle = document.getElementById('btn-light-toggle') as HTMLButtonElement;

// IoT Additions
const colorPreviewCircle = document.getElementById('color-preview-circle') as HTMLDivElement;
const rgbValueDisplay = document.getElementById('rgb-value-display') as HTMLSpanElement;
const esp32DeviceSelect = document.getElementById('esp32-device-select') as HTMLSelectElement;
const btnCloseNotifications = document.getElementById('btn-close-notifications') as HTMLButtonElement;
const iotNotificationsDrawer = document.getElementById('iot-notifications-drawer') as HTMLDivElement;
const iotNotificationsList = document.getElementById('iot-notifications-list') as HTMLDivElement;
const iotActivityLogList = document.getElementById('iot-activity-log-list') as HTMLDivElement;
const btnClearIotLog = document.getElementById('btn-clear-iot-log') as HTMLButtonElement;
const schedulesList = document.getElementById('schedules-list') as HTMLDivElement;
const btnAddSchedule = document.getElementById('btn-add-schedule') as HTMLButtonElement;
const brightSparkPath = document.getElementById('bright-spark-path') as unknown as SVGPathElement;
const brightSparkArea = document.getElementById('bright-spark-area') as unknown as SVGPathElement;


// Analytics metrics
const metricActiveCount = document.getElementById('metric-active-count') as HTMLSpanElement;
const metricPowerUsage = document.getElementById('metric-power-usage') as HTMLSpanElement;
const metricIotStrength = document.getElementById('metric-iot-strength') as HTMLSpanElement;

// --- ADVANCED FEATURE STATE (Original) ---

const sensorReadings = new Map<string, number[]>(); // deviceId -> temp readings
const sensorIntervals = new Map<string, number>(); // deviceId -> intervalId
let currentSensorDeviceId: string | null = null;

const motionIntervals = new Map<string, number>(); // deviceId -> intervalId
const motionEventCounts = new Map<string, number>(); // deviceId -> count
let totalAlertCount = 0;

let cameraStream: MediaStream | null = null;
let aiModel: any = null;
let aiEnabled = false;
let aiAnimFrame: number | null = null;

let currentPinInput = '';
const DEFAULT_PIN = '1234';
const lockPins = new Map<string, string>(); // deviceId -> pin
const lockAttempts = new Map<string, number>(); // deviceId -> failed attempts
const lockStates = new Map<string, boolean>(); // deviceId -> isLocked (true=locked)

let systemArmed = false;

// --- CUSTOM DIALOG & TOAST SYSTEM (Original) ---

function showCustomConfirm(message: string): Promise<boolean> {
  const modal = document.getElementById('custom-confirm-modal') as HTMLDivElement;
  const msgEl = document.getElementById('confirm-modal-message') as HTMLParagraphElement;
  const btnOk = document.getElementById('btn-confirm-ok') as HTMLButtonElement;
  const btnCancel = document.getElementById('btn-confirm-cancel') as HTMLButtonElement;
  const btnClose = document.getElementById('btn-close-modal') as HTMLButtonElement;

  msgEl.textContent = message;
  modal.classList.remove('hidden');

  return new Promise((resolve) => {
    const handleOk = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      modal.classList.add('hidden');
      btnOk.removeEventListener('click', handleOk);
      btnCancel.removeEventListener('click', handleCancel);
      btnClose.removeEventListener('click', handleCancel);
    };

    btnOk.addEventListener('click', handleOk);
    btnCancel.addEventListener('click', handleCancel);
    btnClose.addEventListener('click', handleCancel);
  });
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 3000);
}

// --- HELPER UTILITIES (Original) ---

function generateUUID(): string {
  return 'design-' + Math.random().toString(36).substr(2, 9);
}

// --- VIEW NAVIGATION / ROUTING (CADNOVA.io Addition) ---

function initRouter() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      const target = link.getAttribute('data-target');
      if (target) switchView(target);
    });
  });

  document.getElementById('btn-hero-launch')?.addEventListener('click', () => {
    if (currentUser) {
      switchView('dashboard');
    } else {
      switchView('auth');
    }
  });

  document.getElementById('nav-brand-logo')?.addEventListener('click', () => {
    switchView('landing');
  });

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('cadnova_token');
    currentUser = null;
    document.getElementById('user-profile-badge')?.classList.add('hidden');
    document.getElementById('btn-show-login')?.classList.remove('hidden');
    document.getElementById('app-main-nav')?.classList.add('hidden');
    showToast('Logged out successfully', 'info');
    switchView('landing');
  });

  document.getElementById('btn-show-login')?.addEventListener('click', () => {
    switchView('auth');
  });

  // Landing pricing select buttons
  document.querySelectorAll('.select-tier-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedRole = btn.getAttribute('data-role');
      switchView('auth');
      // Set register form default
      const selectRole = document.getElementById('reg-role') as HTMLSelectElement;
      if (selectRole && selectedRole) selectRole.value = selectedRole;
      toggleAuthTab('register');
    });
  });
}

function switchView(viewName: string) {
  currentView = viewName;
  document.querySelectorAll('.app-view').forEach(view => {
    view.classList.add('hidden');
  });
  const activeView = document.getElementById(`view-${viewName}`);
  if (activeView) activeView.classList.remove('hidden');

  // Log active mode to read variable and prevent TS lint error
  console.log("Current view mode:", currentView, "Engine mode:", currentEngineMode);

  // Update nav links active class
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('data-target') === viewName) {
      link.classList.add('active');
    }
  });

  if (viewName === 'dashboard') {
    loadDashboardProjects();
  } else if (viewName === 'workspace') {
    renderPlacedDevices();
    renderPlaced3DShapes();
    setTimeout(() => {
      if (threeRenderer && threeCamera) {
        // Force resizing Three.js view
        const container = document.getElementById('three-canvas-container');
        if (container) {
          threeRenderer.setSize(container.clientWidth, container.clientHeight || 480);
          threeCamera.aspect = container.clientWidth / (container.clientHeight || 480);
          threeCamera.updateProjectionMatrix();
        }
      }
    }, 100);
  } else if (viewName === 'community') {
    loadCommunityGallery();
  } else if (viewName === 'admin') {
    loadAdminUsers();
  }
}

// --- AUTHENTICATION MODULE (CADNOVA.io Addition) ---

function initAuth() {
  const tabLogin = document.getElementById('tab-login') as HTMLButtonElement;
  const tabRegister = document.getElementById('tab-register') as HTMLButtonElement;
  const formLogin = document.getElementById('form-login') as HTMLFormElement;
  const formRegister = document.getElementById('form-register') as HTMLFormElement;

  tabLogin.addEventListener('click', () => toggleAuthTab('login'));
  tabRegister.addEventListener('click', () => toggleAuthTab('register'));

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (document.getElementById('login-username') as HTMLInputElement).value.trim();
    const password = (document.getElementById('login-password') as HTMLInputElement).value;

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('cadnova_token', data.token);
      currentUser = data.user;
      setupUserUI(data.user);
      showToast(`Welcome back, ${data.user.username}!`, 'success');
      switchView('dashboard');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  });

  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (document.getElementById('reg-username') as HTMLInputElement).value.trim();
    const password = (document.getElementById('reg-password') as HTMLInputElement).value;
    const role = (document.getElementById('reg-role') as HTMLSelectElement).value;

    if (!username || !password) {
      showToast('Username and password are required', 'error');
      return;
    }
    if (password.length < 8) {
      showToast('Password must be at least 8 characters long', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      showToast('Account created successfully', 'success');
      toggleAuthTab('login');
      (document.getElementById('login-username') as HTMLInputElement).value = username;
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  });

  // Autologin check
  checkSession();
}

function toggleAuthTab(mode: 'login' | 'register') {
  const tabLogin = document.getElementById('tab-login') as HTMLButtonElement;
  const tabRegister = document.getElementById('tab-register') as HTMLButtonElement;
  const formLogin = document.getElementById('form-login') as HTMLFormElement;
  const formRegister = document.getElementById('form-register') as HTMLFormElement;

  if (mode === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
  } else {
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
    formLogin.classList.add('hidden');
    formRegister.classList.remove('hidden');
  }
}

async function checkSession() {
  const token = localStorage.getItem('cadnova_token');
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const user = await res.json();
      currentUser = user;
      setupUserUI(user);
      switchView('dashboard');
    } else {
      localStorage.removeItem('cadnova_token');
    }
  } catch (err) {
    console.error('Session check failed', err);
  }
}

function setupUserUI(user: UserSession) {
  document.getElementById('btn-show-login')?.classList.add('hidden');
  const badge = document.getElementById('user-profile-badge');
  badge?.classList.remove('hidden');

  const headerUser = document.getElementById('header-username');
  if (headerUser) headerUser.textContent = user.username;

  const headerRole = document.getElementById('header-user-role');
  if (headerRole) {
    headerRole.textContent = user.role.toUpperCase();
    headerRole.className = `role-badge ${user.role}`;
  }

  // Display admin panels for admin role
  if (user.role === 'admin') {
    document.getElementById('nav-admin-link')?.classList.remove('hidden');
  } else {
    document.getElementById('nav-admin-link')?.classList.add('hidden');
  }

  // Update storage progress limit
  const quotaNote = document.getElementById('quota-tier-note');
  if (quotaNote) {
    if (user.role === 'engineer' || user.role === 'admin') {
      quotaNote.textContent = 'ðŸŒŸ Engineer Tier active. Enjoy 10 GB storage, version restores, and premium AI engines.';
      document.getElementById('quota-percentage')!.textContent = '0.15% (15 MB / 10 GB)';
      document.getElementById('quota-bar')!.style.width = '0.15%';
    } else {
      quotaNote.textContent = 'Upgrade to Engineer Tier for 10 GB cloud storage and version restore features.';
      document.getElementById('quota-percentage')!.textContent = '15% (15 MB / 100 MB)';
      document.getElementById('quota-bar')!.style.width = '15%';
    }
  }

  // Show navigation links
  document.getElementById('app-main-nav')?.classList.remove('hidden');
}

// --- DASHBOARD MODULE (CADNOVA.io Addition) ---

async function loadDashboardProjects() {
  const listEl = document.getElementById('dash-projects-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="loading-placeholder">Loading recent workspaces...</div>';

  try {
    const res = await fetch(`${API_BASE}/designs`);
    if (!res.ok) throw new Error('Failed to load');
    const designs: DesignMetadata[] = await res.json();

    listEl.innerHTML = '';
    if (designs.length === 0) {
      listEl.innerHTML = '<div class="empty-placeholder">No workspaces found. Click "New Design" to start!</div>';
      return;
    }

    designs.slice(0, 4).forEach(d => {
      const card = document.createElement('div');
      card.className = 'dash-project-card glass-card';

      const tag = d.description && d.description.includes('#tag:')
        ? d.description.split('#tag:')[1].split(' ')[0]
        : 'SmartHome';

      card.innerHTML = `
        <span class="project-fav-star">â­</span>
        <h4>${d.name}</h4>
        <p>${d.description?.replace(/#tag:\w+/, '') || 'No description provided.'}</p>
        <div class="dash-project-footer">
          <span class="badge">${tag}</span>
          <span>${d.updated_at ? new Date(d.updated_at).toLocaleDateString() : 'Just now'}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        loadSavedDesign(d.id);
        switchView('workspace');
      });

      listEl.appendChild(card);
    });
  } catch (err) {
    listEl.innerHTML = '<div class="empty-placeholder text-danger">Error fetching projects database.</div>';
  }
}

// --- 3D CANVAS THREE.JS MODULE (CADNOVA.io Addition) ---

function initThreeEngine() {
  const container = document.getElementById('three-canvas-container');
  if (!container) return;

  // Scene
  threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(0xf1f2f8);

  // Camera
  threeCamera = new THREE.PerspectiveCamera(45, container.clientWidth / 480, 0.1, 1000);
  threeCamera.position.set(100, 100, 150);

  // Renderer
  threeRenderer = new THREE.WebGLRenderer({ antialias: true });
  threeRenderer.setSize(container.clientWidth, 480);
  threeRenderer.shadowMap.enabled = true;
  container.appendChild(threeRenderer.domElement);

  // Orbit Controls
  threeControls = new OrbitControls(threeCamera, threeRenderer.domElement);
  threeControls.enableDamping = true;
  threeControls.dampingFactor = 0.05;

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  threeScene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(80, 120, 50);
  dirLight.castShadow = true;
  threeScene.add(dirLight);

  // Helper Grid
  const gridHelper = new THREE.GridHelper(160, 32, 0x5c2a8f, 0xc0c0c0);
  gridHelper.position.y = -0.5;
  threeScene.add(gridHelper);

  // Render loop
  function animate() {
    requestAnimationFrame(animate);
    if (threeControls) threeControls.update();
    if (threeRenderer && threeScene && threeCamera) {
      threeRenderer.render(threeScene, threeCamera);
    }
  }
  animate();

  // Mode toggles
  document.getElementById('btn-engine-2d')?.addEventListener('click', () => {
    currentEngineMode = '2d';
    document.getElementById('btn-engine-2d')?.classList.add('active');
    document.getElementById('btn-engine-3d')?.classList.remove('active');
    document.getElementById('container-canvas-2d')?.classList.remove('hidden');
    document.getElementById('three-canvas-container')?.classList.add('hidden');
    document.getElementById('catalog-grid-2d')?.classList.remove('hidden');
    document.getElementById('catalog-grid-3d')?.classList.add('hidden');
    document.getElementById('catalog-title')!.textContent = 'Smart Catalog';
    document.getElementById('inspector-2d-section')?.classList.remove('hidden');
    document.getElementById('inspector-3d-section')?.classList.add('hidden');
    // Box 2 mode bar: hide 3D controls, show hint
    document.getElementById('toolbar-actions-3d')?.classList.add('hidden');
    const hint3d = document.getElementById('hint-3d-controls');
    if (hint3d) hint3d.style.display = '';
  });

  document.getElementById('btn-engine-3d')?.addEventListener('click', () => {
    currentEngineMode = '3d';
    document.getElementById('btn-engine-3d')?.classList.add('active');
    document.getElementById('btn-engine-2d')?.classList.remove('active');
    document.getElementById('three-canvas-container')?.classList.remove('hidden');
    document.getElementById('container-canvas-2d')?.classList.add('hidden');
    document.getElementById('catalog-grid-3d')?.classList.remove('hidden');
    document.getElementById('catalog-grid-2d')?.classList.add('hidden');
    document.getElementById('catalog-title')!.textContent = '3D Solids Library';
    document.getElementById('inspector-3d-section')?.classList.remove('hidden');
    document.getElementById('inspector-2d-section')?.classList.add('hidden');
    // Box 2 mode bar: show 3D controls, hide hint
    document.getElementById('toolbar-actions-3d')?.classList.remove('hidden');
    const hint3d = document.getElementById('hint-3d-controls');
    if (hint3d) hint3d.style.display = 'none';

    // Resize Three canvas to div bounds
    if (threeRenderer && threeCamera) {
      threeRenderer.setSize(container.clientWidth, container.clientHeight || 480);
      threeCamera.aspect = container.clientWidth / (container.clientHeight || 480);
      threeCamera.updateProjectionMatrix();
    }
  });

  // 3D Solids adding event listeners
  document.getElementById('btn-add-3d-cube')?.addEventListener('click', () => add3DShape('cube'));
  document.getElementById('btn-add-3d-cylinder')?.addEventListener('click', () => add3DShape('cylinder'));
  document.getElementById('btn-add-3d-gear')?.addEventListener('click', () => add3DShape('gear'));
  document.getElementById('btn-add-3d-shaft')?.addEventListener('click', () => add3DShape('shaft'));

  // 3D Zoom View controls
  document.getElementById('btn-3d-zoom-in')?.addEventListener('click', () => {
    if (threeCamera) {
      threeCamera.position.multiplyScalar(0.9);
    }
  });
  document.getElementById('btn-3d-zoom-out')?.addEventListener('click', () => {
    if (threeCamera) {
      threeCamera.position.multiplyScalar(1.1);
    }
  });
  document.getElementById('btn-3d-reset-view')?.addEventListener('click', () => {
    if (threeCamera && threeControls) {
      threeCamera.position.set(100, 100, 150);
      threeControls.target.set(0, 0, 0);
    }
  });
}

function add3DShape(type: Shape3D['type'], options: Partial<Shape3D> = {}) {
  const shapeNames = {
    cube: 'Cube Solid',
    cylinder: 'Cylinder Extrusion',
    gear: 'Gear Drive Pinion',
    shaft: 'Linear Shaft'
  };

  const newShape: Shape3D = {
    id: generateUUID(),
    type,
    name: `${shapeNames[type]} ${placedShapes.filter(s => s.type === type).length + 1}`,
    material: (options.material as any) || 'Aluminum',
    x: options.x || (Math.random() * 40 - 20),
    y: options.y || 0,
    z: options.z || (Math.random() * 40 - 20),
    size: options.size || 50,
    radius: options.radius || 20,
    height: options.height || 80,
    teeth: options.teeth || 24,
    thickness: options.thickness || 15,
    diameter: options.diameter || 12,
    length: options.length || 100
  };

  pushHistory();
  placedShapes.push(newShape);
  selectShape(newShape.id);
  renderPlaced3DShapes();
  triggerAutoBOM();
  runSmartAnalysis();
  saveCurrentDesign();
  showToast(`Added ${newShape.name} to viewport`, 'success');
}

function selectShape(id: string) {
  selectedShapeId = id;
  const shape = placedShapes.find(s => s.id === id);
  if (!shape) return;

  document.getElementById('no-shape-selected')?.classList.add('hidden');
  const editor = document.getElementById('shape-editor');
  editor?.classList.remove('hidden');

  document.getElementById('editor-shape-type')!.textContent = shape.type.toUpperCase();
  (document.getElementById('prop-shape-name') as HTMLInputElement).value = shape.name;
  (document.getElementById('prop-shape-material') as HTMLSelectElement).value = shape.material;

  // Show respective sliders
  document.getElementById('sliders-cube')?.classList.add('hidden');
  document.getElementById('sliders-cylinder')?.classList.add('hidden');
  document.getElementById('sliders-gear')?.classList.add('hidden');
  document.getElementById('sliders-shaft')?.classList.add('hidden');

  if (shape.type === 'cube') {
    document.getElementById('sliders-cube')?.classList.remove('hidden');
    (document.getElementById('slide-cube-size') as HTMLInputElement).value = (shape.size || 50).toString();
    document.getElementById('val-cube-size')!.textContent = (shape.size || 50).toString();
  } else if (shape.type === 'cylinder') {
    document.getElementById('sliders-cylinder')?.classList.remove('hidden');
    (document.getElementById('slide-cyl-radius') as HTMLInputElement).value = (shape.radius || 20).toString();
    document.getElementById('val-cyl-radius')!.textContent = (shape.radius || 20).toString();
    (document.getElementById('slide-cyl-height') as HTMLInputElement).value = (shape.height || 80).toString();
    document.getElementById('val-cyl-height')!.textContent = (shape.height || 80).toString();
  } else if (shape.type === 'gear') {
    document.getElementById('sliders-gear')?.classList.remove('hidden');
    (document.getElementById('slide-gear-teeth') as HTMLInputElement).value = (shape.teeth || 24).toString();
    document.getElementById('val-gear-teeth')!.textContent = (shape.teeth || 24).toString();
    (document.getElementById('slide-gear-thickness') as HTMLInputElement).value = (shape.thickness || 15).toString();
    document.getElementById('val-gear-thickness')!.textContent = (shape.thickness || 15).toString();
  } else if (shape.type === 'shaft') {
    document.getElementById('sliders-shaft')?.classList.remove('hidden');
    (document.getElementById('slide-shaft-diameter') as HTMLInputElement).value = (shape.diameter || 12).toString();
    document.getElementById('val-shaft-diameter')!.textContent = (shape.diameter || 12).toString();
    (document.getElementById('slide-shaft-length') as HTMLInputElement).value = (shape.length || 100).toString();
    document.getElementById('val-shaft-length')!.textContent = (shape.length || 100).toString();
  }

  // Highlight mesh color in scene
  renderPlaced3DShapes();
}

function createGearGeometry(teeth: number, thickness: number) {
  const shape = new THREE.Shape();
  const outerRadius = teeth * 1.2;
  const innerRadius = teeth * 0.95;
  const toothAngle = (Math.PI * 2) / teeth;

  for (let i = 0; i < teeth; i++) {
    const angle = i * toothAngle;
    const nextAngle = (i + 1) * toothAngle;
    const midAngle = angle + toothAngle / 2;

    const ox1 = Math.cos(angle + toothAngle * 0.1) * outerRadius;
    const oy1 = Math.sin(angle + toothAngle * 0.1) * outerRadius;
    const ox2 = Math.cos(midAngle - toothAngle * 0.1) * outerRadius;
    const oy2 = Math.sin(midAngle - toothAngle * 0.1) * outerRadius;
    const ix1 = Math.cos(midAngle + toothAngle * 0.1) * innerRadius;
    const iy1 = Math.sin(midAngle + toothAngle * 0.1) * innerRadius;
    const ix2 = Math.cos(nextAngle - toothAngle * 0.1) * innerRadius;
    const iy2 = Math.sin(nextAngle - toothAngle * 0.1) * innerRadius;

    if (i === 0) {
      shape.moveTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
    }
    shape.lineTo(ox1, oy1);
    shape.lineTo(ox2, oy2);
    shape.lineTo(ix1, iy1);
    shape.lineTo(ix2, iy2);
  }

  const extrudeSettings = {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.5,
    bevelThickness: 0.5
  };

  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

function renderPlaced3DShapes() {
  if (!threeScene) return;

  // Clear previous meshes
  threeMeshMap.forEach(mesh => {
    threeScene!.remove(mesh);
  });
  threeMeshMap.clear();

  placedShapes.forEach(s => {
    let geom: THREE.BufferGeometry;

    if (s.type === 'cube') {
      const sz = s.size || 50;
      geom = new THREE.BoxGeometry(sz, sz, sz);
    } else if (s.type === 'cylinder') {
      const r = s.radius || 20;
      geom = new THREE.CylinderGeometry(r, r, s.height || 80, 24);
    } else if (s.type === 'gear') {
      geom = createGearGeometry(s.teeth || 24, s.thickness || 15);
    } else {
      // shaft
      const r = (s.diameter || 12) / 2;
      geom = new THREE.CylinderGeometry(r, r, s.length || 100, 16);
    }

    // Material properties selection
    const color = s.id === selectedShapeId ? 0xff0000 : MATERIAL_COLORS[s.material];
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.3,
      metalness: s.material === 'Steel' || s.material === 'Aluminum' || s.material === 'Copper' ? 0.8 : 0.1
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(s.x, s.y, s.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Apply orientation rotation for shafts or gears
    if (s.type === 'gear') {
      mesh.rotation.x = Math.PI / 2; // Flat extrusions on ground
    } else if (s.type === 'shaft') {
      mesh.rotation.z = Math.PI / 2; // Linear shaft horizontal
    }
    mesh.rotation.y = s.rotationY || 0;

    threeScene!.add(mesh);
    threeMeshMap.set(s.id, mesh);
  });
}

function init3DInspectorListeners() {
  document.getElementById('prop-shape-name')?.addEventListener('input', (e) => {
    if (selectedShapeId) {
      const shape = placedShapes.find(s => s.id === selectedShapeId);
      if (shape) {
        shape.name = (e.target as HTMLInputElement).value;
      }
    }
  });

  document.getElementById('prop-shape-name')?.addEventListener('change', () => {
    saveCurrentDesign();
  });

  document.getElementById('prop-shape-material')?.addEventListener('change', (e) => {
    if (selectedShapeId) {
      const shape = placedShapes.find(s => s.id === selectedShapeId);
      if (shape) {
        shape.material = (e.target as HTMLSelectElement).value as any;
        renderPlaced3DShapes();
        triggerAutoBOM();
        runSmartAnalysis();
        saveCurrentDesign();
      }
    }
  });

  // Sliders input trackers
  document.getElementById('slide-cube-size')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    document.getElementById('val-cube-size')!.textContent = val.toString();
    if (selectedShapeId) {
      const shape = placedShapes.find(s => s.id === selectedShapeId);
      if (shape) {
        shape.size = val;
        renderPlaced3DShapes();
      }
    }
  });

  document.getElementById('slide-cube-size')?.addEventListener('change', () => {
    triggerAutoBOM();
    runSmartAnalysis();
    saveCurrentDesign();
  });

  // Cylinder sliders
  document.getElementById('slide-cyl-radius')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    document.getElementById('val-cyl-radius')!.textContent = val.toString();
    if (selectedShapeId) {
      const shape = placedShapes.find(s => s.id === selectedShapeId);
      if (shape) {
        shape.radius = val;
        renderPlaced3DShapes();
      }
    }
  });

  document.getElementById('slide-cyl-radius')?.addEventListener('change', () => {
    triggerAutoBOM();
    runSmartAnalysis();
    saveCurrentDesign();
  });

  document.getElementById('slide-cyl-height')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    document.getElementById('val-cyl-height')!.textContent = val.toString();
    if (selectedShapeId) {
      const shape = placedShapes.find(s => s.id === selectedShapeId);
      if (shape) {
        shape.height = val;
        renderPlaced3DShapes();
      }
    }
  });

  document.getElementById('slide-cyl-height')?.addEventListener('change', () => {
    triggerAutoBOM();
    runSmartAnalysis();
    saveCurrentDesign();
  });

  // Gear sliders
  document.getElementById('slide-gear-teeth')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    document.getElementById('val-gear-teeth')!.textContent = val.toString();
    if (selectedShapeId) {
      const shape = placedShapes.find(s => s.id === selectedShapeId);
      if (shape) {
        shape.teeth = val;
        renderPlaced3DShapes();
      }
    }
  });

  document.getElementById('slide-gear-teeth')?.addEventListener('change', () => {
    triggerAutoBOM();
    runSmartAnalysis();
    saveCurrentDesign();
  });

  document.getElementById('slide-gear-thickness')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    document.getElementById('val-gear-thickness')!.textContent = val.toString();
    if (selectedShapeId) {
      const shape = placedShapes.find(s => s.id === selectedShapeId);
      if (shape) {
        shape.thickness = val;
        renderPlaced3DShapes();
      }
    }
  });

  document.getElementById('slide-gear-thickness')?.addEventListener('change', () => {
    triggerAutoBOM();
    runSmartAnalysis();
    saveCurrentDesign();
  });

  // Shaft sliders
  document.getElementById('slide-shaft-diameter')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    document.getElementById('val-shaft-diameter')!.textContent = val.toString();
    if (selectedShapeId) {
      const shape = placedShapes.find(s => s.id === selectedShapeId);
      if (shape) {
        shape.diameter = val;
        renderPlaced3DShapes();
      }
    }
  });

  document.getElementById('slide-shaft-diameter')?.addEventListener('change', () => {
    triggerAutoBOM();
    runSmartAnalysis();
    saveCurrentDesign();
  });

  document.getElementById('slide-shaft-length')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    document.getElementById('val-shaft-length')!.textContent = val.toString();
    if (selectedShapeId) {
      const shape = placedShapes.find(s => s.id === selectedShapeId);
      if (shape) {
        shape.length = val;
        renderPlaced3DShapes();
      }
    }
  });

  document.getElementById('slide-shaft-length')?.addEventListener('change', () => {
    triggerAutoBOM();
    runSmartAnalysis();
    saveCurrentDesign();
  });

  document.getElementById('btn-delete-shape')?.addEventListener('click', async () => {
    if (selectedShapeId) {
      const confirmed = await showCustomConfirm('Remove this 3D component from model?');
      if (confirmed && selectedShapeId) {
        placedShapes = placedShapes.filter(s => s.id !== selectedShapeId);
        selectedShapeId = null;
        renderPlaced3DShapes();
        document.getElementById('no-shape-selected')?.classList.remove('hidden');
        document.getElementById('shape-editor')?.classList.add('hidden');
        triggerAutoBOM();
        runSmartAnalysis();
        saveCurrentDesign();
        showToast('3D Shape removed.', 'info');
      }
    }
  });
}

// --- VOICE COMMANDS LISTENER MODULE (CADNOVA.io Addition) ---

function initVoiceCommands() {
  const btnVoice = document.getElementById('btn-voice-toggle');
  const voiceFeedback = document.getElementById('voice-status-feedback');

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (btnVoice) btnVoice.style.display = 'none';
    return;
  }

  speechRecognizer = new SpeechRecognition();
  speechRecognizer.continuous = true;
  speechRecognizer.interimResults = false;
  speechRecognizer.lang = 'en-US';

  speechRecognizer.onstart = () => {
    voiceActive = true;
    btnVoice?.classList.add('listening');
    document.getElementById('voice-mic-text')!.textContent = 'Listening Commands...';
    if (voiceFeedback) voiceFeedback.textContent = 'Status: Active Listener';
  };

  speechRecognizer.onerror = () => {
    voiceFeedback!.textContent = 'Status: Error occured';
  };

  speechRecognizer.onend = () => {
    voiceActive = false;
    btnVoice?.classList.remove('listening');
    document.getElementById('voice-mic-text')!.textContent = 'Enable Voice Controls';
    if (voiceFeedback) voiceFeedback.textContent = 'Status: Idle';
  };

  speechRecognizer.onresult = (event: any) => {
    const lastResultIndex = event.results.length - 1;
    const commandText = event.results[lastResultIndex][0].transcript.trim().toLowerCase();

    if (voiceFeedback) voiceFeedback.textContent = `Heard: "${commandText}"`;
    executeVoiceCommand(commandText);
  };

  btnVoice?.addEventListener('click', () => {
    if (voiceActive) {
      speechRecognizer.stop();
    } else {
      speechRecognizer.start();
    }
  });
}

function executeVoiceCommand(cmd: string) {
  if (cmd.includes('rotate') || cmd.includes('spin')) {
    showToast('Voice Command: Rotating Model 360 deg', 'success');
    if (threeScene) {
      let frames = 0;
      function rot() {
        frames++;
        threeMeshMap.forEach(mesh => {
          mesh.rotation.y += 0.05;
        });
        if (frames < 120) requestAnimationFrame(rot);
      }
      rot();
    }
  } else if (cmd.includes('zoom in') || cmd.includes('magnify')) {
    showToast('Voice Command: Zooming In View', 'success');
    if (threeCamera) threeCamera.position.multiplyScalar(0.85);
  } else if (cmd.includes('zoom out')) {
    showToast('Voice Command: Zooming Out View', 'success');
    if (threeCamera) threeCamera.position.multiplyScalar(1.15);
  } else if (cmd.includes('create cylinder') || cmd.includes('add cylinder')) {
    add3DShape('cylinder');
  } else if (cmd.includes('create cube') || cmd.includes('add cube')) {
    add3DShape('cube');
  } else if (cmd.includes('create gear') || cmd.includes('add gear')) {
    add3DShape('gear');
  } else if (cmd.includes('save') || cmd.includes('store')) {
    saveCurrentDesign();
  } else {
    showToast(`Unrecognized voice control action: "${cmd}"`, 'info');
  }
}

// --- AI COPILOT & CHAT ASSISTANT MODULE (CADNOVA.io Addition) ---

function initAICopilot() {
  // Tabs Navigation
  document.querySelectorAll('.copilot-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.copilot-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const tabTarget = tab.getAttribute('data-tab');
      document.getElementById('pane-copilot-chat')?.classList.add('hidden');
      document.getElementById('pane-copilot-text-cad')?.classList.add('hidden');
      document.getElementById('pane-copilot-img-cad')?.classList.add('hidden');

      if (tabTarget === 'chat') {
        document.getElementById('pane-copilot-chat')?.classList.remove('hidden');
      } else if (tabTarget === 'text-cad') {
        document.getElementById('pane-copilot-text-cad')?.classList.remove('hidden');
      } else if (tabTarget === 'img-cad') {
        document.getElementById('pane-copilot-img-cad')?.classList.remove('hidden');
      }
    });
  });

  // Chat message send
  const chatInput = document.getElementById('chat-input') as HTMLInputElement;
  const chatMessages = document.getElementById('chat-messages') as HTMLDivElement;
  const btnSend = document.getElementById('btn-send-chat');

  btnSend?.addEventListener('click', () => {
    const text = chatInput.value.trim();
    if (!text) return;

    if (simulateOfflineAI) {
      showAiGatewayAlert();
      return;
    }

    appendChatMessage('user', text);
    chatInput.value = '';
    const btn = btnSend as HTMLButtonElement;
    btn.disabled = true;
    chatInput.disabled = true;

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'chat-msg ai-msg';
    loadingDiv.innerHTML = '<strong>CADNOVA.io Copilot:</strong> â³ Thinking...';
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Call backend AI route
    fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, context: { solidsCount: placedShapes.length } })
    })
    .then(res => res.json())
    .then(data => {
      chatMessages.removeChild(loadingDiv);
      appendChatMessage('ai', data.reply || 'Sorry, I encountered an error.');
    })
    .catch(err => {
      console.error('AI Copilot error:', err);
      if (chatMessages.contains(loadingDiv)) chatMessages.removeChild(loadingDiv);
      appendChatMessage('ai', 'AI service temporarily unavailable');
    })
    .finally(() => {
      btn.disabled = false;
      chatInput.disabled = false;
      chatInput.focus();
    });
  });

  function appendChatMessage(sender: 'user' | 'ai', msg: string) {
    const div = document.createElement('div');
    div.className = `chat-msg ${sender}-msg`;
    div.innerHTML = `<strong>${sender === 'ai' ? 'CADNOVA.io Copilot' : 'You'}:</strong> ${msg.replace(/\n/g, '<br/>')}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Text to CAD generation trigger
  document.getElementById('btn-generate-text-cad')?.addEventListener('click', () => {
    const prompt = (document.getElementById('prompt-to-cad-input') as HTMLTextAreaElement).value.trim();
    if (!prompt) return;

    if (simulateOfflineAI) {
      showAiGatewayAlert();
      return;
    }

    showToast('AI Prompt-to-CAD analyzing description...', 'info');
    
    const btn = document.getElementById('btn-generate-text-cad') as HTMLButtonElement;
    const oldText = btn.innerHTML;
    btn.innerHTML = 'â³ Generating...';
    btn.disabled = true;

    fetch(`${API_BASE}/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast('Error parsing CAD description.', 'error');
      } else {
        add3DShape(data.type, data);
        showToast('AI generated shape successfully!', 'success');
      }
    })
    .catch(err => {
      console.error(err);
      showToast('AI service temporarily unavailable', 'error');
    })
    .finally(() => {
      btn.innerHTML = oldText;
      btn.disabled = false;
      (document.getElementById('prompt-to-cad-input') as HTMLTextAreaElement).value = '';
    });
  });

  // Image to CAD sketch templates
  document.querySelectorAll('.preset-sketch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      const imgPreview = document.getElementById('img-preview') as HTMLImageElement;
      document.getElementById('sketch-previews-container')?.classList.remove('hidden');

      if (preset === 'bracket') {
        imgPreview.src = 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=200'; // mock URL for blueprint
        showToast('Bracket Blueprint Sketch template loaded!', 'info');
      } else {
        imgPreview.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200'; // mock URL for gear template
        showToast('Flange Blueprint Sketch template loaded!', 'info');
      }
      (document.getElementById('btn-generate-sketch-cad') as HTMLButtonElement).disabled = false;
    });
  });

  document.getElementById('btn-generate-sketch-cad')?.addEventListener('click', () => {
    if (simulateOfflineAI) {
      showAiGatewayAlert();
      return;
    }
    showToast('Extracting lines and contours from sketch template...', 'info');
    setTimeout(() => {
      add3DShape('cylinder', { radius: 30, height: 100, material: 'Steel' });
      add3DShape('cube', { size: 60, material: 'Aluminum' });
      showToast('Extruded 3D solid model created successfully from sketch contour!', 'success');
      switchView('workspace');
    }, 1200);
  });

  // FAB button triggers AI Chat Sidebar view switch
  document.getElementById('fab-ai-assistant')?.addEventListener('click', () => {
    switchView('workspace');
    // Switch copilot tab to Chat
    const chatTab = document.querySelector('.copilot-tab[data-tab="chat"]') as HTMLButtonElement;
    chatTab?.click();
  });
}

// --- SMART MODEL ANALYSIS & QUALITY score (CADNOVA.io Addition) ---

function runSmartAnalysis() {
  const findingsList = document.getElementById('analysis-findings-list');
  const scoreBadge = document.getElementById('analysis-quality-score');
  if (!findingsList) return;

  findingsList.innerHTML = '';
  let score = 100;
  const findings: string[] = [];

  // Check 3D constraints
  if (placedShapes.length === 0) {
    findings.push('ðŸŸ¢ Constraints: Empty design.');
  } else {
    findings.push(`ðŸŸ¢ Constraints: Fully constrained (${placedShapes.length * 4} degrees of freedom resolved)`);
  }

  // Thin wall analysis (e.g. cylinder or shaft radius too thin)
  placedShapes.forEach(s => {
    if (s.type === 'cylinder' && s.radius && s.radius < 10) {
      findings.push(`ðŸ”´ Wall thickness warning: "${s.name}" radius is ${s.radius}mm. High buckle risk.`);
      score -= 15;
    } else if (s.type === 'shaft' && s.diameter && s.diameter < 6) {
      findings.push(`ðŸ”´ Shaft deflection danger: "${s.name}" diameter is ${s.diameter}mm. Susceptible to shearing.`);
      score -= 20;
    }
  });

  // Sharp fillet stress warning (heuristics)
  const gears = placedShapes.filter(s => s.type === 'gear');
  gears.forEach(g => {
    findings.push(`ðŸŸ¡ Fillets check: Sharp root fillets on gear "${g.name}". Fatigue risk.`);
    score -= 8;
  });

  // Collision detection checking geometry overlap (simulated)
  if (placedShapes.length > 1) {
    let overlap = false;
    for (let i = 0; i < placedShapes.length; i++) {
      for (let j = i + 1; j < placedShapes.length; j++) {
        const dx = placedShapes[i].x - placedShapes[j].x;
        const dz = placedShapes[i].z - placedShapes[j].z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 30) overlap = true;
      }
    }
    if (overlap) {
      findings.push('ðŸ”´ Collision Alert: Overlap detected between mechanical components.');
      score -= 15;
    } else {
      findings.push('ðŸŸ¢ Interference: No mesh collisions detected.');
    }
  }

  // Output formatting
  if (scoreBadge) {
    score = Math.max(10, score);
    scoreBadge.textContent = `${score}%`;
    scoreBadge.className = `score-badge ${score > 80 ? 'good' : score > 50 ? 'warning' : 'danger'}`;
  }

  findings.forEach(f => {
    const div = document.createElement('div');
    div.className = `check-item ${f.startsWith('ðŸŸ¢') ? 'good' : f.startsWith('ðŸŸ¡') ? 'warning' : 'danger'}`;
    div.textContent = f;
    findingsList.appendChild(div);
  });
}

// --- TEAM COLLABORATION MODULE (CADNOVA.io Addition) ---

function initCollaborationSim() {
  const commentInput = document.getElementById('comment-input') as HTMLInputElement;
  const btnPostComment = document.getElementById('btn-add-comment');

  // Load comments of current project
  loadComments();

  // Post comment
  btnPostComment?.addEventListener('click', async () => {
    const content = commentInput.value.trim();
    if (!content) return;

    try {
      const username = currentUser ? currentUser.username : 'engineer_guest';
      const res = await fetch(`${API_BASE}/designs/${currentDesignId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, content })
      });
      if (res.ok) {
        commentInput.value = '';
        loadComments();
        showToast('Comment posted onto project workspace', 'success');
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Simulated active collaborator typing
  if (collabInterval) clearInterval(collabInterval);
  collabInterval = window.setInterval(() => {
    if (currentView === 'workspace' && Math.random() < 0.25) {
      const typingSpan = document.createElement('span');
      typingSpan.className = 'collab-typing-tag';
      typingSpan.style.position = 'absolute';
      typingSpan.style.bottom = '40px';
      typingSpan.style.right = '40px';
      typingSpan.style.fontSize = '11px';
      typingSpan.style.color = '#10b981';
      typingSpan.textContent = 'Alex is typing...';
      document.body.appendChild(typingSpan);

      setTimeout(() => typingSpan.remove(), 2000);
    }
  }, 10000);

  // Sharing options dialog
  document.getElementById('btn-share-project')?.addEventListener('click', () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    showToast('ðŸ“‹ Workspace collaboration link copied to clipboard!', 'success');
  });

  // Commit version
  document.getElementById('btn-commit-version')?.addEventListener('click', async () => {
    const verName = prompt('Enter version comment description:', 'Draft update ' + new Date().toLocaleTimeString());
    if (!verName) return;

    try {
      const payloadGeometry = { devices: placedDevices, shapes: placedShapes };
      const res = await fetch(`${API_BASE}/designs/${currentDesignId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: verName, geometry: payloadGeometry })
      });
      if (res.ok) {
        showToast('Snapshot version saved in SQLite history', 'success');
        loadVersions();
      }
    } catch (err) {
      console.error(err);
    }
  });
}

async function loadComments() {
  const container = document.getElementById('project-comments-list');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/designs/${currentDesignId}/comments`);
    if (res.ok) {
      const list = await res.json();
      container.innerHTML = '';
      if (list.length === 0) {
        container.innerHTML = '<div class="no-events">No comments posted yet.</div>';
        return;
      }
      list.forEach((c: any) => {
        const div = document.createElement('div');
        div.className = 'comment-item';
        div.innerHTML = `<strong>${c.username}:</strong> "${c.content}"`;
        container.appendChild(div);
      });
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadVersions() {
  const container = document.getElementById('project-versions-list');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/designs/${currentDesignId}/versions`);
    if (res.ok) {
      const list = await res.json();
      container.innerHTML = '';
      if (list.length === 0) {
        container.innerHTML = '<div class="no-events">No versions saved.</div>';
        return;
      }
      list.forEach((v: any) => {
        const div = document.createElement('div');
        div.className = 'version-item-row';
        div.innerHTML = `
          <span>${v.name} (${new Date(v.created_at).toLocaleTimeString()})</span>
          <button class="version-restore-btn" data-ver-id="${v.id}">Restore</button>
        `;
        div.querySelector('.version-restore-btn')?.addEventListener('click', async () => {
          if (currentUser?.role === 'student') {
            showToast('Upgrade to Engineer Tier to restore archived version snapshots!', 'error');
            return;
          }
          const verId = v.id;
          const confirmRestore = await showCustomConfirm('Restore project design to this selected snapshot?');
          if (confirmRestore) {
            try {
              const postRes = await fetch(`${API_BASE}/designs/${currentDesignId}/versions/${verId}/restore`, {
                method: 'POST'
              });
              if (postRes.ok) {
                const body = await postRes.json();
                placedDevices = body.geometry.devices || [];
                placedShapes = body.geometry.shapes || [];
                placedWalls = body.geometry.walls || [];
                placedRooms = body.geometry.rooms || [];
                renderPlacedDevices();
                renderPlaced3DShapes();
                renderWalls();
                renderRooms();
                triggerAutoBOM();
                runSmartAnalysis();
                showToast('Version snapshot restored successfully!', 'success');
              }
            } catch (err) {
              showToast('Error restoring', 'error');
            }
          }
        });
        container.appendChild(div);
      });
    }
  } catch (err) {
    console.error(err);
  }
}

// --- LEARNING HUB MODULE (CADNOVA.io Addition) ---

function initLearningHub() {
  // Beginner Mode Tooltips helper
  document.getElementById('toggle-beginner-mode')?.addEventListener('change', (e) => {
    const beginner = (e.target as HTMLInputElement).checked;
    if (beginner) {
      showToast('Beginner Mode active: Tooltips and guidance highlighted', 'info');
      // Append sample guidance message on dashboard
      const div = document.createElement('div');
      div.className = 'beginner-overlay-guide';
      div.style.position = 'fixed';
      div.style.top = '80px';
      div.style.left = '50%';
      div.style.transform = 'translateX(-50%)';
      div.style.background = '#e95d3c';
      div.style.color = '#fff';
      div.style.padding = '8px 16px';
      div.style.borderRadius = '8px';
      div.style.fontSize = '12px';
      div.style.fontWeight = '600';
      div.style.zIndex = '999';
      div.id = 'beginner-mode-toast';
      div.textContent = 'ðŸ’¡ TIP: Press TAB to switch between 2D layouts and 3D solids instantly.';
      document.body.appendChild(div);
    } else {
      document.getElementById('beginner-mode-toast')?.remove();
    }
  });

  // Start Tutorial accordion
  document.querySelectorAll('.btn-start-tutorial').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-tutorial');
      switchView('workspace');
      if (type === 'gear') {
        // Toggle 3D solid mode
        const toggle3d = document.getElementById('btn-engine-3d') as HTMLButtonElement;
        toggle3d?.click();
        (document.getElementById('prompt-to-cad-input') as HTMLTextAreaElement).value = 'Create a gear with 24 teeth';
        showToast('Tutorial: 3D solid mode active. Text command preset filled!', 'success');
      } else {
        // Toggle 2D floor mode
        const toggle2d = document.getElementById('btn-engine-2d') as HTMLButtonElement;
        toggle2d?.click();
        showToast('Tutorial: 2D Blueprint active. Place smart devices on catalog left.', 'success');
      }
    });
  });

  // Grader Quiz Certification
  document.getElementById('btn-submit-quiz')?.addEventListener('click', () => {
    const q1 = document.querySelector('input[name="q1"]:checked') as HTMLInputElement;
    const q2 = document.querySelector('input[name="q2"]:checked') as HTMLInputElement;

    if (!q1 || !q2) {
      showToast('Please select answers for all questions first', 'error');
      return;
    }

    if (q1.value === 'Aluminum' && q2.value === 'stress') {
      showToast('ðŸ† 100% Correct Score! Certificate generated.', 'success');
      drawCertificationCanvas();
      document.getElementById('certificate-drawer')?.classList.remove('hidden');
      document.getElementById('certification-quiz-box')?.classList.add('hidden');
    } else {
      showToast('âŒ Score 0%. Review engineering concepts and try again!', 'error');
    }
  });
}

function drawCertificationCanvas() {
  const canvas = document.getElementById('canvas-certificate') as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#1a1d2e';
  ctx.fillRect(0, 0, 400, 280);

  // Border frame
  ctx.strokeStyle = '#5c2a8f';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 380, 260);

  // Text
  ctx.fillStyle = '#fff';
  ctx.font = '20px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CADNOVA.io ACADEMY CERTIFICATION', 200, 60);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText('This certifies that', 200, 100);

  ctx.fillStyle = '#e95d3c';
  ctx.font = '22px Outfit, sans-serif';
  const name = currentUser ? currentUser.username : 'Guest User';
  ctx.fillText(name.toUpperCase(), 200, 140);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText('has successfully completed the examinations for', 200, 180);
  ctx.fillText('CADNOVA.io Associate Architecture & Engineering Program', 200, 200);

  ctx.fillStyle = '#5c2a8f';
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText('Authorized by: CADNOVA.io Cloud Core Engine v4.0', 200, 240);
}

// --- MANUFACTURING BOM EXPORT MODULE (CADNOVA.io Addition) ---

function triggerAutoBOM() {
  const tbody = document.getElementById('bom-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (placedShapes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No mechanical components found. Add 3D shapes to generate BOM!</td></tr>';
    document.getElementById('mfg-readiness-score')!.textContent = '0';
    return;
  }

  let totalWeight = 0;
  let totalCarbon = 0;
  let totalCost = 0;

  placedShapes.forEach(s => {
    // Volume calculations (cm3)
    let volume = 0;
    if (s.type === 'cube') {
      const sz = s.size || 50;
      volume = (sz * sz * sz) / 1000;
    } else if (s.type === 'cylinder') {
      const r = s.radius || 20;
      volume = (Math.PI * r * r * (s.height || 80)) / 1000;
    } else if (s.type === 'gear') {
      volume = (Math.PI * (s.teeth || 24) * 2 * (s.thickness || 15)) / 1000;
    } else {
      // shaft
      const r = (s.diameter || 12) / 2;
      volume = (Math.PI * r * r * (s.length || 100)) / 1000;
    }

    // Material weight and footprint metrics
    let density = s.material === 'Steel' ? 7.85 : s.material === 'Aluminum' ? 2.7 : s.material === 'PLA' ? 1.25 : s.material === 'ABS' ? 1.05 : 8.96; // g/cm3
    let carbonFactor = s.material === 'Steel' ? 1.8 : s.material === 'Aluminum' ? 12.0 : s.material === 'PLA' ? 0.5 : s.material === 'ABS' ? 3.0 : 4.5; // kg CO2/kg
    let costPerGram = s.material === 'Steel' ? 0.05 : s.material === 'Aluminum' ? 0.08 : s.material === 'PLA' ? 0.02 : s.material === 'ABS' ? 0.03 : 0.15;

    const weight = volume * density;
    const carbon = (weight / 1000) * carbonFactor;
    const cost = weight * costPerGram;

    totalWeight += weight;
    totalCarbon += carbon;
    totalCost += cost;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${s.name}</strong></td>
      <td>1</td>
      <td>${s.material}</td>
      <td>${weight.toFixed(1)} g</td>
      <td>${carbon.toFixed(2)} kg</td>
      <td>$${cost.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Append totals row
  const trTotal = document.createElement('tr');
  trTotal.style.fontWeight = 'bold';
  trTotal.style.borderTop = '2px solid var(--accent)';
  trTotal.innerHTML = `
    <td>Total BOM</td>
    <td>${placedShapes.length}</td>
    <td>Hybrid</td>
    <td>${totalWeight.toFixed(1)} g</td>
    <td>${totalCarbon.toFixed(2)} kg</td>
    <td>$${totalCost.toFixed(2)}</td>
  `;
  tbody.appendChild(trTotal);

  // Set Readiness score
  let score = 95;
  if (totalWeight > 2000) score -= 10; // too heavy
  if (placedShapes.some(s => s.material === 'Steel')) score += 5; // highly structural
  score = Math.min(100, Math.max(10, score));
  document.getElementById('mfg-readiness-score')!.textContent = score.toString();
}

// --- COMMUNITY PUBLIC GALLERY (CADNOVA.io Addition) ---

async function loadCommunityGallery() {
  const container = document.getElementById('community-gallery-grid');
  if (!container) return;

  container.innerHTML = '<div class="loading-placeholder">Loading gallery models...</div>';

  try {
    const res = await fetch(`${API_BASE}/designs`);
    if (!res.ok) throw new Error('Failed');
    const designs: DesignMetadata[] = await res.json();

    container.innerHTML = '';
    designs.forEach(d => {
      const card = document.createElement('div');
      card.className = 'gallery-card glass-card';

      const emoji = d.description?.includes('BOM') || d.description?.includes('Gear') ? 'âš™ï¸' : 'ðŸ ';

      card.innerHTML = `
        <div class="gallery-image-placeholder">${emoji}</div>
        <div class="gallery-title">${d.name}</div>
        <div class="gallery-desc">${d.description || 'No description provided.'}</div>
        <div class="gallery-meta">
          <span class="gallery-user">ðŸ‘¤ user_${d.id.substring(7, 11)}</span>
          <div class="gallery-actions-row">
            <button class="gallery-action-btn like-btn" data-proj-id="${d.id}">â¤ï¸ <span>0</span></button>
            <button class="gallery-action-btn dl-btn" data-proj-id="${d.id}">ðŸ“¥ Download</button>
          </div>
        </div>
      `;

      // Download model directly
      card.querySelector('.dl-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const json = JSON.stringify(d.geometry || {});
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${d.name.replace(/\s+/g, '_')}_CADNOVA_model.json`;
        a.click();
        showToast('CAD model downloaded successfully', 'success');
      });

      // Like design handler (SQLite Likes API)
      const likeBtn = card.querySelector('.like-btn') as HTMLButtonElement;

      // Load current likes count
      fetch(`${API_BASE}/designs/${d.id}/likes`)
        .then(r => r.json())
        .then(likesInfo => {
          likeBtn.querySelector('span')!.textContent = likesInfo.count.toString();
          if (likesInfo.hasLiked) {
            likeBtn.style.color = 'var(--red-accent)';
          }
        });

      likeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const username = currentUser ? currentUser.username : 'engineer_guest';

        try {
          const postRes = await fetch(`${API_BASE}/designs/${d.id}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
          });
          if (postRes.ok) {
            const body = await postRes.json();
            likeBtn.querySelector('span')!.textContent = body.count.toString();
            if (body.liked) {
              likeBtn.style.color = 'var(--red-accent)';
              showToast('You liked this design!', 'success');
            } else {
              likeBtn.style.color = 'var(--text-secondary)';
              showToast('Like removed', 'info');
            }
          }
        } catch (err) {
          console.error(err);
        }
      });

      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = '<div class="empty-placeholder text-danger">Error loading public designs gallery.</div>';
  }
}

// --- ADMIN USERS ROLES LOADER (CADNOVA.io Addition) ---

async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="3" class="text-center">Loading registered users...</td></tr>';

  try {
    const res = await fetch(`${API_BASE}/admin/users`);
    if (!res.ok) throw new Error('API fetch error');
    const users = await res.json();

    tbody.innerHTML = '';
    users.forEach((u: any) => {
      const tr = document.createElement('tr');

      const selectHtml = `
        <select class="select-input select-input-sm admin-role-change" data-username="${u.username}">
          <option value="student" ${u.role === 'student' ? 'selected' : ''}>Student</option>
          <option value="engineer" ${u.role === 'engineer' ? 'selected' : ''}>Engineer</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      `;

      tr.innerHTML = `
        <td><strong>${u.username}</strong></td>
        <td><span class="role-badge ${u.role}">${u.role.toUpperCase()}</span></td>
        <td>${selectHtml}</td>
      `;

      // Role modification event binding
      tr.querySelector('.admin-role-change')?.addEventListener('change', async (e) => {
        const newRole = (e.target as HTMLSelectElement).value;
        const targetUsername = u.username;

        try {
          const postRes = await fetch(`${API_BASE}/admin/users/${targetUsername}/role`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
          });
          if (postRes.ok) {
            showToast(`Role of user "${targetUsername}" changed to "${newRole}"`, 'success');
            loadAdminUsers();
            if (currentUser && currentUser.username === targetUsername) {
              currentUser.role = newRole as any;
              setupUserUI(currentUser);
            }
          }
        } catch (err) {
          showToast('Failed to update role', 'error');
        }
      });

      tbody.appendChild(tr);
    });

    // Update telemetry counter
    document.getElementById('telemetry-users-count')!.textContent = users.length.toString();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Error querying users.</td></tr>';
  }
}

// --- CAD PLATFORM MODULES (CADNOVA.io Phase 2, 3, 4, & 5 updates) ---

// 52 Category-classified Smart Catalog items database
const SMART_CATALOG_DB: {
  type: Device['type'];
  name: string;
  category: string;
  powerUsage: number;
  price: number;
  properties: DeviceProperties;
}[] = [
    // 1. Lighting (6 items)
    { type: 'light', name: 'Smart LED Bulb A19', category: 'lighting', powerUsage: 9, price: 15, properties: { brightness: 80, color: '#ffbe3b' } },
    { type: 'light', name: 'RGB Light Strip 2M', category: 'lighting', powerUsage: 24, price: 35, properties: { brightness: 100, color: '#ff00ff' } },
    { type: 'light', name: 'Smart Recessed Spotlight', category: 'lighting', powerUsage: 12, price: 22, properties: { brightness: 70, color: '#ffffff' } },
    { type: 'light', name: 'Ambient Bedside Lamp', category: 'lighting', powerUsage: 6, price: 29, properties: { brightness: 40, color: '#ff8a00' } },
    { type: 'light', name: 'Outdoor LED Floodlight', category: 'lighting', powerUsage: 50, price: 49, properties: { brightness: 100, color: '#ffffff' } },
    { type: 'light', name: 'Smart Dimmer Wall Switch', category: 'light', powerUsage: 1, price: 18, properties: { brightness: 50, color: '#ffffff' } },

    // 2. Sensors (7 items)
    { type: 'sensor', name: 'Multi-Sensor 6-in-1', category: 'sensors', powerUsage: 1, price: 59, properties: { temperature: 22.0, humidity: 55 } },
    { type: 'sensor', name: 'High-Precision Temp Sensor', category: 'sensors', powerUsage: 0.5, price: 25, properties: { temperature: 21.5, humidity: 48 } },
    { type: 'sensor', name: 'Soil Moisture Sensor', category: 'sensors', powerUsage: 0.2, price: 15, properties: { humidity: 30 } },
    { type: 'sensor', name: 'Flood & Water Leak Detector', category: 'sensors', powerUsage: 0.5, price: 34, properties: { humidity: 95 } },
    { type: 'sensor', name: 'Ambient Light Lux Sensor', category: 'sensors', powerUsage: 0.3, price: 19, properties: { brightness: 60 } },
    { type: 'sensor', name: 'Vibration Structural Sensor', category: 'sensors', powerUsage: 0.5, price: 45, properties: {} },
    { type: 'sensor', name: 'Air Quality VOC Sensor', category: 'sensors', powerUsage: 1.5, price: 65, properties: { temperature: 23.0 } },

    // 3. Security (7 items)
    { type: 'camera', name: 'HD IP Dome Camera 1080p', category: 'security', powerUsage: 8, price: 89, properties: {} },
    { type: 'lock', name: 'Smart Deadbolt Keyless Lock', category: 'security', powerUsage: 2, price: 149, properties: { isLocked: true, pinCode: '1234' } },
    { type: 'camera', name: 'Smart Video Doorbell Pro', category: 'security', powerUsage: 10, price: 199, properties: {} },
    { type: 'motion', name: 'Perimeter Security Siren', category: 'security', powerUsage: 5, price: 69, properties: { motionDetected: false } },
    { type: 'sensor', name: 'Acoustic Glass Break Detector', category: 'security', powerUsage: 0.5, price: 39, properties: {} },
    { type: 'lock', name: 'Biometric Fingerprint Handle', category: 'security', powerUsage: 3, price: 179, properties: { isLocked: true, pinCode: '1234' } },
    { type: 'sensor', name: 'Window Contact Reed Switch', category: 'security', powerUsage: 0.1, price: 12, properties: {} },

    // 4. Appliances (7 items)
    { type: 'plug', name: 'Smart Plug Slim Wifi', category: 'appliances', powerUsage: 1, price: 19, properties: {} },
    { type: 'plug', name: 'Robotic Vacuum Cleaner D10', category: 'appliances', powerUsage: 35, price: 299, properties: {} },
    { type: 'plug', name: 'Smart Fridge Hub Screen', category: 'appliances', powerUsage: 120, price: 1899, properties: {} },
    { type: 'plug', name: 'Smart Coffee Brewer Pro', category: 'appliances', powerUsage: 850, price: 129, properties: {} },
    { type: 'plug', name: 'Induction Cooktop Controller', category: 'appliances', powerUsage: 1200, price: 249, properties: {} },
    { type: 'plug', name: 'Smart Clothes Washer Hub', category: 'appliances', powerUsage: 450, price: 799, properties: {} },
    { type: 'plug', name: 'Dishwasher Cycle Alert Adapter', category: 'appliances', powerUsage: 15, price: 49, properties: {} },

    // 5. Networking (5 items)
    { type: 'plug', name: 'Tri-Band Wi-Fi 6 Router', category: 'networking', powerUsage: 18, price: 189, properties: {} },
    { type: 'plug', name: 'Network Mesh Range Extender', category: 'networking', powerUsage: 8, price: 79, properties: {} },
    { type: 'plug', name: 'Smart Home Zigbee Gateway', category: 'networking', powerUsage: 4, price: 49, properties: {} },
    { type: 'speaker', name: 'Voice Assistant Smart Speaker', category: 'networking', powerUsage: 10, price: 99, properties: { volume: 55, track: 'Smart House Lo-Fi beats' } },
    { type: 'plug', name: 'Gigabit PoE Switch 8-Port', category: 'networking', powerUsage: 12, price: 89, properties: {} },

    // 6. Energy (6 items)
    { type: 'plug', name: 'Smart Electric Panel Meter', category: 'energy', powerUsage: 5, price: 229, properties: {} },
    { type: 'plug', name: 'Solar Grid Tie Inverter', category: 'energy', powerUsage: 15, price: 549, properties: {} },
    { type: 'plug', name: 'Smart Battery Storage Pack', category: 'energy', powerUsage: 10, price: 899, properties: {} },
    { type: 'plug', name: 'EV Fast Charger Station', category: 'energy', powerUsage: 7200, price: 499, properties: {} },
    { type: 'plug', name: 'Heavy Duty Relay Controller', category: 'energy', powerUsage: 2, price: 79, properties: {} },
    { type: 'plug', name: 'Smart Power Strip 6-Outlet', category: 'energy', powerUsage: 3, price: 39, properties: {} },

    // 7. Entertainment (5 items)
    { type: 'speaker', name: 'Smart Bookshelf Speaker Pair', category: 'entertainment', powerUsage: 60, price: 249, properties: { volume: 60, track: 'Ambient Chillout Mix' } },
    { type: 'speaker', name: 'UHD TV Screen Display 55"', category: 'entertainment', powerUsage: 110, price: 449, properties: { volume: 30, track: 'Morning Jazz Acoustic' } },
    { type: 'speaker', name: 'Smart Soundbar Dolby Atmos', category: 'entertainment', powerUsage: 45, price: 199, properties: { volume: 50 } },
    { type: 'speaker', name: 'Home Theater 4K Projector', category: 'entertainment', powerUsage: 280, price: 899, properties: {} },
    { type: 'speaker', name: 'Multi-Room Audio Receiver', category: 'entertainment', powerUsage: 85, price: 349, properties: {} },

    // 8. HVAC & Comfort (6 items)
    { type: 'thermostat', name: 'Smart Learning Thermostat 3G', category: 'comfort', powerUsage: 4, price: 249, properties: { temperature: 21.0 } },
    { type: 'thermostat', name: 'Ceiling Fan Speed Switch', category: 'comfort', powerUsage: 35, price: 45, properties: {} },
    { type: 'thermostat', name: 'Smart Ultrasonic Humidifier', category: 'comfort', powerUsage: 25, price: 79, properties: { temperature: 20.0, humidity: 45 } },
    { type: 'thermostat', name: 'True HEPA Air Purifier IoT', category: 'comfort', powerUsage: 40, price: 159, properties: { temperature: 22.0 } },
    { type: 'thermostat', name: 'AC Split Zone Controller', category: 'comfort', powerUsage: 5, price: 99, properties: { temperature: 18.0 } },
    { type: 'thermostat', name: 'Radiator Thermostatic Valve', category: 'comfort', powerUsage: 1, price: 59, properties: { temperature: 22.5 } },

    // 9. Automation (5 items)
    { type: 'motion', name: 'Wall Scene Button Keypad', category: 'automation', powerUsage: 0.5, price: 49, properties: {} },
    { type: 'plug', name: 'Motorized Roller Blinds Controller', category: 'automation', powerUsage: 15, price: 129, properties: {} },
    { type: 'lock', name: 'Smart Water Main Shutoff Valve', category: 'automation', powerUsage: 4, price: 189, properties: { isLocked: false } },
    { type: 'motion', name: 'Presence Detection Radar 24G', category: 'automation', powerUsage: 1, price: 89, properties: { motionDetected: false } },
    { type: 'motion', name: 'Smart Scenario Button', category: 'automation', powerUsage: 0.1, price: 24, properties: {} },

    // 10. Medical (6 items)
    { type: 'sensor', name: 'Smart ECG Cardiac Monitor', category: 'medical', powerUsage: 3, price: 299, properties: { temperature: 37.0, humidity: 45 } },
    { type: 'motion', name: 'Smart Fall Detection Alert', category: 'medical', powerUsage: 1.2, price: 129, properties: { motionDetected: false } },
    { type: 'plug', name: 'Telehealth Gateway Router', category: 'medical', powerUsage: 12, price: 149, properties: {} },
    { type: 'sensor', name: 'IoT Continuous Pulse Oximeter', category: 'medical', powerUsage: 0.8, price: 99, properties: { temperature: 36.6 } },
    { type: 'lock', name: 'Smart IoT Pill Dispenser Box', category: 'medical', powerUsage: 4, price: 199, properties: { isLocked: true, pinCode: '0000' } },
    { type: 'sensor', name: 'Bed Weight Load Cell Pad', category: 'medical', powerUsage: 2.5, price: 349, properties: {} },

    // 11. Industrial (6 items)
    { type: 'plug', name: 'Industrial PLC Controller Mod', category: 'industrial', powerUsage: 45, price: 899, properties: {} },
    { type: 'plug', name: 'MODBUS RS485 Gateway Terminal', category: 'industrial', powerUsage: 15, price: 249, properties: {} },
    { type: 'sensor', name: 'Structural Vibration Probe', category: 'industrial', powerUsage: 1.8, price: 179, properties: {} },
    { type: 'sensor', name: 'Toxic Gas Electrochemical Sensor', category: 'industrial', powerUsage: 2, price: 329, properties: { humidity: 12 } },
    { type: 'motion', name: 'Optical Safety Light Curtain', category: 'industrial', powerUsage: 18, price: 499, properties: { motionDetected: false } },
    { type: 'lock', name: 'High-Voltage Smart Shunt Switch', category: 'industrial', powerUsage: 8, price: 399, properties: { isLocked: true } },

    // 12. Agriculture (6 items)
    { type: 'sensor', name: 'NPK Soil Nutrient Analyzer', category: 'agriculture', powerUsage: 1.5, price: 159, properties: { humidity: 35 } },
    { type: 'lock', name: 'Automated Solar Water Valve', category: 'agriculture', powerUsage: 12, price: 279, properties: { isLocked: false } },
    { type: 'sensor', name: 'IoT Microclimate Weather Station', category: 'agriculture', powerUsage: 5, price: 449, properties: { temperature: 24.5, humidity: 60 } },
    { type: 'sensor', name: 'Leaf Wetness Resistance Node', category: 'agriculture', powerUsage: 0.5, price: 89, properties: { humidity: 80 } },
    { type: 'sensor', name: 'Silo Grain Temperature Probe', category: 'agriculture', powerUsage: 2.2, price: 199, properties: { temperature: 18.0 } },
    { type: 'plug', name: 'Livestock RFID Gateway Reader', category: 'agriculture', powerUsage: 24, price: 349, properties: {} },

    // 13. Environmental (5 items)
    { type: 'sensor', name: 'UV Index Solar Radiation Meter', category: 'environmental', powerUsage: 0.8, price: 119, properties: {} },
    { type: 'sensor', name: 'Acoustic Sound Decibel Meter', category: 'environmental', powerUsage: 1.5, price: 139, properties: {} },
    { type: 'sensor', name: 'PM2.5 Ambient Particulate Station', category: 'environmental', powerUsage: 3.5, price: 289, properties: { temperature: 20.0 } },
    { type: 'sensor', name: 'Radon Gas Alpha Particle Sensor', category: 'environmental', powerUsage: 4, price: 379, properties: {} },
    { type: 'sensor', name: 'Water Turbidity Spectrograph Meter', category: 'environmental', powerUsage: 2.8, price: 229, properties: {} },

    // 14. Utilities (5 items)
    { type: 'sensor', name: 'Acoustic Leak Smart Water Meter', category: 'utilities', powerUsage: 1, price: 189, properties: { humidity: 100 } },
    { type: 'lock', name: 'Solenoid Main Gas IoT Safety Shutoff', category: 'utilities', powerUsage: 6, price: 219, properties: { isLocked: false } },
    { type: 'sensor', name: 'Electricity Power Factor Recorder', category: 'utilities', powerUsage: 3.2, price: 269, properties: {} },
    { type: 'sensor', name: 'Hydraulic Line Pressure Transducer', category: 'utilities', powerUsage: 1.2, price: 149, properties: {} },
    { type: 'lock', name: 'Substation Transformer Load Logger', category: 'utilities', powerUsage: 15, price: 799, properties: { isLocked: true } }
  ];

function toggleFavorite(name: string) {
  if (favoriteDeviceNames.has(name)) {
    favoriteDeviceNames.delete(name);
  } else {
    favoriteDeviceNames.add(name);
  }
  localStorage.setItem('cadnova_favorites', JSON.stringify(Array.from(favoriteDeviceNames)));
  renderCatalog2D();
}

function renderCatalog2D() {
  const container = document.getElementById('catalog-grid-2d');
  if (!container) return;

  const searchInput = document.getElementById('catalog-search') as HTMLInputElement;
  const filterSelect = document.getElementById('catalog-category-filter') as HTMLSelectElement;

  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const category = filterSelect ? filterSelect.value : 'all';

  container.innerHTML = '';

  const filtered = SMART_CATALOG_DB.filter(item => {
    if (category === 'favorites') {
      if (!favoriteDeviceNames.has(item.name)) return false;
    } else if (category !== 'all' && item.category !== category) {
      return false;
    }
    if (query && !item.name.toLowerCase().includes(query)) return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-placeholder" style="grid-column: 1/-1; padding: 20px 0; text-align: center;">No items found</div>`;
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'catalog-item';
    card.setAttribute('draggable', 'true');
    card.setAttribute('data-device-type', item.type);
    card.style.position = 'relative';

    const isFav = favoriteDeviceNames.has(item.name);
    const favStar = document.createElement('span');
    favStar.className = `catalog-fav-star ${isFav ? 'active' : ''}`;
    favStar.innerHTML = 'â˜…';
    favStar.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(item.name);
    });

    const iconG = document.createElement('div');
    iconG.className = `item-icon ${item.type}-icon`;
    iconG.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_SVG[item.type]}</svg>`;

    const label = document.createElement('span');
    label.textContent = item.name;

    card.appendChild(favStar);
    card.appendChild(iconG);
    card.appendChild(label);

    card.addEventListener('click', () => {
      addDeviceFromCatalog(item);
    });

    card.addEventListener('dragstart', (e) => {
      if (e.dataTransfer) {
        e.dataTransfer.setData('device-json', JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'copy';
      }
      card.style.opacity = '0.5';
    });

    card.addEventListener('dragend', () => {
      card.style.opacity = '1';
    });

    container.appendChild(card);
  });
}

function addDeviceFromCatalog(item: typeof SMART_CATALOG_DB[0], x?: number, y?: number) {
  pushHistory();
  const newDevice: Device = {
    id: generateUUID(),
    name: item.name,
    type: item.type,
    room: 'Living Room',
    x: x !== undefined ? x : 400 + (Math.random() * 60 - 30),
    y: y !== undefined ? y : 250 + (Math.random() * 60 - 30),
    state: true,
    properties: JSON.parse(JSON.stringify(item.properties)),
    powerUsage: item.powerUsage,
    price: item.price,
    rotation: 0
  };

  placedDevices.push(newDevice);
  selectDevice(newDevice.id);
  renderPlacedDevices();
  updateAnalytics();
  updateMiniMap();

  if (item.type === 'sensor') setupSensorSimulation(newDevice.id);
  if (item.type === 'motion') setupMotionSimulation(newDevice.id);

  saveCurrentDesign();
  logAction(`Add Device: ${newDevice.name}`);
  showToast(`Added ${newDevice.name} to layout`, 'success');
}

// History snapshots management (Phase 2 Undo/Redo)
function pushHistory() {
  const snapshot = {
    devices: JSON.parse(JSON.stringify(placedDevices)),
    shapes: JSON.parse(JSON.stringify(placedShapes)),
    walls: JSON.parse(JSON.stringify(placedWalls)),
    rooms: JSON.parse(JSON.stringify(placedRooms))
  };
  undoHistory.push(JSON.stringify(snapshot));
  redoHistory = []; // clear redo
  if (undoHistory.length > 30) {
    undoHistory.shift();
  }
}

function undo() {
  if (undoHistory.length === 0) {
    showToast('Nothing to undo', 'info');
    return;
  }
  const snapshot = {
    devices: JSON.parse(JSON.stringify(placedDevices)),
    shapes: JSON.parse(JSON.stringify(placedShapes)),
    walls: JSON.parse(JSON.stringify(placedWalls)),
    rooms: JSON.parse(JSON.stringify(placedRooms))
  };
  redoHistory.push(JSON.stringify(snapshot));

  const lastStr = undoHistory.pop();
  if (lastStr) {
    const last = JSON.parse(lastStr);
    placedDevices = last.devices || [];
    placedShapes = last.shapes || [];
    placedWalls = last.walls || [];
    placedRooms = last.rooms || [];

    selectedDeviceId = null;
    selectedShapeId = null;
    selectedWallId = null;
    selectedRoomId = null;
    selectedDeviceIds.clear();
    selectedShapeIds.clear();

    renderPlacedDevices();
    renderPlaced3DShapes();
    renderWalls();
    renderRooms();
    triggerAutoBOM();
    runSmartAnalysis();
    updateMiniMap();
    updateAnalytics();
    saveCurrentDesign();
    logAction('Undo');
    showToast('Undo performed successfully', 'info');
  }
}

function redo() {
  if (redoHistory.length === 0) {
    showToast('Nothing to redo', 'info');
    return;
  }
  const snapshot = {
    devices: JSON.parse(JSON.stringify(placedDevices)),
    shapes: JSON.parse(JSON.stringify(placedShapes)),
    walls: JSON.parse(JSON.stringify(placedWalls)),
    rooms: JSON.parse(JSON.stringify(placedRooms))
  };
  undoHistory.push(JSON.stringify(snapshot));

  const nextStr = redoHistory.pop();
  if (nextStr) {
    const next = JSON.parse(nextStr);
    placedDevices = next.devices || [];
    placedShapes = next.shapes || [];
    placedWalls = next.walls || [];
    placedRooms = next.rooms || [];

    selectedDeviceId = null;
    selectedShapeId = null;
    selectedWallId = null;
    selectedRoomId = null;
    selectedDeviceIds.clear();
    selectedShapeIds.clear();

    renderPlacedDevices();
    renderPlaced3DShapes();
    renderWalls();
    renderRooms();
    triggerAutoBOM();
    runSmartAnalysis();
    updateMiniMap();
    updateAnalytics();
    saveCurrentDesign();
    logAction('Redo');
    showToast('Redo performed successfully', 'info');
  }
}

// Clipboard Actions (Phase 2 Copy/Paste/Duplicate)
function copySelection() {
  if (currentEngineMode === '2d') {
    clipboardDevices = [];
    const targets = placedDevices.filter(d => d.id === selectedDeviceId || selectedDeviceIds.has(d.id));
    targets.forEach(d => {
      clipboardDevices.push(JSON.parse(JSON.stringify(d)));
    });
    if (clipboardDevices.length > 0) {
      logAction(`Copy ${clipboardDevices.length} device(s): ${clipboardDevices.map(d => d.name).join(', ')}`);
      showToast(`Copied ${clipboardDevices.length} smart device(s)`, 'success');
    } else {
      showToast('Select a device to copy first.', 'info');
    }
  } else {
    clipboardShapes = [];
    const targets = placedShapes.filter(s => s.id === selectedShapeId || selectedShapeIds.has(s.id));
    targets.forEach(s => {
      clipboardShapes.push(JSON.parse(JSON.stringify(s)));
    });
    if (clipboardShapes.length > 0) {
      logAction(`Copy ${clipboardShapes.length} shape(s)`);
      showToast(`Copied ${clipboardShapes.length} 3D shape(s)`, 'success');
    } else {
      showToast('Select a 3D component to copy first.', 'info');
    }
  }
}

function pasteSelection() {
  if (currentEngineMode === '2d') {
    if (clipboardDevices.length === 0) {
      showToast('Clipboard is empty. Copy device first.', 'info');
      return;
    }
    pushHistory();
    selectedDeviceIds.clear();
    clipboardDevices.forEach((d, idx) => {
      const copy: Device = JSON.parse(JSON.stringify(d));
      copy.id = generateUUID();
      copy.name = `${d.name} (Copy)`;
      copy.x += 30 * (idx + 1);
      copy.y += 30 * (idx + 1);

      // Auto collision safety adjustment boundaries
      if (copy.x > 760) copy.x = 80;
      if (copy.y > 460) copy.y = 80;

      placedDevices.push(copy);
      selectedDeviceIds.add(copy.id);
      if (idx === 0) selectedDeviceId = copy.id;
    });
    renderPlacedDevices();
    updateMiniMap();
    saveCurrentDesign();
    logAction(`Paste ${clipboardDevices.length} device(s)`);
    showToast(`Pasted ${clipboardDevices.length} device(s)`, 'success');
  } else {
    if (clipboardShapes.length === 0) {
      showToast('Clipboard is empty. Copy shape first.', 'info');
      return;
    }
    pushHistory();
    selectedShapeIds.clear();
    clipboardShapes.forEach((s, idx) => {
      const copy: Shape3D = JSON.parse(JSON.stringify(s));
      copy.id = generateUUID();
      copy.name = `${s.name} (Copy)`;
      copy.x += 15 * (idx + 1);
      copy.z += 15 * (idx + 1);

      placedShapes.push(copy);
      selectedShapeIds.add(copy.id);
      if (idx === 0) selectedShapeId = copy.id;
    });
    renderPlaced3DShapes();
    triggerAutoBOM();
    runSmartAnalysis();
    saveCurrentDesign();
    logAction(`Paste ${clipboardShapes.length} shape(s)`);
    showToast(`Pasted ${clipboardShapes.length} shape(s)`, 'success');
  }
}

function duplicateSelection() {
  const namesBefore = placedDevices.filter(d => d.id === selectedDeviceId || selectedDeviceIds.has(d.id)).map(d => d.name);
  copySelection();
  pasteSelection();
  if (namesBefore.length > 0) logAction(`Duplicate: ${namesBefore.join(', ')}`);
}

function deleteSelection() {
  if (currentEngineMode === '2d') {
    if (selectedWallId) {
      pushHistory();
      placedWalls = placedWalls.filter(w => w.id !== selectedWallId);
      selectedWallId = null;
      renderWalls();
      updateMiniMap();
      saveCurrentDesign(true);
      logAction('Delete Wall');
      showToast('Deleted selected wall segment', 'info');
      return;
    }
    if (selectedRoomId) {
      const room = placedRooms.find(r => r.id === selectedRoomId);
      const name = room ? room.name : 'Room';
      pushHistory();
      placedRooms = placedRooms.filter(r => r.id !== selectedRoomId);
      selectedRoomId = null;
      renderRooms();
      updateMiniMap();
      saveCurrentDesign(true);
      logAction(`Delete Room: ${name}`);
      showToast(`Deleted room "${name}"`, 'info');
      return;
    }

    const toRemove = new Set<string>();
    if (selectedDeviceId) toRemove.add(selectedDeviceId);
    selectedDeviceIds.forEach(id => toRemove.add(id));

    if (toRemove.size === 0) {
      showToast('Select a device, wall, or room to delete.', 'info');
      return;
    }
    const names = placedDevices.filter(d => toRemove.has(d.id)).map(d => d.name);
    pushHistory();
    placedDevices = placedDevices.filter(d => !toRemove.has(d.id));
    selectedDeviceId = null;
    selectedDeviceIds.clear();
    hidePropertiesPanel();
    renderPlacedDevices();
    updateMiniMap();
    updateAnalytics();
    saveCurrentDesign();
    logAction(`Delete: ${names.join(', ')}`);
    showToast(`Deleted ${names.length} smart device(s)`, 'info');
  } else {
    const toRemove = new Set<string>();
    if (selectedShapeId) toRemove.add(selectedShapeId);
    selectedShapeIds.forEach(id => toRemove.add(id));

    if (toRemove.size === 0) {
      showToast('Select a 3D component to delete.', 'info');
      return;
    }
    const names = placedShapes.filter(s => toRemove.has(s.id)).map(s => s.name);
    pushHistory();
    placedShapes = placedShapes.filter(s => !toRemove.has(s.id));
    selectedShapeId = null;
    selectedShapeIds.clear();
    document.getElementById('no-shape-selected')?.classList.remove('hidden');
    document.getElementById('shape-editor')?.classList.add('hidden');
    renderPlaced3DShapes();
    triggerAutoBOM();
    runSmartAnalysis();
    saveCurrentDesign();
    logAction(`Delete: ${names.join(', ')}`);
    showToast(`Deleted ${names.length} 3D component(s)`, 'info');
  }
}

// Group / Ungroup controls (Phase 2 grouping)
function groupSelection() {
  const gId = 'group-' + Math.random().toString(36).substr(2, 9);

  if (currentEngineMode === '2d') {
    const targets = placedDevices.filter(d => d.id === selectedDeviceId || selectedDeviceIds.has(d.id));
    if (targets.length < 2) {
      showToast('Please select at least 2 smart devices to group (Hold Shift)', 'info');
      return;
    }
    pushHistory();
    targets.forEach(d => d.groupId = gId);
    saveCurrentDesign();
    logAction(`Group ${targets.length} devices`);
    showToast(`Smart devices grouped (Group ID: ${gId})`, 'success');
  } else {
    const targets = placedShapes.filter(s => s.id === selectedShapeId || selectedShapeIds.has(s.id));
    if (targets.length < 2) {
      showToast('Please select at least 2 mechanical shapes to group (Hold Shift)', 'info');
      return;
    }
    pushHistory();
    targets.forEach(s => s.groupId = gId);
    saveCurrentDesign();
    logAction(`Group ${targets.length} shapes`);
    showToast(`3D components grouped (Group ID: ${gId})`, 'success');
  }
}

function ungroupSelection() {
  if (currentEngineMode === '2d') {
    const active = placedDevices.find(d => d.id === selectedDeviceId);
    if (!active || !active.groupId) {
      showToast('Selected device does not belong to a group.', 'info');
      return;
    }
    pushHistory();
    const targetGId = active.groupId;
    placedDevices.forEach(d => {
      if (d.groupId === targetGId) delete d.groupId;
    });
    saveCurrentDesign();
    logAction('Ungroup devices');
    showToast('Ungrouped smart devices', 'success');
  } else {
    const active = placedShapes.find(s => s.id === selectedShapeId);
    if (!active || !active.groupId) {
      showToast('Selected component does not belong to a group.', 'info');
      return;
    }
    pushHistory();
    const targetGId = active.groupId;
    placedShapes.forEach(s => {
      if (s.groupId === targetGId) delete s.groupId;
    });
    saveCurrentDesign();
    logAction('Ungroup shapes');
    showToast('Ungrouped 3D components', 'success');
  }
}

// Rotation commands â€” allows entering custom angle
function rotateSelection(customAngle?: number) {
  if (currentEngineMode === '2d') {
    const targets = placedDevices.filter(d => d.id === selectedDeviceId || selectedDeviceIds.has(d.id));
    if (targets.length === 0) {
      showToast('Select a device to rotate.', 'info');
      return;
    }
    let angle = customAngle !== undefined ? customAngle : 90;
    if (customAngle === undefined) {
      const input = prompt('Rotate by degrees (positive = clockwise):', '90');
      if (input === null) return; // cancelled
      const parsed = parseFloat(input);
      if (!isNaN(parsed)) angle = parsed;
    }
    pushHistory();
    targets.forEach(d => {
      d.rotation = ((d.rotation || 0) + angle) % 360;
    });
    renderPlacedDevices();
    updateMiniMap();
    saveCurrentDesign();
    logAction(`Rotate ${angle}Â°: ${targets.map(d => d.name).join(', ')}`);
    showToast(`Rotated device(s) ${angle}Â°`, 'success');
  } else {
    const targets = placedShapes.filter(s => s.id === selectedShapeId || selectedShapeIds.has(s.id));
    if (targets.length === 0) {
      showToast('Select a 3D component to rotate.', 'info');
      return;
    }
    const angle = customAngle !== undefined ? customAngle : 90;
    pushHistory();
    targets.forEach(s => {
      s.rotationY = ((s.rotationY || 0) + (angle * Math.PI / 180)) % (Math.PI * 2);
    });
    renderPlaced3DShapes();
    saveCurrentDesign();
    logAction(`Rotate 3D ${angle}Â°`);
    showToast(`Rotated 3D component(s) ${angle}Â°`, 'success');
  }
}

// Flip Horizontal â€” mirrors device icon along X axis
function flipHorizontal() {
  if (currentEngineMode !== '2d') {
    showToast('Flip Horizontal is available in 2D mode only.', 'info');
    return;
  }
  const targets = placedDevices.filter(d => d.id === selectedDeviceId || selectedDeviceIds.has(d.id));
  if (targets.length === 0) {
    showToast('Select a device to flip.', 'info');
    return;
  }
  pushHistory();
  targets.forEach(d => {
    d.flipH = !d.flipH;
  });
  renderPlacedDevices();
  updateMiniMap();
  saveCurrentDesign();
  logAction(`Flip Horizontal: ${targets.map(d => d.name).join(', ')}`);
  showToast('Flipped device(s) horizontally', 'success');
}

// Flip Vertical â€” mirrors device icon along Y axis
function flipVertical() {
  if (currentEngineMode !== '2d') {
    showToast('Flip Vertical is available in 2D mode only.', 'info');
    return;
  }
  const targets = placedDevices.filter(d => d.id === selectedDeviceId || selectedDeviceIds.has(d.id));
  if (targets.length === 0) {
    showToast('Select a device to flip.', 'info');
    return;
  }
  pushHistory();
  targets.forEach(d => {
    d.flipV = !d.flipV;
  });
  renderPlacedDevices();
  updateMiniMap();
  saveCurrentDesign();
  logAction(`Flip Vertical: ${targets.map(d => d.name).join(', ')}`);
  showToast('Flipped device(s) vertically', 'success');
}

// Zoom & Pan viewport engine for SVG (Phase 5 zoom controls)
function zoom2D(factor: number) {
  zoomScale = Math.max(0.25, Math.min(4.0, zoomScale * factor));
  applyZoomTransform();
}

function resetZoom2D() {
  zoomScale = 1.0;
  panX = 0;
  panY = 0;
  applyZoomTransform();
}

function applyZoomTransform() {
  let viewport = document.getElementById('workspace-viewport') as unknown as SVGElement;
  if (!viewport) {
    const svg = document.getElementById('cad-canvas');
    if (svg) {
      viewport = document.createElementNS('http://www.w3.org/2000/svg', 'g') as unknown as SVGElement;
      viewport.setAttribute('id', 'workspace-viewport');
      const children = Array.from(svg.children);
      children.forEach(c => {
        if (c.id !== 'grid-bg' && c.id !== 'ruler-group') {
          viewport!.appendChild(c);
        }
      });
      svg.appendChild(viewport);
    }
  }
  if (viewport) {
    viewport.setAttribute('transform', `translate(${panX}, ${panY}) scale(${zoomScale})`);
  }
}

// Mini-map update frame (Phase 5 mini map thumbnail)
function updateMiniMap() {
  const minimapSvg = document.getElementById('minimap-svg');
  if (!minimapSvg) return;

  minimapSvg.setAttribute('viewBox', '0 0 800 500');

  let html = '';

  // Render rooms
  placedRooms.forEach(room => {
    const stroke = ROOM_STROKE[room.type] || '#5c2a8f';
    html += `<rect x="${room.x}" y="${room.y}" width="${room.width}" height="${room.height}" fill="${ROOM_COLORS[room.type] || 'rgba(92,42,143,0.10)'}" stroke="${stroke}" stroke-width="1.5" rx="2" />`;
  });

  // Render walls
  placedWalls.forEach(wall => {
    html += `<line x1="${wall.x1}" y1="${wall.y1}" x2="${wall.x2}" y2="${wall.y2}" stroke="#374151" stroke-width="2" stroke-linecap="round" />`;
  });

  // Render devices
  placedDevices.forEach(d => {
    const color = ACCENT_COLORS[d.type] || '#5c2a8f';
    html += `<circle cx="${d.x}" cy="${d.y}" r="22" fill="${color}" opacity="0.75" />`;
  });

  minimapSvg.innerHTML = html;
}

// Auto Arrange rectangular grids (Phase 3 cleanup tool)
function autoArrangeLayout() {
  if (placedDevices.length === 0) {
    showToast('No smart devices to arrange.', 'info');
    return;
  }
  pushHistory();
  placedDevices.forEach((dev, idx) => {
    const col = idx % 6;
    const row = Math.floor(idx / 6);
    dev.x = 100 + col * 120;
    dev.y = 80 + row * 100;
  });
  renderPlacedDevices();
  updateMiniMap();
  saveCurrentDesign();
  showToast('Auto-arranged floor plan layout spaced grid.', 'success');
}

// Caliper Measurement logic (Phase 5 ruler measurements)
function handleCaliperClick(e: MouseEvent) {
  if (!measureMode) return;
  e.stopPropagation();

  const rect = cadCanvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 800;
  const y = ((e.clientY - rect.top) / rect.height) * 500;

  measurePoints.push({ x, y });

  if (measurePoints.length === 1) {
    showToast('First Caliper node set. Click canvas again to measure.', 'info');
    renderPlacedDevices();
  } else if (measurePoints.length === 2) {
    const p1 = measurePoints[0];
    const p2 = measurePoints[1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Scale: 1 pixel = 10mm (100 pixels = 1.0 meter)
    const meters = dist * 0.01;
    showToast(`ðŸ“ Caliper Measured: ${meters.toFixed(2)} meters (${Math.round(dist * 10)} mm)`, 'success');

    renderPlacedDevices();
    setTimeout(() => {
      measurePoints = [];
      renderPlacedDevices();
    }, 8000);

    const btnMeasure = document.getElementById('btn-measure-tool');
    btnMeasure?.classList.remove('active');
    measureMode = false;
  }
}

// Exporters & Importers logic (Phase 2 files exports)
function exportCAD(format: string) {
  if (placedDevices.length === 0 && placedShapes.length === 0) {
    showToast('Workspace is empty. Add elements before exporting.', 'info');
    return;
  }

  let content = '';
  let filename = `${designNameInput.value.replace(/\s+/g, '_')}_export`;
  let mimeType = 'text/plain';

  if (format === 'STL') {
    if (placedShapes.length === 0) {
      showToast('STL export requires 3D Solid components.', 'error');
      return;
    }
    mimeType = 'application/sla';
    filename += '.stl';
    content = "solid CADNOVA_Export\n";
    placedShapes.forEach(s => {
      const size = s.size || 50;
      const x1 = s.x - size / 2, x2 = s.x + size / 2;
      const y1 = s.y - size / 2, y2 = s.y + size / 2;
      const z1 = s.z - size / 2, z2 = s.z + size / 2;

      const facet = (nx: number, ny: number, nz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
        content += `  facet normal ${nx} ${ny} ${nz}\n    outer loop\n`;
        content += `      vertex ${ax} ${ay} ${az}\n`;
        content += `      vertex ${bx} ${by} ${bz}\n`;
        content += `      vertex ${cx} ${cy} ${cz}\n`;
        content += `    endloop\n  endfacet\n`;
      };

      // Box triangles mapping
      facet(0, 0, 1, x1, y1, z2, x2, y1, z2, x2, y2, z2);
      facet(0, 0, 1, x1, y1, z2, x2, y2, z2, x1, y2, z2);
      facet(0, 0, -1, x1, y1, z1, x1, y2, z1, x2, y2, z1);
      facet(0, 0, -1, x1, y1, z1, x2, y2, z1, x2, y1, z1);
      facet(0, 1, 0, x1, y2, z1, x1, y2, z2, x2, y2, z2);
      facet(0, 1, 0, x1, y2, z1, x2, y2, z2, x2, y2, z1);
      facet(0, -1, 0, x1, y1, z1, x2, y1, z1, x2, y1, z2);
      facet(0, -1, 0, x1, y1, z1, x2, y1, z2, x1, y1, z2);
      facet(1, 0, 0, x2, y1, z1, x2, y2, z1, x2, y2, z2);
      facet(1, 0, 0, x2, y1, z1, x2, y2, z2, x2, y1, z2);
      facet(-1, 0, 0, x1, y1, z1, x1, y1, z2, x1, y2, z2);
      facet(-1, 0, 0, x1, y1, z1, x1, y2, z2, x1, y2, z1);
    });
    content += "endsolid CADNOVA_Export\n";
  } else if (format === 'OBJ') {
    if (placedShapes.length === 0) {
      showToast('OBJ export requires 3D Solid components.', 'error');
      return;
    }
    mimeType = 'model/obj';
    filename += '.obj';
    content = "# CADNOVA Wavefront OBJ Export\n";
    let vertOffset = 1;
    placedShapes.forEach(s => {
      const size = s.size || 50;
      const x1 = s.x - size / 2, x2 = s.x + size / 2;
      const y1 = s.y - size / 2, y2 = s.y + size / 2;
      const z1 = s.z - size / 2, z2 = s.z + size / 2;

      content += `v ${x1} ${y1} ${z1}\n`;
      content += `v ${x2} ${y1} ${z1}\n`;
      content += `v ${x2} ${y2} ${z1}\n`;
      content += `v ${x1} ${y2} ${z1}\n`;
      content += `v ${x1} ${y1} ${z2}\n`;
      content += `v ${x2} ${y1} ${z2}\n`;
      content += `v ${x2} ${y2} ${z2}\n`;
      content += `v ${x1} ${y2} ${z2}\n`;

      const o = vertOffset;
      content += `f ${o} ${o + 2} ${o + 1}\nf ${o} ${o + 3} ${o + 2}\n`;
      content += `f ${o + 4} ${o + 5} ${o + 6}\nf ${o + 4} ${o + 6} ${o + 7}\n`;
      content += `f ${o + 3} ${o + 6} ${o + 2}\nf ${o + 3} ${o + 7} ${o + 6}\n`;
      content += `f ${o} ${o + 1} ${o + 5}\nf ${o} ${o + 5} ${o + 4}\n`;
      content += `f ${o + 1} ${o + 2} ${o + 6}\nf ${o + 2} ${o + 5} ${o + 6}\n`;
      content += `f ${o} ${o + 7} ${o + 3}\nf ${o} ${o + 4} ${o + 7}\n`;
      vertOffset += 8;
    });
  } else if (format === 'DXF') {
    mimeType = 'application/dxf';
    filename += '.dxf';
    content = "  0\nSECTION\n  2\nENTITIES\n";
    placedDevices.forEach(d => {
      content += `  0\nCIRCLE\n  8\nDEVICES\n 10\n${d.x}\n 20\n${d.y}\n 40\n15.0\n`;
    });
    content += "  0\nENDSEC\n  0\nEOF\n";
  } else if (format === 'SVG') {
    mimeType = 'image/svg+xml';
    filename += '.svg';
    const svgCode = document.getElementById('cad-canvas')?.outerHTML || '';
    content = svgCode;
  } else if (format === 'PDF') {
    const printWin = window.open('', '_blank');
    if (printWin) {
      let bomRows = '';
      placedShapes.forEach(s => {
        bomRows += `<tr><td>${s.name}</td><td>${s.material}</td><td>1</td></tr>`;
      });
      printWin.document.write(`
        <html>
        <head>
          <title>CADNOVA.io BOM & Engineering PDF Report</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #1e293b; }
            h1 { color: #5c2a8f; margin-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
            th { background-color: #f1f5f9; }
          </style>
        </head>
        <body>
          <h1>CADNOVA.io - Engineering Project Specification</h1>
          <p>Project Name: <strong>${designNameInput.value}</strong></p>
          <p>Created on: ${new Date().toLocaleDateString()}</p>
          <h2>Bill of Materials (BOM)</h2>
          <table>
            <thead><tr><th>Component</th><th>Material</th><th>Qty</th></tr></thead>
            <tbody>${bomRows || '<tr><td colspan="3">No mechanical components found.</td></tr>'}</tbody>
          </table>
          <script>window.print();</script>
        </body>
        </html>
      `);
      printWin.document.close();
      showToast('PDF print report compiled.', 'success');
      return;
    }
  } else if (format === 'PNG') {
    const svg = document.getElementById('cad-canvas') as unknown as SVGSVGElement;
    if (svg) {
      const xml = new XMLSerializer().serializeToString(svg as any);
      const svg64 = btoa(unescape(encodeURIComponent(xml)));
      const image64 = 'data:image/svg+xml;base64,' + svg64;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 500;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#111827';
          ctx.fillRect(0, 0, 800, 500);
          ctx.drawImage(img, 0, 0);
          const url = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = url;
          a.download = filename + '.png';
          a.click();
          showToast('PNG layout image exported.', 'success');
        }
      };
      img.src = image64;
      return;
    }
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${format} successfully.`, 'success');
}

function importCAD(jsonStr: string) {
  try {
    const data = JSON.parse(jsonStr);
    if (!data.devices && !data.shapes) {
      throw new Error('JSON missing core device or shape arrays.');
    }
    pushHistory();
    placedDevices = data.devices || [];
    placedShapes = data.shapes || [];

    selectedDeviceId = null;
    selectedShapeId = null;
    selectedDeviceIds.clear();
    selectedShapeIds.clear();

    renderPlacedDevices();
    renderPlaced3DShapes();
    triggerAutoBOM();
    runSmartAnalysis();
    updateMiniMap();
    saveCurrentDesign();
    showToast('CADNOVA.io project blueprint loaded successfully', 'success');
  } catch (err: any) {
    showToast('Import failed: ' + err.message, 'error');
  }
}

// Chart plotting helpers (FEA diagnostics)
function drawSimGraph(points: number[], labels: string[], title: string) {
  const canvas = document.getElementById('canvas-sim-graph') as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title
  ctx.fillStyle = '#c084fc';
  ctx.font = '11px Outfit, sans-serif';
  ctx.fillText(title, 20, 20);

  // Axis lines
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 30);
  ctx.lineTo(40, 150);
  ctx.lineTo(480, 150);
  ctx.stroke();

  if (points.length === 0) return;

  // Curves
  ctx.strokeStyle = '#e95d3c';
  ctx.lineWidth = 2;
  ctx.beginPath();

  const step = 420 / (points.length - 1 || 1);
  const max = Math.max(...points) || 1;

  points.forEach((p, idx) => {
    const x = 40 + idx * step;
    const y = 150 - (p / max) * 100;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    // Coordinate markers
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Label text
    ctx.fillStyle = '#94a3b8';
    ctx.font = '8px monospace';
    if (labels[idx]) {
      ctx.fillText(labels[idx], x - 10, 165);
    }
  });
  ctx.stroke();
}

function runStressSimulation() {
  // Mechanical Finite Element deflection Heuristics
  threeMeshMap.forEach((mesh, shapeId) => {
    const s = placedShapes.find(shp => shp.id === shapeId);
    if (s) {
      let color = 0x3b82f6; // Safe Blue default
      if (s.material === 'PLA' || s.material === 'ABS') {
        color = 0xef4444; // Red high stress deflectionFillets
      } else if (s.material === 'Aluminum') {
        color = 0xeab308; // Moderate stress yellow
      }
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(color);
    }
  });

  const pane = document.getElementById('sim-results-pane');
  if (pane) {
    pane.innerHTML = `
      <h4 style="color:#ef4444; margin-bottom:5px;">âš ï¸ 3D Component Stress Concentration Fillet Alert</h4>
      <p>Maximum deflection under load: <strong>0.18 mm</strong> (Threshold safe limits: 1.0mm)</p>
      <p>Material safety factor: <strong>2.85 (Steel) / 1.15 (PLA)</strong></p>
      <p>Fillet root cycle limits: <strong>Buckle wear high risk</strong> on ABS pinions.</p>
    `;
  }
  drawSimGraph([10, 35, 78, 125, 230, 310, 340, 350], ['0%', '15%', '30%', '45%', '60%', '75%', '90%', '100%'], 'FEA Elastic Yield stress vs load (MPa)');
}

function runThermalSimulation() {
  // Thermal Gradient heat sinks
  threeMeshMap.forEach((mesh, shapeId) => {
    const s = placedShapes.find(shp => shp.id === shapeId);
    if (s) {
      let color = 0xef4444; // High Temp core
      if (s.material === 'Copper') color = 0xeab308; // Heat spreader copper
      else if (s.material === 'Steel') color = 0x3b82f6; // Sink cool base
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(color);
    }
  });

  const pane = document.getElementById('sim-results-pane');
  if (pane) {
    pane.innerHTML = `
      <h4 style="color:#eab308; margin-bottom:5px;">ðŸ”¥ Transient Thermodynamic Temperature Analysis</h4>
      <p>Core heat dissipation limit: <strong>72.5 Â°C</strong> (Max limit: 85Â°C)</p>
      <p>Heat transfer flow coefficient: <strong>240 W/mÂ²K</strong></p>
      <p>Dissipation status: <strong>Optimal convection</strong> under passive sinks.</p>
    `;
  }
  drawSimGraph([110, 95, 82, 74, 68, 62, 58, 55], ['0s', '10s', '20s', '30s', '40s', '50s', '60s', '70s'], 'Heat Convection Core Cool-Down Curve (Â°C)');
}

function runRFSignalSimulation() {
  // 2D Smart RF Signals coverage
  const pane = document.getElementById('sim-results-pane');
  if (pane) {
    pane.innerHTML = `
      <h4 style="color:#10b981; margin-bottom:5px;">ðŸ“¶ Zigbee Smart Mesh RF Diagnostic Report</h4>
      <p>Placed active transmitters: <strong>${placedDevices.filter(d => d.type === 'camera').length} Cameras / ${placedDevices.filter(d => d.type === 'light').length} Lights</strong></p>
      <p>Zigbee protocol signal loss: <strong>-68 dBm (Excellent coverage)</strong></p>
      <p>Interference blockage risks: <strong>Wall partition absorption inside bedroom</strong></p>
    `;
  }
  drawSimGraph([98, 94, 88, 82, 75, 68, 52, 45], ['1m', '3m', '5m', '7m', '9m', '11m', '13m', '15m'], 'Signal-to-Noise RF Decibel Path Loss (dBm)');
}

function showAiGatewayAlert() {
  const modal = document.getElementById('ai-gateway-modal');
  modal?.classList.remove('hidden');
}

// Alignment solver for multi-selected nodes (Phase 2 alignment tools)
function alignSelection(type: 'left' | 'right' | 'top' | 'bottom') {
  const targets = placedDevices.filter(d => d.id === selectedDeviceId || selectedDeviceIds.has(d.id));
  if (targets.length < 2) {
    showToast('Select at least 2 smart devices to align together.', 'info');
    return;
  }
  pushHistory();
  if (type === 'left') {
    const minX = Math.min(...targets.map(t => t.x));
    targets.forEach(t => t.x = minX);
  } else if (type === 'right') {
    const maxX = Math.max(...targets.map(t => t.x));
    targets.forEach(t => t.x = maxX);
  } else if (type === 'top') {
    const minY = Math.min(...targets.map(t => t.y));
    targets.forEach(t => t.y = minY);
  } else if (type === 'bottom') {
    const maxY = Math.max(...targets.map(t => t.y));
    targets.forEach(t => t.y = maxY);
  }
  renderPlacedDevices();
  updateMiniMap();
  saveCurrentDesign(true);
  showToast(`Aligned selected devices to the ${type}`, 'success');
}

// Auto center active design objects onto SVG center (Phase 4 auto-center)
function autoCenterSelection() {
  if (placedDevices.length === 0) {
    showToast('No smart devices to auto-center.', 'info');
    return;
  }
  pushHistory();
  const minX = Math.min(...placedDevices.map(t => t.x));
  const maxX = Math.max(...placedDevices.map(t => t.x));
  const minY = Math.min(...placedDevices.map(t => t.y));
  const maxY = Math.max(...placedDevices.map(t => t.y));

  const bboxCenterX = (minX + maxX) / 2;
  const bboxCenterY = (minY + maxY) / 2;

  const dx = 400 - bboxCenterX;
  const dy = 250 - bboxCenterY;

  placedDevices.forEach(d => {
    d.x = Math.max(20, Math.min(780, d.x + dx));
    d.y = Math.max(20, Math.min(480, d.y + dy));
  });
  renderPlacedDevices();
  updateMiniMap();
  saveCurrentDesign(true);
  showToast('Auto-centered canvas elements to view center', 'success');
}

// Right click context menu dynamically (Phase 4 custom right click)
function initContextMenu() {
  let menu = document.getElementById('cad-context-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.setAttribute('id', 'cad-context-menu');
    menu.className = 'dropdown-menu hidden';
    menu.style.position = 'fixed';
    menu.style.zIndex = '1000';
    menu.style.backdropFilter = 'blur(12px)';
    menu.style.background = 'rgba(15, 23, 42, 0.95)';
    menu.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    menu.style.borderRadius = '8px';
    menu.style.padding = '4px 0';
    menu.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';

    menu.innerHTML = `
      <button id="cm-copy" style="background:none; border:none; color:#fff; width:100%; text-align:left; padding:8px 16px; cursor:pointer; font-size:12px;">ðŸ“‹ Copy Selection (Ctrl+C)</button>
      <button id="cm-paste" style="background:none; border:none; color:#fff; width:100%; text-align:left; padding:8px 16px; cursor:pointer; font-size:12px;">ðŸ“¥ Paste Clipboard (Ctrl+V)</button>
      <button id="cm-duplicate" style="background:none; border:none; color:#fff; width:100%; text-align:left; padding:8px 16px; cursor:pointer; font-size:12px;">ðŸ“‘ Duplicate Node (Ctrl+D)</button>
      <button id="cm-delete" style="background:none; border:none; color:#fff; width:100%; text-align:left; padding:8px 16px; cursor:pointer; font-size:12px; border-bottom:1px solid rgba(255,255,255,0.08);">ðŸ—‘ï¸ Delete Node (Del)</button>
      <button id="cm-rotate" style="background:none; border:none; color:#fff; width:100%; text-align:left; padding:8px 16px; cursor:pointer; font-size:12px;">ðŸ”„ Rotate 90Â° (R)</button>
      <button id="cm-group" style="background:none; border:none; color:#fff; width:100%; text-align:left; padding:8px 16px; cursor:pointer; font-size:12px;">ðŸ”— Group Selected</button>
      <button id="cm-arrange" style="background:none; border:none; color:#fff; width:100%; text-align:left; padding:8px 16px; cursor:pointer; font-size:12px;">ðŸ§© Auto-Arrange</button>
      <button id="cm-center" style="background:none; border:none; color:#fff; width:100%; text-align:left; padding:8px 16px; cursor:pointer; font-size:12px;">ðŸŽ¯ Center Layout View</button>
    `;
    document.body.appendChild(menu);

    const hideCM = () => menu?.classList.add('hidden');

    document.getElementById('cm-copy')?.addEventListener('click', () => { copySelection(); hideCM(); });
    document.getElementById('cm-paste')?.addEventListener('click', () => { pasteSelection(); hideCM(); });
    document.getElementById('cm-duplicate')?.addEventListener('click', () => { duplicateSelection(); hideCM(); });
    document.getElementById('cm-delete')?.addEventListener('click', () => { deleteSelection(); hideCM(); });
    document.getElementById('cm-rotate')?.addEventListener('click', () => { rotateSelection(); hideCM(); });
    document.getElementById('cm-group')?.addEventListener('click', () => { groupSelection(); hideCM(); });
    document.getElementById('cm-arrange')?.addEventListener('click', () => { autoArrangeLayout(); hideCM(); });
    document.getElementById('cm-center')?.addEventListener('click', () => { autoCenterSelection(); hideCM(); });

    cadCanvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      menu?.classList.remove('hidden');
      if (menu) {
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
      }
    });

    document.addEventListener('click', (e) => {
      if (menu && !menu.contains(e.target as Node)) {
        hideCM();
      }
    });
  }
}

// --- INITIALIZE APPLICATION (Original updated for dashboard router) ---

function init() {
  setupEventListeners();
  setupAdvancedFeatures();
  fetchSavedDesigns();
  renderPlacedDevices();
  updateAnalytics();

  // CADNOVA.io Initializations
  initRouter();
  initAuth();
  initThreeEngine();
  init3DInspectorListeners();
  initVoiceCommands();
  initAICopilot();
  initLearningHub();
  initCollaborationSim();
  initContextMenu();

  // Render initial catalog & mini-map
  renderCatalog2D();
  updateMiniMap();

  // Set default home page view
  switchView('landing');
}

// --- SETUP EVENT LISTENERS (Original) ---

function setupEventListeners() {
  // Device catalog triggers
  document.querySelectorAll('.catalog-item[data-device-type]').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.getAttribute('data-device-type') as Device['type'];
      if (type) {
        addDeviceToCanvas(type);
      }
    });
  });

  // Toolbar settings â€” Grid Toggle
  btnToggleGrid.addEventListener('click', () => {
    isGridVisible = !isGridVisible;
    if (isGridVisible) {
      btnToggleGrid.classList.add('active');
      gridBg.style.display = 'block';
    } else {
      btnToggleGrid.classList.remove('active');
      gridBg.style.display = 'none';
    }
    // Update the Grid ON/OFF label in Box 2 mode bar
    const gridLabel = document.getElementById('grid-btn-label');
    if (gridLabel) gridLabel.textContent = isGridVisible ? 'Grid ON' : 'Grid OFF';
  });

  btnClearCanvas.addEventListener('click', async () => {
    const confirmed = await showCustomConfirm('Clear the entire floor plan layout?');
    if (confirmed) {
      placedDevices = [];
      placedShapes = [];
      selectedDeviceId = null;
      selectedShapeId = null;
      renderPlacedDevices();
      renderPlaced3DShapes();
      hidePropertiesPanel();
      updateAnalytics();
      triggerAutoBOM();
      runSmartAnalysis();
      showToast('Layout cleared successfully.', 'info');
    }
  });

  // Save/New buttons
  btnSaveDesign.addEventListener('click', () => saveCurrentDesign(false));
  btnNewDesign.addEventListener('click', () => {
    currentDesignId = generateUUID();
    designNameInput.value = 'My Smart Home';
    designDescInput.value = '';
    placedDevices = [];
    placedShapes = [];
    selectedDeviceId = null;
    selectedShapeId = null;
    renderPlacedDevices();
    renderPlaced3DShapes();
    hidePropertiesPanel();
    updateAnalytics();
    triggerAutoBOM();
    runSmartAnalysis();
    showToast('Started a new layout design.', 'info');
  });

  // Dashboard buttons mapping
  document.getElementById('btn-dash-new-project')?.addEventListener('click', () => {
    switchView('workspace');
    btnNewDesign.click();
  });

  document.getElementById('btn-dash-templates')?.addEventListener('click', () => {
    const confirmTemplate = confirm('Load Gear Reducer Template in 3D Solids space?');
    if (confirmTemplate) {
      switchView('workspace');
      // Load Gear template
      currentDesignId = generateUUID();
      designNameInput.value = 'Gear Reducer Assembly';
      designDescInput.value = 'A speed reducer mechanism gear set template. #tag:Mechanical';
      placedDevices = [];
      placedShapes = [
        { id: generateUUID(), type: 'gear', name: 'Pinion Gear', material: 'Steel', x: -15, y: 0, z: 0, teeth: 16, thickness: 15 },
        { id: generateUUID(), type: 'gear', name: 'Mating Gear', material: 'Aluminum', x: 15, y: 0, z: 0, teeth: 24, thickness: 15 },
        { id: generateUUID(), type: 'shaft', name: 'Input Shaft', material: 'Steel', x: -15, y: 0, z: 20, diameter: 8, length: 120 }
      ];
      renderPlacedDevices();
      renderPlaced3DShapes();
      triggerAutoBOM();
      runSmartAnalysis();
      // Switch view mode to 3D solid modeler
      document.getElementById('btn-engine-3d')?.click();
      saveCurrentDesign();
    }
  });

  // Property inputs changes
  propName.addEventListener('input', () => {
    try {
      if (selectedDeviceId) {
        const dev = placedDevices.find(d => d.id === selectedDeviceId);
        if (dev) {
          dev.name = propName.value;
          renderPlacedDevices();
        }
      }
    } catch (e) { console.error(e); }
  });

  propName.addEventListener('change', async () => {
    try {
      if (selectedDeviceId) await saveCurrentDesign();
    } catch (e) { console.error(e); }
  });

  propRoom.addEventListener('change', async () => {
    try {
      if (selectedDeviceId) {
        const dev = placedDevices.find(d => d.id === selectedDeviceId);
        if (dev) {
          dev.room = propRoom.value;
          renderPlacedDevices();
          await saveCurrentDesign();
        }
      }
    } catch (e) { console.error(e); }
  });

  propState.addEventListener('change', () => {
    if (!selectedDeviceId) return;
    const dev = placedDevices.find(d => d.id === selectedDeviceId);
    if (!dev) return;

    const newState = propState.checked;

    if (dev.name === 'Smart Dimmer Wall Switch') {
      // ACK-gated: only send command, wait for ESP32 led_status ACK to update UI
      if ((window as any).appWs && (window as any).appWs.readyState === WebSocket.OPEN) {
        console.log(newState ? 'Switch ON clicked' : 'Switch OFF clicked');
        
        let payload: any = {
          device: 'esp32',
          power: newState
        };
        
        if (newState) {
          const bv = dev.properties?.brightness ?? parseInt(propBrightness.value) ?? 50;
          const cv = dev.properties?.color || propColor.value || '#ffffff';
          const r = parseInt(cv.slice(1, 3), 16) || 255;
          const g = parseInt(cv.slice(3, 5), 16) || 255;
          const b = parseInt(cv.slice(5, 7), 16) || 255;
          payload.brightness = bv;
          payload.color = { r, g, b };
        }
        
        console.log('Sending command to backend:', payload);
        (window as any).appWs.send(JSON.stringify(payload));
        
        // Disable toggle while waiting for ACK (max 5s)
        propState.disabled = true;
        const aTimer = window.setTimeout(() => {
          propState.disabled = false;
          // Only revert if we haven't received an ACK (if dev.state still != newState)
          if (dev.state !== newState) {
            propState.checked = dev.state; 
            showToast('⚠️ No response from ESP32 — command may not have executed.', 'error');
          }
        }, 5000);
        (window as any)._pendingAckTimer = aTimer;
      } else {
        // ESP32 not connected — revert toggle
        propState.checked = dev.state;
        showToast('🔴 ESP32 is not connected.', 'error');
      }
    } else {
      // Non-dimmer devices: optimistic update
      dev.state = newState;
      renderPlacedDevices();
      updateAnalytics();
      saveCurrentDesign().catch(e => console.error('DB save:', e));
    }
  });

  // Light adjustments
  propBrightness.addEventListener('input', () => {
    try {
      valBrightness.textContent = `${propBrightness.value}%`;
      if (selectedDeviceId) {
        const dev = placedDevices.find(d => d.id === selectedDeviceId);
        if (dev) {
          dev.properties.brightness = parseInt(propBrightness.value);
          renderPlacedDevices();
          
          if (dev.name === 'Smart Dimmer Wall Switch' && (window as any).appWs && (window as any).appWs.readyState === WebSocket.OPEN) {
            const cv = dev.properties?.color || propColor.value || '#ffffff';
            const r = parseInt(cv.slice(1, 3), 16) || 255;
            const g = parseInt(cv.slice(3, 5), 16) || 255;
            const b = parseInt(cv.slice(5, 7), 16) || 255;
            // Always send power:true if we're adjusting brightness
            (window as any).appWs.send(JSON.stringify({ 
              device: 'esp32', 
              power: true,
              brightness: dev.properties.brightness,
              color: { r, g, b }
            }));
          }
        }
        updateAnalytics();
      }
    } catch (e) { console.error(e); }
  });

  propBrightness.addEventListener('change', async () => {
    try {
      if (selectedDeviceId) await saveCurrentDesign();
    } catch (e) { console.error(e); }
  });

  propColor.addEventListener('input', () => {
    try {
      if (selectedDeviceId) {
        const dev = placedDevices.find(d => d.id === selectedDeviceId);
        if (dev) {
          dev.properties.color = propColor.value;
          renderPlacedDevices();
          
          if (dev.name === 'Smart Dimmer Wall Switch' && (window as any).appWs && (window as any).appWs.readyState === WebSocket.OPEN) {
            const bv = dev.properties?.brightness ?? parseInt(propBrightness.value) ?? 50;
            const cv = propColor.value;
            const r = parseInt(cv.slice(1, 3), 16) || 255;
            const g = parseInt(cv.slice(3, 5), 16) || 255;
            const b = parseInt(cv.slice(5, 7), 16) || 255;
            
            (window as any).appWs.send(JSON.stringify({ 
              device: 'esp32', 
              power: true,
              brightness: bv,
              color: { r, g, b }
            }));
          }
        }
      }
    } catch (e) { console.error(e); }
  });

  propColor.addEventListener('change', async () => {
    try {
      if (selectedDeviceId) await saveCurrentDesign();
    } catch (e) { console.error(e); }
  });

  // Thermostat temp adjustment
  propTemp.addEventListener('input', () => {
    try {
      valTemp.textContent = `${propTemp.value}Â°C`;
      if (selectedDeviceId) {
        const dev = placedDevices.find(d => d.id === selectedDeviceId);
        if (dev) {
          dev.properties.temperature = parseFloat(propTemp.value);
          renderPlacedDevices();
        }
        updateAnalytics();
      }
    } catch (e) { console.error(e); }
  });

  // Thermostat temp save
  propTemp.addEventListener('change', async () => {
    try {
      if (selectedDeviceId) await saveCurrentDesign();
    } catch (e) { console.error(e); }
  });

  // Speaker adjustments
  propVolume.addEventListener('input', () => {
    try {
      valVolume.textContent = `${propVolume.value}%`;
      if (selectedDeviceId) {
        const dev = placedDevices.find(d => d.id === selectedDeviceId);
        if (dev) {
          dev.properties.volume = parseInt(propVolume.value);
          renderPlacedDevices();
        }
      }
    } catch (e) { console.error(e); }
  });

  propVolume.addEventListener('change', async () => {
    try {
      if (selectedDeviceId) await saveCurrentDesign();
    } catch (e) { console.error(e); }
  });

  propTrack.addEventListener('change', async () => {
    try {
      if (selectedDeviceId) {
        const dev = placedDevices.find(d => d.id === selectedDeviceId);
        if (dev) {
          dev.properties.track = propTrack.value;
          renderPlacedDevices();
          await saveCurrentDesign();
        }
      }
    } catch (e) { console.error(e); }
  });

  // Delete placed device
  btnDeleteDevice.addEventListener('click', async () => {
    if (selectedDeviceId) {
      const confirmed = await showCustomConfirm('Remove this smart device from design?');
      if (confirmed && selectedDeviceId) {
        placedDevices = placedDevices.filter(d => d.id !== selectedDeviceId);
        selectedDeviceId = null;
        renderPlacedDevices();
        hidePropertiesPanel();
        updateAnalytics();
        await saveCurrentDesign();
      }
    }
  });
  cadCanvas.addEventListener('mousemove', handleDragMove);
  cadCanvas.addEventListener('mouseup', handleDragEnd);
  cadCanvas.addEventListener('mouseleave', handleDragEnd);

  // Dynamic Catalog search & filtering listeners
  const searchInput = document.getElementById('catalog-search');
  const categoryFilter = document.getElementById('catalog-category-filter');

  if (searchInput) searchInput.addEventListener('input', () => renderCatalog2D());
  if (categoryFilter) categoryFilter.addEventListener('change', () => renderCatalog2D());

  // HTML5 Drag and Drop targets (2D SVG Canvas)
  const container2D = document.getElementById('container-canvas-2d');
  if (container2D) {
    container2D.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    container2D.addEventListener('drop', (e) => {
      e.preventDefault();
      const rawJson = e.dataTransfer?.getData('device-json');
      if (rawJson) {
        try {
          const item = JSON.parse(rawJson);
          const rect = cadCanvas.getBoundingClientRect();
          let dropX = ((e.clientX - rect.left) / rect.width) * 800;
          let dropY = ((e.clientY - rect.top) / rect.height) * 500;

          if (snapToGrid) {
            dropX = Math.round(dropX / GRID_SNAP_VAL) * GRID_SNAP_VAL;
            dropY = Math.round(dropY / GRID_SNAP_VAL) * GRID_SNAP_VAL;
          }
          addDeviceFromCatalog(item, dropX, dropY);
        } catch (err) {
          console.error('Drop error:', err);
        }
      }
    });
  }

  // HTML5 Drag and Drop targets (3D Viewport)
  const container3D = document.getElementById('three-canvas-container');
  if (container3D) {
    container3D.addEventListener('dragover', (e) => e.preventDefault());
    container3D.addEventListener('drop', (e) => {
      e.preventDefault();
      const rawJson = e.dataTransfer?.getData('device-json');
      if (rawJson) {
        try {
          const item = JSON.parse(rawJson);
          // If shape is dropped into 3D, translate to base shape additions
          if (item.type === 'light') add3DShape('cube', { material: 'Aluminum', name: 'Light Base' });
          else if (item.type === 'sensor') add3DShape('cylinder', { material: 'PLA', radius: 15, height: 40 });
          else add3DShape('cube', { material: 'Steel' });
        } catch (err) {
          console.error(err);
        }
      }
    });
  }

  // Ruler measurement clicking interceptor
  cadCanvas.addEventListener('click', handleCaliperClick);

  // Undo / Redo buttons
  document.getElementById('btn-undo')?.addEventListener('click', () => undo());
  document.getElementById('btn-redo')?.addEventListener('click', () => redo());

  // Copy / Paste / Duplicate / Delete buttons
  document.getElementById('btn-copy')?.addEventListener('click', () => copySelection());
  document.getElementById('btn-paste')?.addEventListener('click', () => pasteSelection());
  document.getElementById('btn-duplicate')?.addEventListener('click', () => duplicateSelection());
  document.getElementById('btn-delete')?.addEventListener('click', () => deleteSelection());

  // Group / Ungroup buttons
  document.getElementById('btn-group')?.addEventListener('click', () => groupSelection());
  document.getElementById('btn-ungroup')?.addEventListener('click', () => ungroupSelection());

  // Flip H / Flip V buttons
  document.getElementById('btn-flip-h')?.addEventListener('click', () => flipHorizontal());
  document.getElementById('btn-flip-v')?.addEventListener('click', () => flipVertical());

  // Zoom / Pan / Fit buttons
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
    if (currentEngineMode === '2d') zoom2D(1.2);
    else {
      if (threeCamera) threeCamera.position.multiplyScalar(0.8);
    }
  });

  document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
    if (currentEngineMode === '2d') zoom2D(0.8);
    else {
      if (threeCamera) threeCamera.position.multiplyScalar(1.25);
    }
  });

  document.getElementById('btn-fit-screen')?.addEventListener('click', () => {
    if (currentEngineMode === '2d') resetZoom2D();
    else {
      if (threeCamera && threeControls) {
        threeCamera.position.set(100, 100, 150);
        threeControls.target.set(0, 0, 0);
      }
    }
  });

  const btnPan = document.getElementById('btn-pan-mode');
  btnPan?.addEventListener('click', () => {
    btnPan.classList.toggle('active');
    isPanning = btnPan.classList.contains('active');
    if (isPanning) {
      cadCanvas.style.cursor = 'grab';
    } else {
      cadCanvas.style.cursor = 'default';
    }
  });

  let isSelectingMarquee = false;
  let marqueeStartX = 0;
  let marqueeStartY = 0;
  let marqueeRect: SVGRectElement | null = null;

  // Pan or Selection Marquee interaction events on background grid
  const wallPreviewLine = document.getElementById('wall-preview') as unknown as SVGPolylineElement | null;
  const wallStartDot = document.getElementById('wall-start-dot') as unknown as SVGCircleElement | null;

  function getSVGPoint(clientX: number, clientY: number) {
    const pt = cadCanvas.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const svgP = pt.matrixTransform(cadCanvas.getScreenCTM()!.inverse());
    if (snapToGrid) {
      svgP.x = Math.round(svgP.x / GRID_SNAP_VAL) * GRID_SNAP_VAL;
      svgP.y = Math.round(svgP.y / GRID_SNAP_VAL) * GRID_SNAP_VAL;
    }
    return svgP;
  }

  // Draw Wall â€” mousemove to update live preview
  cadCanvas.addEventListener('mousemove', (e) => {
    if (currentDrawMode === 'draw' && isDrawingWall && wallStartPoint && wallPreviewLine) {
      const svgP = getSVGPoint(e.clientX, e.clientY);
      wallPreviewLine.setAttribute('points', `${wallStartPoint.x},${wallStartPoint.y} ${svgP.x},${svgP.y}`);
      wallPreviewLine.setAttribute('opacity', '0.8');
    }
  });

  cadCanvas.addEventListener('mousedown', (e) => {
    if (currentDrawMode === 'draw') {
      const svgP = getSVGPoint(e.clientX, e.clientY);

      if (!isDrawingWall) {
        // Start drawing
        isDrawingWall = true;
        wallStartPoint = { x: svgP.x, y: svgP.y };
        if (wallStartDot) {
          wallStartDot.setAttribute('cx', svgP.x.toString());
          wallStartDot.setAttribute('cy', svgP.y.toString());
          wallStartDot.setAttribute('opacity', '1');
        }
        if (wallPreviewLine) {
          wallPreviewLine.setAttribute('points', `${svgP.x},${svgP.y} ${svgP.x},${svgP.y}`);
          wallPreviewLine.setAttribute('opacity', '0.5');
        }
        showToast('Click to place the end of the wall. Press Esc to cancel.', 'info');
      } else {
        // Finish wall segment
        if (!wallStartPoint) return;
        pushHistory();
        const newWall: Wall = {
          id: generateUUID(),
          x1: wallStartPoint.x,
          y1: wallStartPoint.y,
          x2: svgP.x,
          y2: svgP.y,
          thickness: 4,
          color: '#374151'
        };
        placedWalls.push(newWall);
        renderWalls();
        logAction(`Draw Wall (${Math.round(Math.sqrt((svgP.x - wallStartPoint.x) ** 2 + (svgP.y - wallStartPoint.y) ** 2) / 40 * 10) / 10}m)`);
        saveCurrentDesign(true);
        // Continue from end point (connected wall drawing)
        wallStartPoint = { x: svgP.x, y: svgP.y };
        if (wallStartDot) {
          wallStartDot.setAttribute('cx', svgP.x.toString());
          wallStartDot.setAttribute('cy', svgP.y.toString());
        }
        showToast('Wall placed! Click to continue or press Esc to stop.', 'success');
      }
      return;
    }
    

    if (isPanning && e.target === gridBg) {
      isPanning = true;
      cadCanvas.style.cursor = 'grabbing';
      startPanX = e.clientX - panX;
      startPanY = e.clientY - panY;

      const onMove = (moveEv: MouseEvent) => {
        panX = moveEv.clientX - startPanX;
        panY = moveEv.clientY - startPanY;
        applyZoomTransform();
      };

      const onUp = () => {
        cadCanvas.style.cursor = 'grab';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    } else if (!isPanning && e.target === gridBg) {
      // Start marquee selection (Phase 4 selection marquee)
      isSelectingMarquee = true;

      const pt = cadCanvas.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(cadCanvas.getScreenCTM()!.inverse());
      marqueeStartX = svgP.x;
      marqueeStartY = svgP.y;

      if (!e.shiftKey) {
        selectedDeviceIds.clear();
        selectedDeviceId = null;
        hidePropertiesPanel();
      }

      marqueeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect') as SVGRectElement;
      marqueeRect.setAttribute('id', 'selection-marquee');
      marqueeRect.setAttribute('fill', 'rgba(144, 97, 249, 0.12)');
      marqueeRect.setAttribute('stroke', '#9061f9');
      marqueeRect.setAttribute('stroke-width', '1');
      marqueeRect.setAttribute('stroke-dasharray', '3 3');
      marqueeRect.setAttribute('x', marqueeStartX.toString());
      marqueeRect.setAttribute('y', marqueeStartY.toString());
      marqueeRect.setAttribute('width', '0');
      marqueeRect.setAttribute('height', '0');
      cadCanvas.appendChild(marqueeRect);

      const onMove = (moveEv: MouseEvent) => {
        if (!isSelectingMarquee || !marqueeRect) return;
        const currentP = cadCanvas.createSVGPoint();
        currentP.x = moveEv.clientX;
        currentP.y = moveEv.clientY;
        const currentSvgP = currentP.matrixTransform(cadCanvas.getScreenCTM()!.inverse());

        const x = Math.min(marqueeStartX, currentSvgP.x);
        const y = Math.min(marqueeStartY, currentSvgP.y);
        const w = Math.abs(marqueeStartX - currentSvgP.x);
        const h = Math.abs(marqueeStartY - currentSvgP.y);

        marqueeRect.setAttribute('x', x.toString());
        marqueeRect.setAttribute('y', y.toString());
        marqueeRect.setAttribute('width', w.toString());
        marqueeRect.setAttribute('height', h.toString());

        // Scan devices
        placedDevices.forEach(d => {
          if (d.x >= x && d.x <= x + w && d.y >= y && d.y <= y + h) {
            selectedDeviceIds.add(d.id);
          } else if (!e.shiftKey) {
            selectedDeviceIds.delete(d.id);
          }
        });
        renderPlacedDevices();
      };

      const onUp = () => {
        isSelectingMarquee = false;
        if (marqueeRect && marqueeRect.parentNode) {
          marqueeRect.parentNode.removeChild(marqueeRect);
        }
        marqueeRect = null;

        if (selectedDeviceIds.size > 0) {
          selectedDeviceId = Array.from(selectedDeviceIds)[0];
          selectDevice(selectedDeviceId);
        }

        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
  });

  // Snap & Measure toggles
  const btnSnap = document.getElementById('btn-toggle-snap');
  btnSnap?.addEventListener('click', () => {
    snapToGrid = !snapToGrid;
    btnSnap.classList.toggle('active', snapToGrid);
    showToast(`Snap to grid is ${snapToGrid ? 'ON' : 'OFF'}`, 'info');
  });

  const btnMeasure = document.getElementById('btn-measure-tool');
  btnMeasure?.addEventListener('click', () => {
    measureMode = !measureMode;
    btnMeasure.classList.toggle('active', measureMode);
    if (measureMode) {
      measurePoints = [];
      showToast('Caliper Active: Click points on canvas to measure', 'info');
    }
  });

  // Clean layout auto spacing
  document.getElementById('btn-auto-arrange')?.addEventListener('click', () => autoArrangeLayout());

  // Move, Rotate, Resize tool feedback & commands
  document.getElementById('btn-move-tool')?.addEventListener('click', () => {
    // Switch to select mode and highlight that drag is enabled
    currentDrawMode = 'select';
    updateDrawModeUI();
    const targets = placedDevices.filter(d => d.id === selectedDeviceId || selectedDeviceIds.has(d.id));
    if (targets.length > 0) {
      showToast(`Move active: drag "${targets[0].name}" or use Arrow Keys â†‘â†“â†â†’`, 'info');
    } else {
      showToast('Move tool: select a device first, then drag it', 'info');
    }
    if (cadCanvas) cadCanvas.style.cursor = 'move';
    setTimeout(() => { if (cadCanvas) cadCanvas.style.cursor = ''; }, 3000);
  });

  document.getElementById('btn-rotate-tool')?.addEventListener('click', () => {
    rotateSelection();
    logAction('Rotate 90Â°');
  });

  document.getElementById('btn-resize-tool')?.addEventListener('click', () => {
    const targets = placedDevices.filter(d => d.id === selectedDeviceId || selectedDeviceIds.has(d.id));
    if (targets.length > 0) {
      showToast('Resize: drag the â—» bottom-right handle on the selected device', 'info');
    } else {
      showToast('Select a device first, then drag its resize handle', 'info');
    }
  });

  // Alignment operations (Phase 2 align tools)
  document.getElementById('btn-align-left')?.addEventListener('click', () => { alignSelection('left'); logAction('Align Left'); });
  document.getElementById('btn-align-right')?.addEventListener('click', () => { alignSelection('right'); logAction('Align Right'); });
  document.getElementById('btn-align-top')?.addEventListener('click', () => { alignSelection('top'); logAction('Align Top'); });
  document.getElementById('btn-align-bottom')?.addEventListener('click', () => { alignSelection('bottom'); logAction('Align Bottom'); });

  // Mini-map toggle (Phase 2 minimap tool)
  const btnToggleMiniMap = document.getElementById('btn-toggle-minimap');
  btnToggleMiniMap?.addEventListener('click', () => {
    const container = document.getElementById('canvas-minimap-container');
    if (container) {
      container.classList.toggle('hidden');
      const active = !container.classList.contains('hidden');
      btnToggleMiniMap.classList.toggle('active', active);
      showToast(`Mini-map display is ${active ? 'ON' : 'OFF'}`, 'info');
    }
  });

  // History Log Modal (styled, replaces alert)
  function showHistoryLogModal() {
    const modal = document.getElementById('history-log-modal');
    const body = document.getElementById('history-log-body');
    if (!modal || !body) return;

    body.innerHTML = '';
    if (actionLog.length === 0) {
      body.innerHTML = '<div class="history-log-empty">No actions recorded yet. Perform operations to see history.</div>';
    } else {
      const entries = [...actionLog].reverse();
      entries.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'history-log-entry';
        div.innerHTML = `
          <span class="log-step">#${entry.step}</span>
          <span class="log-desc">${entry.action}</span>
          <span class="log-time">${entry.timestamp}</span>
        `;
        body.appendChild(div);
      });
    }

    modal.classList.remove('hidden');
  }

  document.getElementById('btn-history-panel')?.addEventListener('click', showHistoryLogModal);
  document.getElementById('btn-close-history-log')?.addEventListener('click', () => {
    document.getElementById('history-log-modal')?.classList.add('hidden');
  });
  // Close when clicking backdrop
  document.getElementById('history-log-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('history-log-modal')) {
      document.getElementById('history-log-modal')?.classList.add('hidden');
    }
  });

  // Autosave status toggle (Phase 2 autosave tool)
  const btnToggleAutosave = document.getElementById('btn-toggle-autosave') as HTMLInputElement;
  if (btnToggleAutosave) {
    btnToggleAutosave.addEventListener('change', () => {
      autoSaveEnabled = btnToggleAutosave.checked;
      showToast(`Auto-save state is ${autoSaveEnabled ? 'ON' : 'OFF'}`, 'info');
    });
  }

  // AI Gateway modal event bindings (Phase 7 fallback alerts)
  document.getElementById('btn-close-ai-gateway')?.addEventListener('click', () => {
    document.getElementById('ai-gateway-modal')?.classList.add('hidden');
  });
  document.getElementById('btn-configure-ai-gateway')?.addEventListener('click', () => {
    document.getElementById('ai-gateway-modal')?.classList.add('hidden');
    switchView('settings');
    showToast('Redirected to settings page. Configure your AI keys.', 'info');
  });

  const checkOfflineAI = document.getElementById('admin-simulate-offline-ai') as HTMLInputElement;
  if (checkOfflineAI) {
    checkOfflineAI.addEventListener('change', () => {
      simulateOfflineAI = checkOfflineAI.checked;
      showToast(`Simulate Offline AI Gateway is now ${simulateOfflineAI ? 'ON' : 'OFF'}`, 'info');
    });
  }

  // Export / Import dropdown menus
  const btnExport = document.getElementById('btn-export-menu');
  const exportDrop = document.getElementById('export-dropdown');
  btnExport?.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDrop?.classList.toggle('hidden');
    importDrop?.classList.add('hidden');
  });

  const btnImport = document.getElementById('btn-import-menu');
  const importDrop = document.getElementById('import-dropdown');
  btnImport?.addEventListener('click', (e) => {
    e.stopPropagation();
    importDrop?.classList.toggle('hidden');
    exportDrop?.classList.add('hidden');
  });

  document.addEventListener('click', () => {
    exportDrop?.classList.add('hidden');
    importDrop?.classList.add('hidden');
  });

  document.querySelectorAll('.export-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      const format = opt.getAttribute('data-format');
      if (format) exportCAD(format);
    });
  });

  document.getElementById('opt-import-file')?.addEventListener('click', () => {
    document.getElementById('cad-import-input')?.click();
  });

  document.getElementById('cad-import-input')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const text = readerEvent.target?.result as string;
        if (text) importCAD(text);
      };
      reader.readAsText(file);
    }
  });

  // Simulations modal
  const simModal = document.getElementById('simulation-modal');
  document.getElementById('btn-run-simulation')?.addEventListener('click', () => {
    simModal?.classList.remove('hidden');
    runStressSimulation(); // DefaultFEA
  });

  document.getElementById('btn-close-sim-modal')?.addEventListener('click', () => simModal?.classList.add('hidden'));
  document.getElementById('btn-close-sim-ok')?.addEventListener('click', () => simModal?.classList.add('hidden'));

  const btnSimStress = document.getElementById('btn-sim-stress');
  const btnSimThermal = document.getElementById('btn-sim-thermal');
  const btnSimSignals = document.getElementById('btn-sim-signals');

  btnSimStress?.addEventListener('click', () => {
    btnSimStress.classList.add('active');
    btnSimThermal?.classList.remove('active');
    btnSimSignals?.classList.remove('active');
    runStressSimulation();
  });

  btnSimThermal?.addEventListener('click', () => {
    btnSimThermal.classList.add('active');
    btnSimStress?.classList.remove('active');
    btnSimSignals?.classList.remove('active');
    runThermalSimulation();
  });

  btnSimSignals?.addEventListener('click', () => {
    btnSimSignals.classList.add('active');
    btnSimStress?.classList.remove('active');
    btnSimThermal?.classList.remove('active');
    runRFSignalSimulation();
  });

  // Generate specification report
  document.getElementById('btn-generate-report')?.addEventListener('click', () => {
    exportCAD('PDF');
  });

  // Window-level key listeners
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!e.key) return;
    const isEditingText = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
    if (isEditingText) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelection();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      copySelection();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      pasteSelection();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateSelection();
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      rotateSelection();
    } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey) {
      e.preventDefault();
      flipHorizontal();
    } else if (e.key.toLowerCase() === 'v' && !e.ctrlKey) {
      e.preventDefault();
      flipVertical();
    } else if (e.key === 'Escape') {
      // Cancel wall drawing if active
      if (isDrawingWall) {
        isDrawingWall = false;
        wallStartPoint = null;
        if (wallPreviewLine) { wallPreviewLine.setAttribute('points', ''); wallPreviewLine.setAttribute('opacity', '0'); }
        if (wallStartDot) wallStartDot.setAttribute('opacity', '0');
        showToast('Wall drawing cancelled', 'info');
        return;
      }
      selectedDeviceId = null;
      selectedShapeId = null;
      selectedWallId = null;
      selectedRoomId = null;
      selectedDeviceIds.clear();
      selectedShapeIds.clear();
      renderPlacedDevices();
      renderWalls();
      renderRooms();
      renderPlaced3DShapes();
      hidePropertiesPanel();
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      // Shift coordinate coordinates keys
      if (currentEngineMode === '2d') {
        const delta = snapToGrid ? GRID_SNAP_VAL : 5;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowUp') dy = -delta;
        else if (e.key === 'ArrowDown') dy = delta;
        else if (e.key === 'ArrowLeft') dx = -delta;
        else if (e.key === 'ArrowRight') dx = delta;

        const targets = placedDevices.filter(d => d.id === selectedDeviceId || selectedDeviceIds.has(d.id));
        if (targets.length > 0) {
          e.preventDefault();
          pushHistory();
          targets.forEach(d => {
            d.x = Math.max(20, Math.min(780, d.x + dx));
            d.y = Math.max(20, Math.min(480, d.y + dy));
          });
          renderPlacedDevices();
          updateMiniMap();
          saveCurrentDesign();
        }
      }
    }
  });

  // Drawing mode buttons
  const btnModeSelect = document.getElementById('btn-mode-select');
  const btnModeDraw = document.getElementById('btn-mode-draw');
  const btnModeErase = document.getElementById('btn-mode-erase');

  const updateDrawModeUI = () => {
    btnModeSelect?.classList.toggle('active', currentDrawMode === 'select');
    btnModeDraw?.classList.toggle('active', currentDrawMode === 'draw');
    btnModeErase?.classList.toggle('active', currentDrawMode === 'erase');
    // Update cursor
    if (currentDrawMode === 'draw') {
      cadCanvas.style.cursor = 'crosshair';
    } else if (currentDrawMode === 'erase') {
      cadCanvas.style.cursor = 'not-allowed';
    } else {
      cadCanvas.style.cursor = '';
    }
  };

  btnModeSelect?.addEventListener('click', () => {
    currentDrawMode = 'select';
    // Cancel any active wall drawing
    if (isDrawingWall) {
      isDrawingWall = false;
      wallStartPoint = null;
      if (wallPreviewLine) { wallPreviewLine.setAttribute('points', ''); wallPreviewLine.setAttribute('opacity', '0'); }
      if (wallStartDot) wallStartDot.setAttribute('opacity', '0');
    }
    updateDrawModeUI();
    showToast('Select mode: click to select objects, drag to move', 'info');
  });
  
  btnModeDraw?.addEventListener('click', () => {
    currentDrawMode = 'draw';
    updateDrawModeUI();
    showToast('Draw Wall mode: click to start a wall, click again to finish it', 'info');
  });
  
  btnModeErase?.addEventListener('click', () => {
    currentDrawMode = 'erase';
    if (isDrawingWall) {
      isDrawingWall = false;
      wallStartPoint = null;
      if (wallPreviewLine) { wallPreviewLine.setAttribute('points', ''); wallPreviewLine.setAttribute('opacity', '0'); }
      if (wallStartDot) wallStartDot.setAttribute('opacity', '0');
    }
    updateDrawModeUI();
    showToast('Erase mode: click any device, wall, or room to delete it (with confirmation)', 'info');
  });

  // Initialize mode UI
  updateDrawModeUI();

  // â”€â”€â”€ ADD ROOM functionality â”€â”€â”€
  const addRoomPanel = document.getElementById('add-room-panel');
  const btnAddRoom = document.getElementById('btn-add-room');
  const btnCloseRoomPanel = document.getElementById('btn-close-room-panel');

  btnAddRoom?.addEventListener('click', () => {
    addRoomPanel?.classList.toggle('hidden');
  });

  btnCloseRoomPanel?.addEventListener('click', () => {
    addRoomPanel?.classList.add('hidden');
  });

  const ROOM_EMOJIS: Record<string, string> = {
    living: 'ðŸ›‹ï¸', kitchen: 'ðŸ³', bedroom: 'ðŸ›ï¸', bathroom: 'ðŸš¿',
    garage: 'ðŸš—', office: 'ðŸ’¼', hallway: 'ðŸšª', balcony: 'ðŸŒ¿',
    study: 'ðŸ“š', gym: 'ðŸ’ª', kids: 'ðŸ§¸', storage: 'ðŸ“¦', custom: 'ðŸ '
  };

  const ROOM_SIZES: Record<string, { w: number; h: number }> = {
    living: { w: 200, h: 160 }, kitchen: { w: 160, h: 140 }, bedroom: { w: 180, h: 160 },
    bathroom: { w: 120, h: 120 }, garage: { w: 200, h: 180 }, office: { w: 160, h: 140 },
    hallway: { w: 240, h: 80 }, balcony: { w: 160, h: 100 }, study: { w: 140, h: 120 },
    gym: { w: 200, h: 180 }, kids: { w: 160, h: 140 }, storage: { w: 120, h: 100 }, custom: { w: 160, h: 140 }
  };

  function addRoomToCanvas(type: string, name: string) {
    pushHistory();
    const size = ROOM_SIZES[type] || { w: 160, h: 140 };
    const emoji = ROOM_EMOJIS[type] || 'ðŸ ';
    // Spread rooms out so they don't overlap perfectly
    const offset = placedRooms.length * 20;
    const newRoom: Room = {
      id: generateUUID(),
      name,
      type,
      emoji,
      x: 80 + (offset % 200),
      y: 80 + (offset % 100),
      width: size.w,
      height: size.h,
      color: ROOM_COLORS[type] || 'rgba(92,42,143,0.10)',
    };
    placedRooms.push(newRoom);
    selectedRoomId = newRoom.id;
    renderRooms();
    logAction(`Add Room: ${name}`);
    saveCurrentDesign(true);
    addRoomPanel?.classList.add('hidden');
    showToast(`Room "${name}" added to canvas! Drag to position it.`, 'success');
  }

  // Wire room type buttons
  document.querySelectorAll('.room-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-room-type') || 'custom';
      const name = btn.getAttribute('data-room-name') || 'Room';
      addRoomToCanvas(type, name);
    });
  });

  // Custom room name button
  document.getElementById('btn-add-custom-room')?.addEventListener('click', () => {
    const customNameInput = document.getElementById('custom-room-name') as HTMLInputElement;
    const customName = customNameInput?.value.trim() || 'Custom Room';
    addRoomToCanvas('custom', customName);
    if (customNameInput) customNameInput.value = '';
  });
}

// --- DEVICE CANVAS CREATION (Original) ---

function addDeviceToCanvas(type: Device['type']) {
  const defaultNames = {
    light: 'Smart Bulb',
    camera: 'Security Camera',
    thermostat: 'Nest Controller',
    speaker: 'Sonos One',
    lock: 'August Lock',
    plug: 'Smart Plug',
    sensor: 'Temp Sensor',
    motion: 'Motion Sensor'
  };

  const defaultProps: Record<Device['type'], DeviceProperties> = {
    light: { brightness: 80, color: '#ffbe3b' },
    camera: {},
    thermostat: { temperature: 22.0 },
    speaker: { volume: 50, track: 'Ambient Chillout Mix' },
    lock: { isLocked: true, pinCode: '1234' },
    plug: {},
    sensor: { temperature: 22.0, humidity: 55 },
    motion: { motionDetected: false }
  };

  const newDevice: Device = {
    id: generateUUID(),
    name: `${defaultNames[type]} ${placedDevices.filter(d => d.type === type).length + 1}`,
    type,
    room: 'Living Room',
    x: 400 + (Math.random() * 60 - 30),
    y: 250 + (Math.random() * 60 - 30),
    state: true,
    properties: defaultProps[type]
  };

  placedDevices.push(newDevice);
  selectDevice(newDevice.id);
  renderPlacedDevices();
  updateAnalytics();
  if (type === 'sensor') setupSensorSimulation(newDevice.id);
  if (type === 'motion') setupMotionSimulation(newDevice.id);
  saveCurrentDesign(true);
}

// --- RENDER SVG NODES (Original) ---

function renderPlacedDevices() {
  placedDevicesGroup.innerHTML = '';

  placedDevices.forEach(dev => {
    const isSelected = dev.id === selectedDeviceId || selectedDeviceIds.has(dev.id);
    let accentColor = ACCENT_COLORS[dev.type];
    if (dev.name === 'Smart Dimmer Wall Switch') {
      accentColor = dev.state ? '#1e90ff' : '#8e95b2';
    }

    // Check for placement collisions (Phase 3 overlapping)
    let isColliding = false;
    placedDevices.forEach(other => {
      if (other.id !== dev.id) {
        const dist = Math.sqrt((other.x - dev.x) ** 2 + (other.y - dev.y) ** 2);
        if (dist < 40) {
          isColliding = true;
        }
      }
    });

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `device-node ${isSelected ? 'selected' : ''} ${isColliding ? 'overlap' : ''}`);
    const scale = dev.properties.scale || 1.0;
    const scaleX = (dev.flipH ? -1 : 1) * scale;
    const scaleY = (dev.flipV ? -1 : 1) * scale;
    g.setAttribute('transform', `translate(${dev.x}, ${dev.y}) rotate(${dev.rotation || 0}) scale(${scaleX}, ${scaleY})`);
    g.setAttribute('style', `color: ${accentColor}`);
    g.setAttribute('id', `node-${dev.id}`);

    if (dev.state) {
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      glow.setAttribute('cx', '0');
      glow.setAttribute('cy', '0');
      glow.setAttribute('r', '20');
      glow.setAttribute('fill', accentColor);
      glow.setAttribute('opacity', '0.2');
      glow.setAttribute('class', 'node-glow');
      g.appendChild(glow);
    }

    if (isSelected) {
      const selectionRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      selectionRing.setAttribute('cx', '0');
      selectionRing.setAttribute('cy', '0');
      selectionRing.setAttribute('r', '25');
      selectionRing.setAttribute('fill', 'none');
      selectionRing.setAttribute('stroke', accentColor);
      selectionRing.setAttribute('stroke-width', '1.5');
      selectionRing.setAttribute('stroke-dasharray', '4 2');
      selectionRing.setAttribute('class', 'selection-ring-active');
      g.appendChild(selectionRing);

      // Rotation handle connector line (Phase 4 handles)
      const rotLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      rotLine.setAttribute('x1', '0');
      rotLine.setAttribute('y1', '-25');
      rotLine.setAttribute('x2', '0');
      rotLine.setAttribute('y2', '-40');
      rotLine.setAttribute('stroke', accentColor);
      rotLine.setAttribute('stroke-width', '1');
      g.appendChild(rotLine);

      // Rotation handle node (Phase 4 handles)
      const rotNode = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      rotNode.setAttribute('cx', '0');
      rotNode.setAttribute('cy', '-40');
      rotNode.setAttribute('r', '4.5');
      rotNode.setAttribute('fill', '#ffffff');
      rotNode.setAttribute('stroke', accentColor);
      rotNode.setAttribute('stroke-width', '1.5');
      rotNode.setAttribute('style', 'cursor: grab;');
      rotNode.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();

        const onMove = (moveEv: MouseEvent) => {
          const pt = cadCanvas.createSVGPoint();
          pt.x = moveEv.clientX;
          pt.y = moveEv.clientY;
          const svgP = pt.matrixTransform(cadCanvas.getScreenCTM()!.inverse());
          const angle = Math.atan2(svgP.y - dev.y, svgP.x - dev.x);
          let deg = (angle * 180 / Math.PI) + 90;
          if (deg < 0) deg += 360;

          if (snapToGrid) {
            deg = Math.round(deg / 15) * 15;
          }
          dev.rotation = deg;
          renderPlacedDevices();
          selectDevice(dev.id);
        };
        const onUp = () => {
          saveCurrentDesign(true);
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
      g.appendChild(rotNode);

      // Resize scale handle node (Phase 4 handles)
      const szNode = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      szNode.setAttribute('x', '18');
      szNode.setAttribute('y', '18');
      szNode.setAttribute('width', '8');
      szNode.setAttribute('height', '8');
      szNode.setAttribute('fill', '#ffffff');
      szNode.setAttribute('stroke', accentColor);
      szNode.setAttribute('stroke-width', '1.5');
      szNode.setAttribute('style', 'cursor: se-resize;');
      szNode.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const startX = e.clientX;
        const initialScale = dev.properties.scale || 1.0;

        const onMove = (moveEv: MouseEvent) => {
          const dx = moveEv.clientX - startX;
          let newScale = Math.max(0.5, Math.min(3.0, initialScale + (dx / 60)));
          if (snapToGrid) {
            newScale = Math.round(newScale * 4) / 4;
          }
          dev.properties.scale = newScale;
          renderPlacedDevices();
          selectDevice(dev.id);
        };
        const onUp = () => {
          saveCurrentDesign(true);
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
      g.appendChild(szNode);
    }

    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', '0');
    bgCircle.setAttribute('cy', '0');
    bgCircle.setAttribute('r', '20');
    bgCircle.setAttribute('fill', 'var(--bg-secondary)');
    bgCircle.setAttribute('stroke', dev.state ? accentColor : '#8e95b2');
    bgCircle.setAttribute('stroke-width', isSelected ? '3' : '2');
    g.appendChild(bgCircle);

    const iconG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    iconG.setAttribute('transform', 'translate(-12, -12)');
    iconG.setAttribute('stroke', dev.state ? accentColor : '#8e95b2');
    iconG.setAttribute('fill', 'none');
    iconG.innerHTML = ICON_SVG[dev.type];

    if (dev.type === 'light' && dev.state && dev.properties.color) {
      const path = iconG.querySelector('path');
      if (path) {
        path.setAttribute('fill', dev.properties.color);
        path.setAttribute('opacity', '0.45');
      }
    }

    g.appendChild(iconG);

    // Text label with background for readability
    const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    textBg.setAttribute('x', '-45');
    textBg.setAttribute('y', '22');
    textBg.setAttribute('width', '90');
    textBg.setAttribute('height', '14');
    textBg.setAttribute('rx', '4');
    textBg.setAttribute('fill', 'var(--bg-primary)');
    textBg.setAttribute('opacity', '0.85');
    g.appendChild(textBg);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', '32');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'var(--text-primary)');
    text.setAttribute('font-size', '10px');
    text.setAttribute('font-family', "'Inter', sans-serif");
    text.setAttribute('font-weight', '500');
    text.textContent = dev.name;
    g.appendChild(text);

    // Double-click renaming (Phase 4 double click)
    g.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const newName = prompt(`Enter a new label for "${dev.name}":`, dev.name);
      if (newName !== null) {
        pushHistory();
        dev.name = newName.trim() || dev.name;
        renderPlacedDevices();
        selectDevice(dev.id);
        saveCurrentDesign(true);
        showToast(`Renamed device to "${dev.name}"`, 'success');
      }
    });

    g.addEventListener('mousedown', (e) => {
      e.stopPropagation();

      if (currentDrawMode === 'erase') {
        showCustomConfirm(`Delete device "${dev.name}"?`).then(ok => {
          if (ok) {
            pushHistory();
            placedDevices = placedDevices.filter(d => d.id !== dev.id);
            if (selectedDeviceId === dev.id) {
              selectedDeviceId = null;
              hidePropertiesPanel();
            }
            renderPlacedDevices();
            updateAnalytics();
            saveCurrentDesign(true);
            logAction(`Delete Device: ${dev.name}`);
            showToast(`Device "${dev.name}" deleted`, 'info');
          }
        });
        return;
      }

      // Multi-selection management with shift key
      if (e.shiftKey) {
        if (selectedDeviceIds.has(dev.id)) {
          selectedDeviceIds.delete(dev.id);
        } else {
          selectedDeviceIds.add(dev.id);
        }
        if (selectedDeviceIds.size > 0) {
          selectedDeviceId = Array.from(selectedDeviceIds)[0];
          selectDevice(selectedDeviceId);
        } else {
          selectedDeviceId = null;
          hidePropertiesPanel();
        }
      } else {
        selectedDeviceIds.clear();
        selectedDeviceIds.add(dev.id);
        selectDevice(dev.id);
      }

      pushHistory();
      draggedElementId = dev.id;

      const pt = cadCanvas.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(cadCanvas.getScreenCTM()!.inverse());

      dragOffsetX = svgP.x - dev.x;
      dragOffsetY = svgP.y - dev.y;
    });

    placedDevicesGroup.appendChild(g);
  });

  // Render caliper ruler measurements (Phase 5 caliper tools)
  let rulerG = document.getElementById('ruler-group') as any;
  if (!rulerG) {
    rulerG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    rulerG.setAttribute('id', 'ruler-group');
    cadCanvas.appendChild(rulerG);
  }
  rulerG.innerHTML = '';
  if (measurePoints.length > 0) {
    measurePoints.forEach((p, idx) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', p.x.toString());
      circle.setAttribute('cy', p.y.toString());
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', '#9061f9');
      rulerG!.appendChild(circle);

      const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lbl.setAttribute('x', p.x.toString());
      lbl.setAttribute('y', (p.y - 12).toString());
      lbl.setAttribute('class', 'ruler-text');
      lbl.textContent = `Point ${idx + 1}`;
      rulerG!.appendChild(lbl);
    });
    if (measurePoints.length === 2) {
      const p1 = measurePoints[0];
      const p2 = measurePoints[1];
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', p1.x.toString());
      line.setAttribute('y1', p1.y.toString());
      line.setAttribute('x2', p2.x.toString());
      line.setAttribute('y2', p2.y.toString());
      line.setAttribute('class', 'ruler-line');
      rulerG.appendChild(line);

      const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      const meters = dist * 0.01;
      const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lbl.setAttribute('x', ((p1.x + p2.x) / 2).toString());
      lbl.setAttribute('y', (((p1.y + p2.y) / 2) - 8).toString());
      lbl.setAttribute('class', 'ruler-text');
      lbl.textContent = `${meters.toFixed(2)} m`;
      rulerG.appendChild(lbl);
    }
  }
}

// --- WALL RENDERING ---

function renderWalls() {
  const wallsGroup = document.getElementById('walls-group');
  if (!wallsGroup) return;
  wallsGroup.innerHTML = '';

  placedWalls.forEach(wall => {
    const isSelected = wall.id === selectedWallId;

    // Wall line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', wall.x1.toString());
    line.setAttribute('y1', wall.y1.toString());
    line.setAttribute('x2', wall.x2.toString());
    line.setAttribute('y2', wall.y2.toString());
    line.setAttribute('stroke', isSelected ? '#f97316' : '#374151');
    line.setAttribute('stroke-width', (wall.thickness || 3).toString());
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('class', `wall-segment${isSelected ? ' selected' : ''}`);
    line.setAttribute('id', `wall-${wall.id}`);

    // Hit area (wider invisible line for easier clicking)
    const hitLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hitLine.setAttribute('x1', wall.x1.toString());
    hitLine.setAttribute('y1', wall.y1.toString());
    hitLine.setAttribute('x2', wall.x2.toString());
    hitLine.setAttribute('y2', wall.y2.toString());
    hitLine.setAttribute('stroke', 'transparent');
    hitLine.setAttribute('stroke-width', '12');
    hitLine.setAttribute('style', 'cursor: pointer;');

    // Length label
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const length = Math.round(Math.sqrt(dx * dx + dy * dy) / 40 * 100) / 100; // in meters (40px = 1m)
    const midX = (wall.x1 + wall.x2) / 2;
    const midY = (wall.y1 + wall.y2) / 2;

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', midX.toString());
    label.setAttribute('y', (midY - 8).toString());
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#6b7280');
    label.setAttribute('font-size', '9');
    label.setAttribute('font-family', "'Inter', sans-serif");
    label.setAttribute('pointer-events', 'none');
    label.textContent = `${length}m`;

    const wallG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    wallG.appendChild(line);
    wallG.appendChild(hitLine);
    wallG.appendChild(label);

    // Click to select wall
    hitLine.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentDrawMode === 'erase') {
        showCustomConfirm(`Delete this wall segment?`).then(ok => {
          if (ok) {
            pushHistory();
            placedWalls = placedWalls.filter(w => w.id !== wall.id);
            renderWalls();
            logAction(`Delete Wall`);
            showToast('Wall deleted', 'info');
            saveCurrentDesign(true);
          }
        });
        return;
      }
      selectedWallId = wall.id;
      selectedDeviceId = null;
      selectedRoomId = null;
      renderWalls();
    });

    wallsGroup.appendChild(wallG);
  });
}

// --- ROOM RENDERING ---

const ROOM_COLORS: Record<string, string> = {
  living: 'rgba(139,92,246,0.12)',
  kitchen: 'rgba(249,115,22,0.12)',
  bedroom: 'rgba(59,130,246,0.12)',
  bathroom: 'rgba(16,185,129,0.12)',
  garage: 'rgba(107,114,128,0.12)',
  office: 'rgba(245,158,11,0.12)',
  hallway: 'rgba(236,72,153,0.12)',
  balcony: 'rgba(34,197,94,0.12)',
  study: 'rgba(14,165,233,0.12)',
  gym: 'rgba(239,68,68,0.12)',
};

const ROOM_STROKE: Record<string, string> = {
  living: '#8b5cf6',
  kitchen: '#f97316',
  bedroom: '#3b82f6',
  bathroom: '#10b981',
  garage: '#6b7280',
  office: '#f59e0b',
  hallway: '#ec4899',
  balcony: '#22c55e',
  study: '#0ea5e9',
  gym: '#ef4444',
};

function renderRooms() {
  const roomsGroup = document.getElementById('rooms-group');
  if (!roomsGroup) return;
  roomsGroup.innerHTML = '';

  placedRooms.forEach(room => {
    const isSelected = room.id === selectedRoomId;
    const fillColor = ROOM_COLORS[room.type] || 'rgba(92,42,143,0.10)';
    const strokeColor = ROOM_STROKE[room.type] || '#5c2a8f';

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `room-rect-el${isSelected ? ' selected' : ''}`);
    g.setAttribute('id', `room-${room.id}`);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', room.x.toString());
    rect.setAttribute('y', room.y.toString());
    rect.setAttribute('width', room.width.toString());
    rect.setAttribute('height', room.height.toString());
    rect.setAttribute('fill', fillColor);
    rect.setAttribute('stroke', isSelected ? '#f97316' : strokeColor);
    rect.setAttribute('stroke-width', isSelected ? '3' : '2');
    rect.setAttribute('rx', '4');

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', (room.x + room.width / 2).toString());
    label.setAttribute('y', (room.y + 20).toString());
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', strokeColor);
    label.setAttribute('font-size', '12');
    label.setAttribute('font-weight', '700');
    label.setAttribute('font-family', "'Inter', sans-serif");
    label.setAttribute('pointer-events', 'none');
    label.textContent = `${room.emoji} ${room.name}`;

    // Area label
    const areaM2 = ((room.width / 40) * (room.height / 40)).toFixed(1);
    const areaLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    areaLabel.setAttribute('x', (room.x + room.width / 2).toString());
    areaLabel.setAttribute('y', (room.y + 36).toString());
    areaLabel.setAttribute('text-anchor', 'middle');
    areaLabel.setAttribute('fill', '#6b7280');
    areaLabel.setAttribute('font-size', '9');
    areaLabel.setAttribute('font-family', "'Inter', sans-serif");
    areaLabel.setAttribute('pointer-events', 'none');
    areaLabel.textContent = `${areaM2} mÂ²`;

    g.appendChild(rect);
    g.appendChild(label);
    g.appendChild(areaLabel);

    // Click to select room
    rect.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentDrawMode === 'erase') {
        showCustomConfirm(`Delete room "${room.name}"?`).then(ok => {
          if (ok) {
            pushHistory();
            placedRooms = placedRooms.filter(r => r.id !== room.id);
            renderRooms();
            logAction(`Delete Room: ${room.name}`);
            showToast(`Room "${room.name}" deleted`, 'info');
            saveCurrentDesign(true);
          }
        });
        return;
      }
      selectedRoomId = room.id;
      selectedWallId = null;
      renderRooms();
    });

    // Double-click to rename room
    rect.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const newName = prompt(`Rename room "${room.name}":`, room.name);
      if (newName && newName.trim()) {
        pushHistory();
        room.name = newName.trim();
        renderRooms();
        logAction(`Rename Room to ${room.name}`);
        saveCurrentDesign(true);
      }
    });

    // Drag to move room
    rect.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (currentDrawMode !== 'select') return;
      const pt = cadCanvas.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const svgP = pt.matrixTransform(cadCanvas.getScreenCTM()!.inverse());
      const startX = svgP.x - room.x;
      const startY = svgP.y - room.y;
      selectedRoomId = room.id;
      renderRooms();

      const onMove = (mv: MouseEvent) => {
        const mp = cadCanvas.createSVGPoint();
        mp.x = mv.clientX; mp.y = mv.clientY;
        const sp = mp.matrixTransform(cadCanvas.getScreenCTM()!.inverse());
        room.x = snapToGrid ? Math.round((sp.x - startX) / GRID_SNAP_VAL) * GRID_SNAP_VAL : sp.x - startX;
        room.y = snapToGrid ? Math.round((sp.y - startY) / GRID_SNAP_VAL) * GRID_SNAP_VAL : sp.y - startY;
        renderRooms();
      };
      const onUp = () => {
        pushHistory();
        logAction(`Move Room: ${room.name}`);
        saveCurrentDesign(true);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    roomsGroup.appendChild(g);
  });
}

// --- MOUSE DRAGGING EVENTS (Original) ---


function handleDragMove(e: MouseEvent) {
  if (draggedElementId) {
    const dev = placedDevices.find(d => d.id === draggedElementId);
    if (dev) {
      const pt = cadCanvas.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(cadCanvas.getScreenCTM()!.inverse());

      let newX = svgP.x - dragOffsetX;
      let newY = svgP.y - dragOffsetY;

      // snap logic
      if (snapToGrid) {
        newX = Math.round(newX / GRID_SNAP_VAL) * GRID_SNAP_VAL;
        newY = Math.round(newY / GRID_SNAP_VAL) * GRID_SNAP_VAL;
      }

      // Collision avoidance snap sliding (Phase 4 collision detection)
      placedDevices.forEach(other => {
        if (other.id !== dev.id && other.groupId !== dev.groupId) {
          const dist = Math.sqrt((other.x - newX) ** 2 + (other.y - newY) ** 2);
          if (dist < 40) {
            const angle = Math.atan2(newY - other.y, newX - other.x);
            newX = other.x + Math.cos(angle) * 40;
            newY = other.y + Math.sin(angle) * 40;
          }
        }
      });

      const dx = Math.max(20, Math.min(780, newX)) - dev.x;
      const dy = Math.max(20, Math.min(480, newY)) - dev.y;

      if (dx === 0 && dy === 0) return;

      // Group drag translations
      if (dev.groupId) {
        placedDevices.forEach(other => {
          if (other.groupId === dev.groupId) {
            other.x = Math.max(20, Math.min(780, other.x + dx));
            other.y = Math.max(20, Math.min(480, other.y + dy));
            const nodeG = document.getElementById(`node-${other.id}`);
            if (nodeG) {
              const otherScale = other.properties.scale || 1.0;
              nodeG.setAttribute('transform', `translate(${other.x}, ${other.y}) rotate(${other.rotation || 0}) scale(${otherScale})`);
            }
          }
        });
      } else {
        dev.x += dx;
        dev.y += dy;
        const nodeG = document.getElementById(`node-${dev.id}`);
        if (nodeG) {
          const sc = dev.properties.scale || 1.0;
          nodeG.setAttribute('transform', `translate(${dev.x}, ${dev.y}) rotate(${dev.rotation || 0}) scale(${sc})`);
        }
      }
      selectDevice(dev.id, true); // Update properties coordinates continuously without full re-render
    }
  }
}

async function handleDragEnd() {
  if (draggedElementId) {
    draggedElementId = null;
    renderPlacedDevices();
    updateMiniMap();
    await saveCurrentDesign();
  }
}

// --- PROPERTIES EDITOR (Original) ---

function selectDevice(id: string, skipRender: boolean = false) {
  try {
    selectedDeviceId = id;
    const dev = placedDevices.find(d => d.id === id);
    if (!dev) return;

    if (!dev.properties) {
      dev.properties = {};
    }

    noDeviceSelected.classList.add('hidden');
    deviceEditor.classList.remove('hidden');

    const devTypeStr = dev.type || 'device';
    editorDeviceType.textContent = devTypeStr.charAt(0).toUpperCase() + devTypeStr.slice(1);
    propName.value = dev.name || '';
    propRoom.value = dev.room || 'Living Room';
    propState.checked = !!dev.state;

    // Dynamic specifications updates (Phase 6 additions)
    const activeItem = SMART_CATALOG_DB.find(item => item.name === dev.name) || { category: dev.type || 'unknown', powerUsage: dev.powerUsage || 10 };
    const valCat = document.getElementById('prop-val-category');
    const catStr = activeItem.category || dev.type || 'unknown';
    if (valCat) valCat.textContent = catStr.charAt(0).toUpperCase() + catStr.slice(1);

    const valMfg = document.getElementById('prop-val-mfg');
    if (valMfg) valMfg.textContent = 'CADNOVA Labs';

    const valPower = document.getElementById('prop-val-power');
    if (valPower) valPower.textContent = `${dev.powerUsage || activeItem.powerUsage || 10} W`;

    const valSignal = document.getElementById('prop-val-signal');
    if (valSignal) {
      if ((window as any).esp32Connected) {
        valSignal.textContent = (window as any).lastRssi ? `${(window as any).lastRssi} dBm` : '-62 dBm';
      } else {
        valSignal.textContent = 'â€”';
      }
    }

    const valBattery = document.getElementById('prop-val-battery');
    if (valBattery) valBattery.textContent = dev.type === 'sensor' || dev.type === 'lock' ? '88% (Normal)' : 'A/C Power';

    const valFirmware = document.getElementById('prop-val-firmware');
    if (valFirmware) valFirmware.textContent = 'v1.4.2';

    const valCoords = document.getElementById('prop-val-coords');
    if (valCoords) valCoords.textContent = `${Math.round(dev.x || 0)}, ${Math.round(dev.y || 0)}`;

    const valScale = document.getElementById('prop-val-scale');
    if (valScale) valScale.textContent = `${(dev.properties?.scale || 1.0).toFixed(1)}x`;

    const esp32Container = document.getElementById('esp32-status-container');
    if (esp32Container) {
      if (dev.name === 'Smart Dimmer Wall Switch') {
        esp32Container.classList.remove('hidden');
      } else {
        esp32Container.classList.add('hidden');
      }
    }

    // Show/hide LED indicator row and sync with current device state
    const ledIndicatorRow = document.getElementById('led-indicator-row');
    if (ledIndicatorRow) {
      if (dev.name === 'Smart Dimmer Wall Switch') {
        ledIndicatorRow.classList.remove('hidden');
        updateLedIndicator(dev.state, dev.name);
      } else {
        ledIndicatorRow.classList.add('hidden');
      }
    }

    if (!skipRender) {
      renderPlacedDevices();
    }

    ctrlLight.classList.add('hidden');
    ctrlThermostat.classList.add('hidden');
    ctrlCamera.classList.add('hidden');
    ctrlSpeaker.classList.add('hidden');
    ctrlSensor.classList.add('hidden');
    ctrlMotion.classList.add('hidden');
    ctrlLock.classList.add('hidden');

    if (dev.type === 'light') {
      ctrlLight.classList.remove('hidden');
      propBrightness.value = (dev.properties?.brightness || 80).toString();
      valBrightness.textContent = `${propBrightness.value}%`;
      propColor.value = dev.properties?.color || '#ffbe3b';
      const isOn = !!dev.state;
      btnLightToggle.textContent = isOn ? 'ðŸ’¡ Turn Off' : 'ðŸ’¡ Turn On';
      btnLightToggle.className = isOn ? 'btn btn-light-on' : 'btn btn-primary';
    } else if (dev.type === 'thermostat') {
      ctrlThermostat.classList.remove('hidden');
      propTemp.value = (dev.properties?.temperature || 22.0).toString();
      valTemp.textContent = `${propTemp.value}Â°C`;
    } else if (dev.type === 'camera') {
      ctrlCamera.classList.remove('hidden');
      const camLabel = document.getElementById('cam-stream-label');
      if (camLabel) camLabel.textContent = (dev.name || 'CAMERA').replace(/\s/g, '_').toUpperCase();
    } else if (dev.type === 'speaker') {
      ctrlSpeaker.classList.remove('hidden');
      propVolume.value = (dev.properties?.volume || 50).toString();
      valVolume.textContent = `${propVolume.value}%`;
      propTrack.value = dev.properties?.track || 'Ambient Chillout Mix';
    } else if (dev.type === 'sensor') {
      ctrlSensor.classList.remove('hidden');
      currentSensorDeviceId = dev.id;
      if (!sensorIntervals.has(dev.id)) setupSensorSimulation(dev.id);
      const readings = sensorReadings.get(dev.id) || [];
      if (readings.length > 0) {
        liveTempDisplay.textContent = `${readings[readings.length - 1].toFixed(1)}Â°C`;
        const h = 45 + Math.random() * 10;
        liveHumidityDisplay.textContent = `${h.toFixed(0)}%`;
      }
      updateSparkline(dev.id);
    } else if (dev.type === 'motion') {
      ctrlMotion.classList.remove('hidden');
      if (!motionIntervals.has(dev.id)) setupMotionSimulation(dev.id);
      const count = motionEventCounts.get(dev.id) || 0;
      motionEventCount.textContent = count.toString();
    } else if (dev.type === 'lock') {
      ctrlLock.classList.remove('hidden');
      currentPinInput = '';
      updatePinDisplay();
      const isLocked = lockStates.get(dev.id) !== false;
      updateLockUI(dev.id, isLocked);
      const remaining = 3 - (lockAttempts.get(dev.id) || 0);
      lockAttemptsLeft.textContent = `${remaining} attempt${remaining !== 1 ? 's' : ''} left`;
    }
  } catch (err) {
    console.error('Error selecting device:', err);
    showToast('Error updating property panel. Check console.', 'error');
  }
}

function hidePropertiesPanel() {
  noDeviceSelected.classList.remove('hidden');
  deviceEditor.classList.add('hidden');
}

// --- DYNAMIC ANALYTICS CALCULATIONS (Original) ---

function updateAnalytics() {
  const activeCount = placedDevices.filter(d => d.state).length;
  metricActiveCount.textContent = activeCount.toString();

  let totalWatts = 0;
  placedDevices.forEach(d => {
    if (d.state) {
      if (d.type === 'light') {
        const brightness = d.properties?.brightness ?? 80;
        totalWatts += Math.round((brightness / 100) * 12);
      } else if (d.type === 'thermostat') {
        totalWatts += 6;
      } else if (d.type === 'camera') {
        totalWatts += 8;
      } else if (d.type === 'speaker') {
        const volume = d.properties?.volume ?? 50;
        totalWatts += Math.round(5 + (volume / 100) * 25);
      } else if (d.type === 'lock') {
        totalWatts += 2;
      } else if (d.type === 'plug') {
        totalWatts += 15;
      } else if (d.type === 'sensor') {
        totalWatts += 1;
      } else if (d.type === 'motion') {
        totalWatts += 0.5;
      }
    } else {
      totalWatts += 0.5;
    }
  });

  metricPowerUsage.textContent = `${totalWatts} W`;

  if (placedDevices.length === 0) {
    metricIotStrength.textContent = '0%';
  } else {
    const coverage = Math.min(100, Math.round(40 + (activeCount * 10)));
    metricIotStrength.textContent = `${coverage}%`;
  }

  if (secMetricCameras) secMetricCameras.textContent = placedDevices.filter(d => d.type === 'camera').length.toString();
  if (secMetricLocks) secMetricLocks.textContent = placedDevices.filter(d => d.type === 'lock').length.toString();
  if (secMetricSensors) secMetricSensors.textContent = (placedDevices.filter(d => d.type === 'sensor').length + placedDevices.filter(d => d.type === 'motion').length).toString();
  if (secMetricAlerts) secMetricAlerts.textContent = totalAlertCount.toString();
}

// --- DATABASE OPERATIONS (Modified for backwards-compatible geometry maps) ---

async function fetchSavedDesigns() {
  try {
    const res = await fetch(`${API_BASE}/designs`);
    if (!res.ok) throw new Error('API request failed');
    const list: DesignMetadata[] = await res.json();

    savedDesignsList.innerHTML = '';

    if (list.length === 0) {
      savedDesignsList.innerHTML = `<div class="empty-placeholder">No saved designs found</div>`;
      return;
    }

    list.forEach(item => {
      const row = document.createElement('div');
      row.className = 'design-item-row';

      const left = document.createElement('div');
      left.className = 'design-item-left';

      const name = document.createElement('span');
      name.className = 'design-item-name';
      name.textContent = item.name;

      const dateStr = item.updated_at ? new Date(item.updated_at).toLocaleString() : 'N/A';
      const date = document.createElement('span');
      date.className = 'design-item-date';
      date.textContent = dateStr;

      left.appendChild(name);
      left.appendChild(date);

      left.addEventListener('click', () => {
        loadSavedDesign(item.id);
        switchView('workspace');
      });

      const btnDel = document.createElement('button');
      btnDel.className = 'btn-delete-design';
      btnDel.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSavedDesign(item.id);
      });

      row.appendChild(left);
      row.appendChild(btnDel);
      savedDesignsList.appendChild(row);
    });
  } catch (error) {
    console.error('Failed to load database entries:', error);
    savedDesignsList.innerHTML = `<div class="empty-placeholder" style="color:var(--red-accent)">Error connecting to database</div>`;
  }
}

async function loadSavedDesign(id: string) {
  try {
    const res = await fetch(`${API_BASE}/designs/${id}`);
    if (!res.ok) throw new Error('API load request failed');
    const data = await res.json();

    currentDesignId = data.id;
    designNameInput.value = data.name;
    designDescInput.value = data.description || '';

    // Backwards-compatible load check
    if (data.geometry) {
      if (Array.isArray(data.geometry)) {
        placedDevices = data.geometry;
        placedShapes = [];
        placedWalls = [];
        placedRooms = [];
      } else {
        placedDevices = data.geometry.devices || [];
        placedShapes = data.geometry.shapes || [];
        placedWalls = data.geometry.walls || [];
        placedRooms = data.geometry.rooms || [];
      }
    } else {
      placedDevices = [];
      placedShapes = [];
      placedWalls = [];
      placedRooms = [];
    }

    selectedDeviceId = null;
    selectedShapeId = null;
    selectedWallId = null;
    selectedRoomId = null;

    renderPlacedDevices();
    renderPlaced3DShapes();
    renderWalls();
    renderRooms();
    hidePropertiesPanel();
    updateAnalytics();
    triggerAutoBOM();
    runSmartAnalysis();
    loadComments();
    loadVersions();

    showToast(`Loaded layout design: "${data.name}"`, 'success');
  } catch (error) {
    console.error('Failed to load layout:', error);
    showToast('Error loading selected design layout.', 'error');
  }
}

async function saveCurrentDesign(isAuto = false) {
  if (isAuto && !autoSaveEnabled) return;
  const name = designNameInput.value.trim() || 'My Smart Home';
  const desc = designDescInput.value.trim();

  // Combine both arrays into geometry payload
  const combinedGeometry = {
    devices: placedDevices,
    shapes: placedShapes,
    walls: placedWalls,
    rooms: placedRooms
  };

  const payload = {
    id: currentDesignId,
    name,
    description: desc,
    geometry: combinedGeometry
  };

  try {
    const res = await fetch(`${API_BASE}/designs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('API save request failed');

    showToast('Design layout saved successfully to database.', 'success');
    fetchSavedDesigns();
    loadDashboardProjects();
  } catch (error) {
    console.error('Failed to save layout:', error);
    showToast('Error saving layout to SQLite database.', 'error');
  }
}

async function deleteSavedDesign(id: string) {
  const confirmed = await showCustomConfirm('Permanently delete this design layout?');
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE}/designs/${id}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error('API delete request failed');

    if (currentDesignId === id) {
      currentDesignId = generateUUID();
      designNameInput.value = 'My Smart Home';
      designDescInput.value = '';
      placedDevices = [];
      placedShapes = [];
      selectedDeviceId = null;
      selectedShapeId = null;
      renderPlacedDevices();
      renderPlaced3DShapes();
      hidePropertiesPanel();
      updateAnalytics();
      triggerAutoBOM();
      runSmartAnalysis();
    }

    fetchSavedDesigns();
    loadDashboardProjects();
    showToast('Design layout deleted.', 'success');
  } catch (error) {
    console.error('Failed to delete design:', error);
    showToast('Error deleting design.', 'error');
  }
}

// --- ADVANCED FEATURES IMPLEMENTATION (Original) ---

function setupAdvancedFeatures() {
  btnDismissAlert.addEventListener('click', () => {
    intrusionBanner.classList.add('hidden');
  });

  securityArmToggle.addEventListener('change', () => {
    systemArmed = securityArmToggle.checked;
    if (systemArmed) {
      securityStatusBar.className = 'security-status armed';
      securityStatusIcon.textContent = '🔒';
      securityStatusLabel.textContent = 'System Armed — Monitoring Active';
      showToast('🔒 Security system armed. All sensors active.', 'info');
    } else {
      securityStatusBar.className = 'security-status disarmed';
      securityStatusIcon.textContent = '🔓';
      securityStatusLabel.textContent = 'System Disarmed';
      showToast('🔓 Security system disarmed.', 'info');
    }
  });

  
// IoT Enhancements
if (propColor) {
  propColor.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    updateColorPreview(val);
  });
}
if (propBrightness) {
  propBrightness.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    updateBrightnessSparkline(val);
  });
}
if (btnCloseNotifications) {
  btnCloseNotifications.addEventListener('click', () => {
    iotNotificationsDrawer.classList.add('hidden');
  });
}
if (btnClearIotLog) {
  btnClearIotLog.addEventListener('click', () => {
    if (iotActivityLogList) {
      iotActivityLogList.innerHTML = '<div class="no-events">No device activity recorded</div>';
    }
  });
}
document.querySelectorAll('.color-preset-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const color = (e.target as HTMLElement).getAttribute('data-color');
    if (color && propColor) {
      propColor.value = color;
      propColor.dispatchEvent(new Event('input')); // trigger preview update
      propColor.dispatchEvent(new Event('change')); // trigger backend update
    }
  });
});
if (esp32DeviceSelect) {
  esp32DeviceSelect.addEventListener('change', (e) => {
    const devId = (e.target as HTMLSelectElement).value;
    if (devId !== 'none' && (window as any).appWs && (window as any).appWs.readyState === WebSocket.OPEN) {
      logIotActivity('Device Selected', `Switched to ${devId}`);
    }
  });
}

btnLightToggle.addEventListener('click', () => {
    if (!selectedDeviceId) return;
    const dev = placedDevices.find(d => d.id === selectedDeviceId);
    if (dev && dev.type === 'light') {
      const newState = !dev.state;

      if (dev.name === 'Smart Dimmer Wall Switch') {
        // ACK-gated for real hardware
        if ((window as any).appWs && (window as any).appWs.readyState === WebSocket.OPEN) {
          console.log(newState ? 'Switch ON clicked' : 'Switch OFF clicked');
          console.log('Sending command to backend');
          // Send LED ON/OFF
          (window as any).appWs.send(JSON.stringify({
            device: 'esp32',
            pin: 2,
            state: newState
          }));
          // Also send current brightness when turning ON so PWM duty is applied immediately
          if (newState) {
            const bv = dev.properties?.brightness ?? 50;
            (window as any).appWs.send(JSON.stringify({ type: 'set_brightness', brightness: bv }));
          }
          btnLightToggle.disabled = true;
          btnLightToggle.textContent = '⏳ Waiting...';
          const aTimer = window.setTimeout(() => {
            btnLightToggle.disabled = false;
            btnLightToggle.textContent = dev.state ? '💡 Turn Off' : '💡 Turn On';
            showToast('⚠️ No response from ESP32 — command may not have executed.', 'error');
          }, 5000);
          (window as any)._pendingAckTimer = aTimer;
        } else {
          showToast('🔴 ESP32 is not connected.', 'error');
        }
      } else {
        // Non-dimmer: optimistic
        dev.state = newState;
        propState.checked = dev.state;
        btnLightToggle.textContent = dev.state ? 'ðŸ’¡ Turn Off' : 'ðŸ’¡ Turn On';
        btnLightToggle.className = dev.state ? 'btn btn-light-on' : 'btn btn-primary';
        renderPlacedDevices();
        updateAnalytics();
        updateLedIndicator(dev.state, dev.name);
        showToast(`Light ${dev.state ? 'turned ON âœ¨' : 'turned OFF'}`, dev.state ? 'success' : 'info');
        saveCurrentDesign().catch(e => console.error('DB save:', e));
      }
    }
  });

  document.querySelectorAll('.scene-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!selectedDeviceId) return;
      const dev = placedDevices.find(d => d.id === selectedDeviceId);
      if (!dev || dev.type !== 'light') return;
      const scene = btn.getAttribute('data-scene');
      document.querySelectorAll('.scene-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switch (scene) {
        case 'movie':
          dev.properties.brightness = 20;
          dev.properties.color = '#1a0033';
          break;
        case 'sleep':
          dev.properties.brightness = 5;
          dev.properties.color = '#ff4500';
          break;
        case 'reading':
          dev.properties.brightness = 90;
          dev.properties.color = '#fff8e1';
          break;
        case 'party':
          dev.properties.brightness = 100;
          dev.properties.color = '#ff00ff';
          break;
      }
      propBrightness.value = dev.properties.brightness!.toString();
      valBrightness.textContent = `${dev.properties.brightness}%`;
      propColor.value = dev.properties.color!;
      dev.state = true;
      propState.checked = true;
      renderPlacedDevices();
      updateAnalytics();
      saveCurrentDesign();
      showToast(`Scene: ${scene!.charAt(0).toUpperCase() + scene!.slice(1)} Mode activated ðŸŽ¨`, 'success');
    });
  });

  btnCameraStart.addEventListener('click', startCamera);
  btnCameraStop.addEventListener('click', stopCamera);
  btnCameraAi.addEventListener('click', toggleAI);

  document.querySelectorAll('.pin-btn[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentPinInput.length < 6) {
        currentPinInput += btn.getAttribute('data-digit')!;
        updatePinDisplay();
      }
    });
  });

  document.getElementById('btn-pin-clear')?.addEventListener('click', () => {
    currentPinInput = currentPinInput.slice(0, -1);
    updatePinDisplay();
  });

  document.getElementById('btn-pin-enter')?.addEventListener('click', () => {
    if (!selectedDeviceId) return;
    submitPIN(selectedDeviceId);
  });

  btnSetPin.addEventListener('click', () => {
    if (!selectedDeviceId) return;
    const newPin = newPinInput.value.trim();
    if (!/^\d{4}$/.test(newPin)) {
      showToast('PIN must be exactly 4 digits', 'error');
      return;
    }
    lockPins.set(selectedDeviceId, newPin);
    newPinInput.value = '';
    showToast('ðŸ”‘ PIN updated successfully!', 'success');
  });

  // Project duplicates & archive
  document.getElementById('btn-duplicate-design')?.addEventListener('click', async () => {
    const original = designNameInput.value;
    const newName = original + ' (Copy)';

    const combinedGeometry = { 
      devices: placedDevices, 
      shapes: placedShapes,
      walls: placedWalls,
      rooms: placedRooms
    };
    const payload = {
      id: generateUUID(),
      name: newName,
      description: designDescInput.value,
      geometry: combinedGeometry
    };

    try {
      const res = await fetch(`${API_BASE}/designs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast(`Workspace duplicated: "${newName}"`, 'success');
        fetchSavedDesigns();
        loadDashboardProjects();
      }
    } catch (err) {
      console.error(err);
    }
  });

  document.getElementById('btn-archive-design')?.addEventListener('click', () => {
    designDescInput.value += ' [ARCHIVED]';
    saveCurrentDesign();
    showToast('Project archived successfully', 'info');
  });

  // Manufacturing Exporters
  document.getElementById('btn-export-bom-pdf')?.addEventListener('click', () => {
    showToast('Generating BOM Report PDF. Check your downloads folder.', 'success');
  });

  document.getElementById('btn-export-mesh-stl')?.addEventListener('click', () => {
    showToast('Compiling 3D mesh faces... Exporting CAD Model to STL mesh.', 'success');
  });

  // 30s Autosave loop
  setInterval(() => {
    saveCurrentDesign(true);
  }, 30000);
}

function setupSensorSimulation(deviceId: string) {
  if (!sensorReadings.has(deviceId)) {
    const initial = Array.from({ length: 5 }, () => 20 + Math.random() * 6);
    sensorReadings.set(deviceId, initial);
  }

  const interval = window.setInterval(() => {
    const readings = sensorReadings.get(deviceId)!;
    const last = readings[readings.length - 1];
    const next = Math.max(16, Math.min(35, last + (Math.random() - 0.5)));
    readings.push(next);
    if (readings.length > 20) readings.shift();

    if (currentSensorDeviceId === deviceId) {
      liveTempDisplay.textContent = `${next.toFixed(1)}Â°C`;
      const humidity = 40 + Math.sin(Date.now() / 60000) * 10 + Math.random() * 5;
      liveHumidityDisplay.textContent = `${humidity.toFixed(0)}%`;
      updateSparkline(deviceId);
    }
  }, 2000);

  sensorIntervals.set(deviceId, interval);
}

function updateSparkline(deviceId: string) {
  const readings = sensorReadings.get(deviceId) || [];
  if (readings.length < 2 || !sparklinePath) return;

  const W = 200, H = 50, padding = 4;
  const min = Math.min(...readings) - 1;
  const max = Math.max(...readings) + 1;
  const range = max - min || 1;

  const points = readings.map((v, i) => ({
    x: padding + (i / (readings.length - 1)) * (W - padding * 2),
    y: H - padding - ((v - min) / range) * (H - padding * 2)
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  sparklinePath.setAttribute('d', linePath);

  const areaPath = linePath + ` L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`;
  sparklineArea?.setAttribute('d', areaPath);
}

function setupMotionSimulation(deviceId: string) {
  if (!motionEventCounts.has(deviceId)) motionEventCounts.set(deviceId, 0);

  const interval = window.setInterval(() => {
    const dev = placedDevices.find(d => d.id === deviceId);
    if (!dev || !dev.state) return;

    if (Math.random() < 0.15) {
      triggerMotionEvent(deviceId, dev.room);
    }
  }, 8000);

  motionIntervals.set(deviceId, interval);
}

function triggerMotionEvent(deviceId: string, room: string) {
  const dev = placedDevices.find(d => d.id === deviceId);
  if (!dev) return;

  const count = (motionEventCounts.get(deviceId) || 0) + 1;
  motionEventCounts.set(deviceId, count);
  totalAlertCount++;

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (selectedDeviceId === deviceId) {
    motionStatusDisplay.className = 'motion-status-card active';
    motionStatusText.textContent = `âš ï¸ Motion Detected!`;
    motionLastTime.textContent = `Last: ${timeStr}`;
    motionEventCount.textContent = count.toString();

    addEventLogEntry(motionEventLog, 'Motion', room, timeStr);

    setTimeout(() => {
      motionStatusDisplay.className = 'motion-status-card inactive';
      motionStatusText.textContent = 'No Motion Detected';
    }, 3000);
  }

  addEventLogEntry(globalAlertLog, 'Motion', room, timeStr);

  if (systemArmed) {
    intrusionAlertMessage.textContent = `âš ï¸ MOTION DETECTED â€” ${room} at ${timeStr}`;
    intrusionBanner.classList.remove('hidden');
    showToast(`ðŸš¨ Motion alert in ${room}!`, 'error');
  } else {
    showToast(`ðŸ‘ï¸ Motion detected in ${room}`, 'info');
  }

  updateAnalytics();
  updateAlertBadge();
}

function addEventLogEntry(container: HTMLDivElement, type: string, location: string, time: string) {
  const placeholder = container.querySelector('.no-events');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('div');
  entry.className = 'event-log-entry';
  entry.innerHTML = `<span class="event-type">${type}</span><span>${location}</span><span class="event-time">${time}</span>`;

  container.insertBefore(entry, container.firstChild);

  while (container.children.length > 10) {
    container.removeChild(container.lastChild!);
  }
}

function updateAlertBadge() {
  if (totalAlertCount > 0) {
    alertBadge.textContent = `${totalAlertCount} Alert${totalAlertCount > 1 ? 's' : ''}`;
    alertBadge.classList.remove('hidden');
  } else {
    alertBadge.classList.add('hidden');
  }
}

function updatePinDisplay() {
  if (!pinDisplayDots) return;
  const filled = 'â—'.repeat(currentPinInput.length);
  const empty = '_'.repeat(Math.max(0, 4 - currentPinInput.length));
  pinDisplayDots.textContent = (filled + ' ' + empty).trim() || '_ _ _ _';
}

function submitPIN(deviceId: string) {
  const correctPin = lockPins.get(deviceId) || DEFAULT_PIN;
  const attempts = lockAttempts.get(deviceId) || 0;

  if (attempts >= 3) {
    showToast('ðŸ”´ Device locked! Too many failed attempts.', 'error');
    currentPinInput = '';
    updatePinDisplay();
    return;
  }

  if (currentPinInput === correctPin) {
    const isCurrentlyLocked = lockStates.get(deviceId) !== false;
    const newState = !isCurrentlyLocked;
    lockStates.set(deviceId, newState);
    lockAttempts.set(deviceId, 0);
    currentPinInput = '';
    updatePinDisplay();
    updateLockUI(deviceId, newState);
    lockAttemptsLeft.textContent = '3 attempts left';
    showToast(newState ? 'ðŸ”’ Door Locked' : 'ðŸ”“ Door Unlocked â€” Access Granted', newState ? 'info' : 'success');
    saveCurrentDesign();
  } else {
    const newAttempts = attempts + 1;
    lockAttempts.set(deviceId, newAttempts);
    currentPinInput = '';
    updatePinDisplay();
    const remaining = 3 - newAttempts;
    lockAttemptsLeft.textContent = `${remaining} attempt${remaining !== 1 ? 's' : ''} left`;

    if (newAttempts >= 3) {
      updateLockUI(deviceId, true, true);
      triggerIntrusionAlert('PIN Brute-Force', placedDevices.find(d => d.id === deviceId)?.room || 'Unknown');
      showToast('ðŸš¨ LOCKOUT! Wrong PIN entered 3 times â€” Security Alert!', 'error');
    } else {
      lockStatusDisplay.classList.add('locked');
      lockIconDisplay.style.transform = 'rotate(5deg)';
      setTimeout(() => { lockIconDisplay.style.transform = 'rotate(0deg)'; }, 300);
      showToast(`âŒ Wrong PIN â€” ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining`, 'error');
    }
  }
}

function updateLockUI(_deviceId: string, isLocked: boolean, isLockout: boolean = false) {
  if (isLockout) {
    lockStatusDisplay.className = 'lock-status-card lockout';
    lockIconDisplay.textContent = 'ðŸš«';
    lockStateLabel.textContent = 'LOCKOUT â€” ALERT';
    return;
  }
  lockStatusDisplay.className = `lock-status-card ${isLocked ? 'locked' : 'unlocked'}`;
  lockIconDisplay.textContent = isLocked ? 'ðŸ”’' : 'ðŸ”“';
  lockStateLabel.textContent = isLocked ? 'LOCKED' : 'UNLOCKED';
}

function triggerIntrusionAlert(type: string, room: string) {
  totalAlertCount++;
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  intrusionAlertMessage.textContent = `ðŸš¨ ${type.toUpperCase()} â€” ${room} at ${timeStr}`;
  intrusionBanner.classList.remove('hidden');
  addEventLogEntry(globalAlertLog, type, room, timeStr);
  updateAlertBadge();
  updateAnalytics();
}

async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    cameraVideo.srcObject = cameraStream;
    camNoSignal.style.display = 'none';
    btnCameraStart.disabled = true;
    btnCameraAi.disabled = false;
    btnCameraStop.disabled = false;
    const recDot = document.getElementById('cam-rec-dot');
    if (recDot) recDot.classList.add('active');
    showToast('ðŸ“· Camera stream started!', 'success');

    cameraVideo.addEventListener('loadedmetadata', () => {
      cameraCanvasOverlay.width = cameraVideo.videoWidth || 320;
      cameraCanvasOverlay.height = cameraVideo.videoHeight || 240;
    });
  } catch (err) {
    showToast('âš ï¸ Camera access denied. Showing simulated feed.', 'info');
    camNoSignal.style.display = 'flex';
    camNoSignal.querySelector('span:last-child')!.textContent = 'ðŸ“¡ Simulated CCTV Feed';
    btnCameraAi.disabled = false;
    btnCameraStop.disabled = false;
    startSimulatedDetection();
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  if (aiAnimFrame) { cancelAnimationFrame(aiAnimFrame); aiAnimFrame = null; }
  aiEnabled = false;
  cameraVideo.srcObject = null;
  camNoSignal.style.display = 'flex';
  camNoSignal.querySelector('span:last-child')!.textContent = 'No Signal â€” Click Start';
  camAiBadge.textContent = 'AI: OFF';
  camAiBadge.className = 'ai-badge';
  btnCameraStart.disabled = false;
  btnCameraAi.disabled = true;
  btnCameraStop.disabled = true;
  const ctx = cameraCanvasOverlay.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, cameraCanvasOverlay.width, cameraCanvasOverlay.height);
  aiDetectionsList.innerHTML = '<span class="detections-empty">Start stream to enable AI detection</span>';
  showToast('ðŸ“· Camera stopped.', 'info');
}

async function toggleAI() {
  if (aiEnabled) {
    aiEnabled = false;
    if (aiAnimFrame) { cancelAnimationFrame(aiAnimFrame); aiAnimFrame = null; }
    camAiBadge.textContent = 'AI: OFF';
    camAiBadge.className = 'ai-badge';
    const ctx = cameraCanvasOverlay.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, cameraCanvasOverlay.width, cameraCanvasOverlay.height);
    aiDetectionsList.innerHTML = '<span class="detections-empty">AI detection paused</span>';
    btnCameraAi.textContent = 'ðŸ§  AI';
    return;
  }

  camAiBadge.textContent = 'AI: Loadingâ€¦';
  aiDetectionsList.innerHTML = '<span class="detections-empty">Loading AI modelâ€¦</span>';
  btnCameraAi.disabled = true;

  try {
    if (!aiModel && (window as any).cocoSsd) {
      aiModel = await (window as any).cocoSsd.load();
    }
    aiEnabled = true;
    camAiBadge.textContent = 'AI: ON â—';
    camAiBadge.className = 'ai-badge active';
    btnCameraAi.textContent = 'ðŸ§  Disable AI';
    btnCameraAi.disabled = false;
    if (cameraStream) {
      runAIDetection();
    } else {
      startSimulatedDetection();
    }
    showToast('ðŸ§  AI object detection enabled!', 'success');
  } catch (err) {
    camAiBadge.textContent = 'AI: Error';
    aiDetectionsList.innerHTML = '<span class="detections-empty" style="color:#e03131">Failed to load AI model</span>';
    btnCameraAi.disabled = false;
    startSimulatedDetection();
  }
}

function runAIDetection() {
  if (!aiEnabled || !aiModel) return;
  if (!cameraVideo.videoWidth) {
    aiAnimFrame = requestAnimationFrame(runAIDetection);
    return;
  }

  aiModel.detect(cameraVideo).then((predictions: any[]) => {
    drawBoundingBoxes(predictions);
    updateDetectionTags(predictions);
    if (aiEnabled) aiAnimFrame = requestAnimationFrame(runAIDetection);
  });
}

function drawBoundingBoxes(predictions: any[]) {
  const ctx = cameraCanvasOverlay.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, cameraCanvasOverlay.width, cameraCanvasOverlay.height);

  const scaleX = cameraCanvasOverlay.width / (cameraVideo.videoWidth || 320);
  const scaleY = cameraCanvasOverlay.height / (cameraVideo.videoHeight || 240);

  predictions.forEach(pred => {
    const [x, y, w, h] = pred.bbox;
    const score = Math.round(pred.score * 100);
    ctx.strokeStyle = '#2b8a3e';
    ctx.lineWidth = 2;
    ctx.strokeRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);
    ctx.fillStyle = 'rgba(43, 138, 62, 0.8)';
    ctx.fillRect(x * scaleX, y * scaleY - 20, w * scaleX, 20);
    ctx.fillStyle = '#fff';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(`${pred.class} ${score}%`, x * scaleX + 4, y * scaleY - 5);
  });
}

function updateDetectionTags(predictions: any[]) {
  if (predictions.length === 0) {
    aiDetectionsList.innerHTML = '<span class="detections-empty">No objects detected</span>';
    return;
  }
  aiDetectionsList.innerHTML = predictions.map(p =>
    `<span class="detection-tag">${p.class} (${Math.round(p.score * 100)}%)</span>`
  ).join('');
}

function startSimulatedDetection() {
  const objects = ['person', 'cell phone', 'laptop', 'car', 'dog', 'cat', 'backpack', 'chair'];
  let tick = 0;
  const interval = setInterval(() => {
    if (!aiEnabled) { clearInterval(interval); return; }
    tick++;
    const detected = objects.filter(() => Math.random() > 0.7).slice(0, 3);
    if (detected.length > 0) {
      aiDetectionsList.innerHTML = detected.map(o =>
        `<span class="detection-tag">${o} (${60 + Math.floor(Math.random() * 35)}%)</span>`
      ).join('');
    } else {
      aiDetectionsList.innerHTML = '<span class="detections-empty">Scanningâ€¦</span>';
    }
    if (tick > 100) clearInterval(interval);
  }, 2000);
}

// Start
init();

// --- WebSocket Global State ---
(window as any).esp32Connected = false;
(window as any).lastRssi = null;
let wsKeepaliveTimer: number | null = null;  // frontend keepalive interval
let wsReconnectDelay = 1000; // starts at 1s, exponential backoff


// Update the blue LED indicator element
// GUARD: only illuminate blue when ESP32 is actually connected AND ack says ON
function updateLedIndicator(isOn: boolean, deviceName?: string) {
  if (deviceName && deviceName !== 'Smart Dimmer Wall Switch') return;
  const led   = document.getElementById('led-on-indicator');
  const label = document.getElementById('led-state-label');
  if (!led || !label) return;

  // Only allow blue glow when ESP32 is genuinely connected
  const shouldGlow = isOn && (window as any).esp32Connected;

  if (shouldGlow) {
    led.classList.add('led-on');
    label.textContent = 'ON';
    label.classList.add('led-on');
  } else {
    led.classList.remove('led-on');
    label.textContent = isOn && !(window as any).esp32Connected ? 'PENDING' : 'OFF';
    label.classList.remove('led-on');
  }
}

// Update ESP32 connection badge — 3 states: connected / reconnecting / disconnected
function updateEsp32Badge(connected: boolean, reconnecting = false) {
  (window as any).esp32Connected = connected;
  const dot   = document.getElementById('esp32-status-dot');
  const badge = document.getElementById('esp32-status-badge');
  if (!dot || !badge) return;

  if (connected) {
    dot.style.display = 'none';
    badge.className = 'esp32-status-label esp32-connected';
    badge.textContent = '● ESP32 Connected';
    btnLightToggle.disabled = false;
    propState.disabled = false;
  } else if (reconnecting) {
    dot.style.display = 'inline-block';
    dot.className   = 'esp32-status-dot esp32-reconnecting';
    badge.className = 'esp32-status-label esp32-reconnecting';
    badge.textContent = 'ESP32 Reconnecting…';
    btnLightToggle.disabled = true;
    propState.disabled = true;
    // Gray out LED indicator while reconnecting
    updateLedIndicator(false);
  } else {
    dot.style.display = 'inline-block';
    dot.className   = 'esp32-status-dot esp32-disconnected';
    badge.className = 'esp32-status-label esp32-disconnected';
    badge.textContent = 'ESP32 Disconnected';
    btnLightToggle.disabled = true;
    propState.disabled = true;
    // Force LED indicator to OFF/gray
    updateLedIndicator(false);
    const valSignal = document.getElementById('prop-val-signal');
    if (valSignal) valSignal.textContent = 'â€”';
  }
}

// WebSocket Setup
function initWebSocket() {
  const isHttps = window.location.protocol === 'https:';
  const wsProtocol = isHttps ? 'wss://' : 'ws://';
  const host = window.location.hostname;
  const wsUrl = (host === 'localhost' || host === '127.0.0.1')
    ? `${wsProtocol}${host}:3000`
    : `${wsProtocol}${host}`;
  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    console.warn('[WS] connect failed, retry in', wsReconnectDelay, 'ms');
    setTimeout(initWebSocket, wsReconnectDelay);
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
    return;
  }
  (window as any).appWs = ws;

  ws.onopen = () => {
    console.log('[WS] Connected to backend');
    wsReconnectDelay = 1000;
    ws.send(JSON.stringify({ client: 'web' }));

    // Frontend keepalive ping every 25s (survives NAT/proxy idle timeouts)
    if (wsKeepaliveTimer !== null) clearInterval(wsKeepaliveTimer);
    wsKeepaliveTimer = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'keepalive' }));
      }
    }, 25000);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // â”€â”€ ESP32 connection status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      
      if (data.type === 'esp32_devices') {
        const select = document.getElementById('esp32-device-select') as HTMLSelectElement;
        if (select) {
           select.innerHTML = '<option value="none">Select Device</option>';
           data.devices.forEach((id: string) => {
             const opt = document.createElement('option');
             opt.value = id;
             opt.textContent = id;
             select.appendChild(opt);
           });
           if (data.devices.length > 0) {
             select.value = data.devices[0];
           }
        }
        return;
      }

      if (data.type === 'esp32_status') {
         if (data.connected !== undefined && !data.reconnecting) {
            logIotActivity('Connection', data.connected ? 'ESP32 Device Connected' : 'ESP32 Device Disconnected');
         }
        const isConnected    = !!data.connected;
        const isReconnecting = !!data.reconnecting;
        updateEsp32Badge(isConnected, isReconnecting);

        if (data.rssi !== undefined) (window as any).lastRssi = data.rssi;
        const valSignal = document.getElementById('prop-val-signal');
        if (valSignal && isConnected) {
          valSignal.textContent = (window as any).lastRssi
            ? `${(window as any).lastRssi} dBm` : 'â€”';
        }
        return;
      }

      // â”€â”€ LED ACK from ESP32 (ack-gated UI update) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (data.type === 'led_status') {
        // Cancel any pending revert timer
        if ((window as any)._pendingAckTimer) {
          clearTimeout((window as any)._pendingAckTimer);
          (window as any)._pendingAckTimer = null;
        }

        const dev = placedDevices.find(d => d.name === 'Smart Dimmer Wall Switch');
        if (dev) {
          dev.state = !!data.state;
          if (data.rssi !== undefined) {
            (window as any).lastRssi = data.rssi;
            const valSignal = document.getElementById('prop-val-signal');
            if (valSignal) valSignal.textContent = `${data.rssi} dBm`;
          }

          // Update ALL UI from ACK â€” authoritative, not optimistic
          if (selectedDeviceId === dev.id) {
            propState.checked   = dev.state;
            propState.disabled  = false;
            btnLightToggle.disabled = false;
            btnLightToggle.textContent = dev.state ? 'ðŸ’¡ Turn Off' : 'ðŸ’¡ Turn On';
            btnLightToggle.className   = dev.state ? 'btn btn-light-on' : 'btn btn-primary';
            updateLedIndicator(dev.state, dev.name);
          }
          renderPlacedDevices();
          console.log('Backend response received');
          console.log('[ACK] led_status -> state =', dev.state);
          logIotActivity('Command ACK', `State: ${dev.state ? 'ON' : 'OFF'}`);
        }
        return;
      }

      // â”€â”€ Heartbeat ACK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (data.type === 'heartbeat_ack') {
        console.log('[HB] heartbeat_ack received from server');
        return;
      }

    } catch (e) {
      console.warn('[WS] parse error:', e);
    }
  };

  ws.onerror = () => {
    console.warn('[WS] error â€” marking disconnected');
    updateEsp32Badge(false, false);
  };

  ws.onclose = (e) => {
    console.warn(`[WS] closed (code=${e.code}) â€” reconnecting in ${wsReconnectDelay}ms`);
    updateEsp32Badge(false, false);
    if (wsKeepaliveTimer !== null) { clearInterval(wsKeepaliveTimer); wsKeepaliveTimer = null; }
    setTimeout(initWebSocket, wsReconnectDelay);
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
  };
}


// ==================== AUTOMATION ENGINE ====================
interface Schedule {
  id: string;
  time: string;
  action: 'on' | 'off';
  brightness: number;
  active: boolean;
}

let schedules: Schedule[] = JSON.parse(localStorage.getItem('cadnova_schedules') || '[]');
let scheduleCheckInterval: number | null = null;

function renderSchedulesList() {
  if (!schedulesList) return;
  if (schedules.length === 0) {
    schedulesList.innerHTML = '<div class="no-events">No active schedules</div>';
    return;
  }
  schedulesList.innerHTML = schedules.map(s => `
    <div class="schedule-item">
      <div class="schedule-info">
        <span class="schedule-time">${s.time}</span>
        <span class="schedule-action">${s.action === 'on' ? '💡 Turn ON' : '🌙 Turn OFF'} (${s.brightness}%)</span>
      </div>
      <button class="btn-delete" data-id="${s.id}" title="Delete schedule">✕</button>
    </div>
  `).join('');
  // Bind delete buttons
  schedulesList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).getAttribute('data-id');
      schedules = schedules.filter(sc => sc.id !== id);
      saveSchedules();
      renderSchedulesList();
      logIotActivity('Automation', 'Schedule removed');
    });
  });
}

function saveSchedules() {
  localStorage.setItem('cadnova_schedules', JSON.stringify(schedules));
}

function checkSchedules() {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  schedules.forEach(s => {
    if (s.time === currentTime && s.active) {
      s.active = false; // prevent re-firing this minute
      const ws = (window as any).appWs;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'set_led', state: s.action === 'on' }));
        if (s.action === 'on') {
          ws.send(JSON.stringify({ type: 'set_brightness', brightness: s.brightness }));
        }
        logIotActivity('Automation', `Scheduled ${s.action.toUpperCase()} at ${s.time} executed (${s.brightness}%)`);
      }
      // Reset active after 61s so it doesn't re-trigger in same minute
      setTimeout(() => { s.active = true; }, 61000);
    }
  });
}

function startScheduleEngine() {
  if (scheduleCheckInterval !== null) return;
  scheduleCheckInterval = window.setInterval(checkSchedules, 10000); // check every 10s
}

// Init schedules
renderSchedulesList();
startScheduleEngine();

if (btnAddSchedule) {
  btnAddSchedule.addEventListener('click', () => {
    const timeInput = document.getElementById('schedule-time-input') as HTMLInputElement;
    const actionInput = document.getElementById('schedule-action-input') as HTMLSelectElement;
    const brightInput = document.getElementById('schedule-bright-input') as HTMLInputElement;
    
    if (!timeInput || !timeInput.value) {
      showToast('Please select a time for the schedule.', 'info');
      return;
    }
    const newSchedule: Schedule = {
      id: Date.now().toString(),
      time: timeInput.value,
      action: actionInput.value as 'on' | 'off',
      brightness: parseInt(brightInput.value, 10),
      active: true
    };
    schedules.push(newSchedule);
    saveSchedules();
    renderSchedulesList();
    logIotActivity('Automation', `Schedule added: ${newSchedule.action.toUpperCase()} at ${newSchedule.time}`);
    showToast(`Schedule added: ${newSchedule.action.toUpperCase()} at ${newSchedule.time}`, 'success');
    timeInput.value = '';
  });
}

// Show activity/automation panels when a Smart Dimmer Wall Switch is selected
function showIotPanels(visible: boolean) {
  const activityPanel = document.getElementById('iot-activity-panel');
  const automationPanel = document.getElementById('iot-automation-panel');
  if (activityPanel) activityPanel.classList.toggle('hidden', !visible);
  if (automationPanel) automationPanel.classList.toggle('hidden', !visible);
}
// =====================================================


initWebSocket();
