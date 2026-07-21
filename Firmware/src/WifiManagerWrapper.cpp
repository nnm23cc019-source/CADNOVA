#include "WifiManagerWrapper.h"
#include "Config.h"
#include "ConfigStorage.h"
#include "LedManager.h"
#include <WiFiManager.h>

namespace WifiManagerWrapper {
    // State tracking variables
    bool wasConnected = false;
    bool isConnecting = false;
    unsigned long lastConnectAttemptTime = 0;
    unsigned long lastReconnectAttempt = 0;
    
    const unsigned long connectTimeoutMs = 15000;   // 15 seconds timeout per attempt
    const unsigned long reconnectInterval = 30000;  // 30 seconds retry interval

    // Print Wi-Fi state names for logging
    void logWifiStatus(wl_status_t status) {
        Serial.print("[WiFi Status] ");
        switch (status) {
            case WL_IDLE_STATUS:
                Serial.println("WL_IDLE_STATUS - Changing states / idle");
                break;
            case WL_NO_SSID_AVAIL:
                Serial.println("WL_NO_SSID_AVAIL - Stored SSID not found/available");
                break;
            case WL_SCAN_COMPLETED:
                Serial.println("WL_SCAN_COMPLETED - Networks scan completed");
                break;
            case WL_CONNECTED:
                Serial.println("WL_CONNECTED - Connected successfully");
                break;
            case WL_CONNECT_FAILED:
                Serial.println("WL_CONNECT_FAILED - Connection attempt failed");
                break;
            case WL_CONNECTION_LOST:
                Serial.println("WL_CONNECTION_LOST - Connection lost");
                break;
            case WL_DISCONNECTED:
                Serial.println("WL_DISCONNECTED - Disconnected");
                break;
            default:
                Serial.printf("Unknown status code: %d\n", status);
                break;
        }
    }

    // Callback when WiFiManager enters configuration mode
    void configModeCallback(WiFiManager *myWiFiManager) {
        Serial.println("[WiFi] Entered Configuration Portal Mode.");
        Serial.print("[WiFi] Please connect to Hotspot AP: ");
        Serial.println(myWiFiManager->getConfigPortalSSID());
        
        // Double blink if WiFiManager configuration portal is active
        LedManager::setMode(LedManager::LED_DOUBLE_BLINK);
    }

    void setup() {
        Serial.println("[WiFi] Starting Wi-Fi setup...");
        
        // Slow blink while booting / setting up Wi-Fi
        LedManager::setMode(LedManager::LED_SLOW_BLINK);

        // Verify and log stored credentials
        Serial.print("[WiFi] Verifying saved credentials - SSID: ");
        String storedSsid = WiFi.SSID();
        if (storedSsid.length() > 0) {
            Serial.println(storedSsid);
        } else {
            Serial.println("<No credentials found>");
        }

        WiFiManager wm;
        wm.setDebugOutput(true);

        // Set callback for configuration portal activation
        wm.setAPCallback(configModeCallback);

        WiFiManagerParameter custom_backend_url("backend", "CADNOVA Backend URL", ConfigStorage::backendUrl, 128);
        WiFiManagerParameter custom_device_name("device", "Device Name / ID", ConfigStorage::deviceName, 32);
        
        wm.addParameter(&custom_backend_url);
        wm.addParameter(&custom_device_name);

        wm.setConfigPortalTimeout(WIFI_PORTAL_TIMEOUT_SEC);

        Serial.print("[WiFi] Launching AutoConnect/Portal SSID: ");
        Serial.println(DEFAULT_AP_SSID);

        // Start AutoConnect portal
        bool success = wm.autoConnect(DEFAULT_AP_SSID, DEFAULT_AP_PASSWORD);

        if (success) {
            Serial.println("[WiFi] Successfully connected to Wi-Fi!");
            Serial.print("[WiFi] Local IP: ");
            Serial.print(WiFi.localIP());
            Serial.printf(" | RSSI: %d dBm\n", WiFi.RSSI());

            const char* urlVal = custom_backend_url.getValue();
            const char* nameVal = custom_device_name.getValue();
            if (strlen(urlVal) > 0 || strlen(nameVal) > 0) {
                ConfigStorage::save(urlVal, nameVal);
            }

            LedManager::setMode(LedManager::LED_SOLID_ON);
            wasConnected = true;
            isConnecting = false;
        } else {
            Serial.println("[WiFi] Failed to connect or Portal config timed out.");
            Serial.println("[WiFi] Starting in Standalone Offline Mode.");
            LedManager::setMode(LedManager::LED_OFF);
            wasConnected = false;
            isConnecting = false;
            lastReconnectAttempt = millis(); // Cooldown before background retry
        }
    }

    void process() {
        wl_status_t currentStatus = WiFi.status();
        static wl_status_t lastLoggedStatus = (wl_status_t)-1;

        // Log Wi-Fi status changes
        if (currentStatus != lastLoggedStatus) {
            logWifiStatus(currentStatus);
            lastLoggedStatus = currentStatus;
        }

        if (currentStatus == WL_CONNECTED) {
            if (!wasConnected) {
                Serial.print("[WiFi] Wi-Fi link re-established. Local IP: ");
                Serial.print(WiFi.localIP());
                Serial.printf(" | RSSI: %d dBm\n", WiFi.RSSI());
                LedManager::setMode(LedManager::LED_SOLID_ON);
                wasConnected = true;
                isConnecting = false;
            }
        } else {
            if (wasConnected) {
                Serial.println("[WiFi] Wi-Fi connection lost!");
                LedManager::setMode(LedManager::LED_OFF);
                wasConnected = false;
                isConnecting = false;
                lastReconnectAttempt = millis(); // Start retry cooldown immediately
            }

            unsigned long currentMillis = millis();

            if (isConnecting) {
                // Monitor connection progress non-blockingly
                if (currentStatus == WL_CONNECT_FAILED || currentStatus == WL_NO_SSID_AVAIL) {
                    Serial.println("[WiFi] Connection attempt failed explicitly.");
                    LedManager::setMode(LedManager::LED_OFF);
                    isConnecting = false;
                    lastReconnectAttempt = currentMillis; // Cooldown start
                }
                
                // Timeout check in case connection hangs
                if (currentMillis - lastConnectAttemptTime >= connectTimeoutMs) {
                    Serial.println("[WiFi] Connection attempt timed out (15 seconds).");
                    LedManager::setMode(LedManager::LED_OFF);
                    isConnecting = false;
                    lastReconnectAttempt = currentMillis; // Cooldown start
                }
            } else {
                // Not actively connecting, check if 30-second cooldown has passed
                if (currentMillis - lastReconnectAttempt >= reconnectInterval) {
                    lastReconnectAttempt = currentMillis;

                    String savedSsid = WiFi.SSID();
                    if (savedSsid.length() == 0) {
                        Serial.println("[WiFi] Reconnect skipped: No Wi-Fi credentials saved.");
                    } else {
                        Serial.println("[WiFi] 30-second cooldown completed. Triggering reconnect...");
                        
                        // Fast blink while connecting
                        LedManager::setMode(LedManager::LED_FAST_BLINK);

                        Serial.print("[WiFi] Target SSID: ");
                        Serial.println(savedSsid);

                        // Safe reset of the Wi-Fi hardware stack
                        Serial.println("[WiFi] Calling WiFi.disconnect(true) to reset stack...");
                        WiFi.disconnect(true);
                        delay(500); // Allow hardware to shut down

                        Serial.println("[WiFi] Re-enabling Station Mode...");
                        WiFi.mode(WIFI_STA);
                        delay(100);

                        Serial.println("[WiFi] Calling WiFi.begin() to initiate connection...");
                        WiFi.begin();
                        
                        isConnecting = true;
                        lastConnectAttemptTime = currentMillis;
                    }
                }
            }
        }
    }

    bool isConnected() {
        return WiFi.status() == WL_CONNECTED;
    }
}
