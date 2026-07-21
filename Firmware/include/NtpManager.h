#ifndef NTP_MANAGER_H
#define NTP_MANAGER_H

#include <Arduino.h>

namespace NtpManager {
    // Initialize SNTP settings and start network time sync
    void setup();

    // Check if time is synchronized with NTP servers
    bool isSynced();

    // Get current time formatted as YYYY-MM-DD HH:MM:SS
    String getFormattedTime();
}

#endif // NTP_MANAGER_H
