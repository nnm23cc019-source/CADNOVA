const fs = require('fs');
let content = fs.readFileSync('frontend/src/main.ts', 'utf8');

// 1. Add new DOM elements
const domElementsRegex = /const btnLightToggle = document\.getElementById\('btn-light-toggle'\) as HTMLButtonElement;/;
const newDomElements = `const btnLightToggle = document.getElementById('btn-light-toggle') as HTMLButtonElement;

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
`;
content = content.replace(domElementsRegex, newDomElements);

// 2. Add helper functions for IoT
const helperRegex = /function hexToRgb\(hex: string\)/;
const iotHelpers = `
function updateColorPreview(hex: string) {
  if (colorPreviewCircle) {
    colorPreviewCircle.style.background = hex;
    colorPreviewCircle.style.boxShadow = \`0 0 8px \${hex}80\`;
  }
  if (rgbValueDisplay) {
    const rgb = hexToRgb(hex);
    if (rgb) rgbValueDisplay.textContent = \`R:\${rgb.r} G:\${rgb.g} B:\${rgb.b}\`;
  }
}

function logIotActivity(action: string, details: string) {
  if (!iotActivityLogList) return;
  const noEvents = iotActivityLogList.querySelector('.no-events');
  if (noEvents) noEvents.remove();
  
  const div = document.createElement('div');
  div.className = 'log-item';
  div.innerHTML = \`<span class="log-time">\${new Date().toLocaleTimeString()}</span> <strong>\${action}</strong>: \${details}\`;
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
    pathD += \` L \${i * step} \${height - (brightnessHistory[i] / max) * height}\`;
  }
  brightSparkPath.setAttribute('d', pathD);
  brightSparkArea.setAttribute('d', pathD + \` L \${width} \${height} L 0 \${height} Z\`);
}

function hexToRgb(hex: string)`;
content = content.replace(helperRegex, iotHelpers);

// 3. Add event listeners
const evtListenersRegex = /btnLightToggle\.addEventListener\('click'/;
const iotEventListeners = `
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
      logIotActivity('Device Selected', \`Switched to \${devId}\`);
    }
  });
}

btnLightToggle.addEventListener('click'`;
content = content.replace(evtListenersRegex, iotEventListeners);

// 4. Update WS esp32_devices
const wsRegex = /if \(data\.type === 'esp32_status'\) \{/;
const wsEnhancements = `
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
         }`;
content = content.replace(wsRegex, wsEnhancements);


// 5. Update LED Status ACK
const ackRegex = /console\.log\('\[ACK\] led_status/;
const ackEnhancements = `console.log('[ACK] led_status';
          logIotActivity('Command ACK', \`State: \${dev.state ? 'ON' : 'OFF'}\`);`;
content = content.replace(ackRegex, ackEnhancements);

fs.writeFileSync('frontend/src/main.ts', content);
console.log('main.ts updated successfully');
