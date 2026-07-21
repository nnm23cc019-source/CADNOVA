#ifndef CONFIG_STORAGE_H
#define CONFIG_STORAGE_H

#include <Arduino.h>

namespace ConfigStorage {
    // Config variables stored in LittleFS
    extern char backendUrl[128];
    extern char deviceName[32];

    // Initialize the filesystem
    bool init();

    // Load configurations from config.json
    bool load();

    // Save configurations to config.json
    bool save(const char* newUrl, const char* newName);
}

#endif // CONFIG_STORAGE_H
