#include "ConfigStorage.h"
#include "Config.h"
#include <LittleFS.h>
#include <ArduinoJson.h>

namespace ConfigStorage {
    char backendUrl[128] = "http://192.168.1.100:3000/api/health";
    char deviceName[32] = "CADNOVA-ESP32-Device";

    bool init() {
        Serial.println("[Storage] Initializing LittleFS...");
        
        // Passing true will format the filesystem if it cannot be mounted
        if (!LittleFS.begin(true)) {
            Serial.println("[Storage] Error: LittleFS mount failed.");
            return false;
        }
        
        Serial.println("[Storage] LittleFS mounted successfully.");
        return true;
    }

    bool load() {
        Serial.println("[Storage] Loading configuration file...");
        
        if (!LittleFS.exists("/config.json")) {
            Serial.println("[Storage] Configuration file '/config.json' not found. Creating default...");
            return save(backendUrl, deviceName);
        }

        File configFile = LittleFS.open("/config.json", "r");
        if (!configFile) {
            Serial.println("[Storage] Error: Failed to open config file for reading.");
            return false;
        }

        // ArduinoJson v7 allocates JSON documents on the stack/heap automatically
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, configFile);
        configFile.close();

        if (error) {
            Serial.print("[Storage] Error parsing config JSON: ");
            Serial.println(error.c_str());
            return false;
        }

        // Extract values, falling back to defaults if missing
        if (doc["backendUrl"].is<const char*>()) {
            strlcpy(backendUrl, doc["backendUrl"], sizeof(backendUrl));
        }
        if (doc["deviceName"].is<const char*>()) {
            strlcpy(deviceName, doc["deviceName"], sizeof(deviceName));
        }

        Serial.println("[Storage] Configuration loaded successfully:");
        Serial.print("  - Backend URL: ");
        Serial.println(backendUrl);
        Serial.print("  - Device Name: ");
        Serial.println(deviceName);
        
        return true;
    }

    bool save(const char* newUrl, const char* newName) {
        Serial.println("[Storage] Saving configuration to file...");
        
        File configFile = LittleFS.open("/config.json", "w");
        if (!configFile) {
            Serial.println("[Storage] Error: Failed to open config file for writing.");
            return false;
        }

        JsonDocument doc;
        doc["backendUrl"] = newUrl;
        doc["deviceName"] = newName;

        if (serializeJson(doc, configFile) == 0) {
            Serial.println("[Storage] Error: Failed to write JSON to file.");
            configFile.close();
            return false;
        }

        configFile.close();

        // Update active configuration variables
        strlcpy(backendUrl, newUrl, sizeof(backendUrl));
        strlcpy(deviceName, newName, sizeof(deviceName));

        Serial.println("[Storage] Configuration saved and updated successfully.");
        return true;
    }
}
