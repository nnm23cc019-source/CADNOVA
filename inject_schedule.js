const fs = require('fs');
let content = fs.readFileSync('frontend/src/main.ts', 'utf8');

// Add automation/schedule logic near the end, right before initWebSocket()
const scheduleLogic = `
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
  schedulesList.innerHTML = schedules.map(s => \`
    <div class="schedule-item">
      <div class="schedule-info">
        <span class="schedule-time">\${s.time}</span>
        <span class="schedule-action">\${s.action === 'on' ? '💡 Turn ON' : '🌙 Turn OFF'} (\${s.brightness}%)</span>
      </div>
      <button class="btn-delete" data-id="\${s.id}" title="Delete schedule">✕</button>
    </div>
  \`).join('');
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
  const currentTime = \`\${String(now.getHours()).padStart(2,'0')}:\${String(now.getMinutes()).padStart(2,'0')}\`;
  schedules.forEach(s => {
    if (s.time === currentTime && s.active) {
      s.active = false; // prevent re-firing this minute
      const ws = (window as any).appWs;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'set_led', state: s.action === 'on' }));
        if (s.action === 'on') {
          ws.send(JSON.stringify({ type: 'set_brightness', brightness: s.brightness }));
        }
        logIotActivity('Automation', \`Scheduled \${s.action.toUpperCase()} at \${s.time} executed (\${s.brightness}%)\`);
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
      showToast('Please select a time for the schedule.', 'warn');
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
    logIotActivity('Automation', \`Schedule added: \${newSchedule.action.toUpperCase()} at \${newSchedule.time}\`);
    showToast(\`Schedule added: \${newSchedule.action.toUpperCase()} at \${newSchedule.time}\`, 'success');
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

`;

const insertMarker = "initWebSocket();";
if(content.includes(insertMarker)) {
    content = content.replace(insertMarker, scheduleLogic + '\n' + insertMarker);
    fs.writeFileSync('frontend/src/main.ts', content);
    console.log('Schedule engine injected successfully');
} else {
    console.log('Could not find insert marker: initWebSocket();');
}
