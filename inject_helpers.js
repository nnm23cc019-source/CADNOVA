const fs = require('fs');
let content = fs.readFileSync('frontend/src/main.ts', 'utf8');

const iotHelpers = `
// ==================== IOT HELPERS ====================
function hexToRgb(hex: string) {
  const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

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
// =====================================================

`;

const insertMarker = "// --- STATE MANAGEMENT ---";
if(content.includes(insertMarker)) {
    content = content.replace(insertMarker, iotHelpers + insertMarker);
    fs.writeFileSync('frontend/src/main.ts', content);
    console.log('Helpers injected successfully');
} else {
    console.log('Could not find insert marker');
}
