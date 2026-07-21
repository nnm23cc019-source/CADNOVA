const fs = require('fs');
let c = fs.readFileSync('frontend/src/main.ts', 'utf8');
c = c.replace("showToast('Please select a time for the schedule.', 'warn')", "showToast('Please select a time for the schedule.', 'info')");
fs.writeFileSync('frontend/src/main.ts', c);
console.log('Fixed');
