#include "OtaManager.h"
#include "Config.h"
#include "ConfigStorage.h"
#include "LedManager.h"
#include <ArduinoOTA.h>

namespace OtaManager {
    void setup() {
        // Set Port
        ArduinoOTA.setPort(OTA_PORT);

        // Set Hostname derived from Device Name configuration
        ArduinoOTA.setHostname(ConfigStorage::deviceName);

        // Set Password authentication
        ArduinoOTA.setPassword(OTA_PASSWORD);

        // Register callbacks
        ArduinoOTA.onStart([]() {
            String type;
            if (ArduinoOTA.getCommand() == U_FLASH) {
                type = "sketch";
            } else { // U_SPIFFS / U_LITTLEFS
                type = "filesystem";
            }
            Serial.println("\n[OTA] Start remote update: " + type);
            LedManager::writeLed(false); // Start progress flashing with LED off
        });

        ArduinoOTA.onEnd([]() {
            Serial.println("\n[OTA] Update successfully finalized. Restarting device...");
            
            // Rapid double-blinking of LED to indicate successful flashing complete
            for (int i = 0; i < 15; i++) {
                LedManager::writeLed(true);
                delay(30);
                LedManager::writeLed(false);
                delay(30);
            }
        });

        ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
            unsigned int percent = progress / (total / 100);
            Serial.printf("[OTA] Progress: %u%%\r", percent);
            
            // Toggle LED to visually show download progress
            static bool state = false;
            state = !state;
            LedManager::writeLed(state);
        });

        ArduinoOTA.onError([](ota_error_t error) {
            Serial.printf("\n[OTA] Error [%u]: ", error);
            if (error == OTA_AUTH_ERROR) {
                Serial.println("Authentication Failed");
            } else if (error == OTA_BEGIN_ERROR) {
                Serial.println("Begin Session Failed");
            } else if (error == OTA_CONNECT_ERROR) {
                Serial.println("Connection Failed");
            } else if (error == OTA_RECEIVE_ERROR) {
                Serial.println("Data Receive Failed");
            } else if (error == OTA_END_ERROR) {
                Serial.println("End Session Failed");
            }
            
            // Solid LED indicating error state
            LedManager::writeLed(true);
        });

        // Initialize OTA listener
        ArduinoOTA.begin();
        
        Serial.println("[OTA] ArduinoOTA update listener active.");
    }

    void process() {
        ArduinoOTA.handle();
    }
}
