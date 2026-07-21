#include "NtpManager.h"
#include "Config.h"
#include <time.h>

namespace NtpManager {
    void setup() {
        Serial.println("[NTP] Initializing time synchronization...");
        
        // Configure standard ESP32 timezone and servers
        configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
        
        Serial.println("[NTP] Sync request sent to servers.");
    }

    bool isSynced() {
        struct tm timeinfo;
        // getLocalTime returns false if time has not been synced yet
        return getLocalTime(&timeinfo, 10); // Check with 10ms timeout
    }

    String getFormattedTime() {
        struct tm timeinfo;
        if (!getLocalTime(&timeinfo, 10)) {
            return "NTP Not Synced";
        }
        
        char buffer[32];
        // Format: YYYY-MM-DD HH:MM:SS
        strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &timeinfo);
        return String(buffer);
    }
}
