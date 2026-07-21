#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ==========================================
// Hardware Configuration
// ==========================================
#ifdef LED_BUILTIN
  const int CONFIG_LED_PIN = LED_BUILTIN;
  const bool CONFIG_HAS_LED = true;
#else
  const int CONFIG_LED_PIN = 2; // Default fallback for ESP32 DevKit V1
  const bool CONFIG_HAS_LED = true;
#endif

// Active state configuration (false = Active HIGH, true = Active LOW)
const bool CONFIG_LED_ACTIVE_LOW = false;

// ==========================================
// Wi-Fi & Captive Portal Configuration
// ==========================================
const char DEFAULT_AP_SSID[] = "CADNOVA-Config-AP";
const char DEFAULT_AP_PASSWORD[] = "cadnova123";
const int WIFI_PORTAL_TIMEOUT_SEC = 180; // 3 minutes captive portal timeout

// ==========================================
// NTP Time Sync Configuration
// ==========================================
const char NTP_SERVER_1[] = "pool.ntp.org";
const char NTP_SERVER_2[] = "time.nist.gov";
const long GMT_OFFSET_SEC = 19800;       // UTC+5:30 (Indian Standard Time)
const int DAYLIGHT_OFFSET_SEC = 0;       // No daylight savings in IST

// ==========================================
// HTTP Communication Configuration
// ==========================================
const unsigned long HTTP_REQUEST_INTERVAL_MS = 10000; // Poll backend every 10 seconds
const int HTTP_TIMEOUT_MS = 5000;                     // 5 seconds HTTP timeout
const int MAX_HTTP_RETRIES = 3;                       // Retry 3 times on failed connections

// ==========================================
// Over-The-Air (OTA) Configuration
// ==========================================
const uint16_t OTA_PORT = 3232;
const char OTA_PASSWORD[] = "cadnova_ota";

#endif // CONFIG_H
