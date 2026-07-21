#ifndef OTA_MANAGER_H
#define OTA_MANAGER_H

#include <Arduino.h>

namespace OtaManager {
    // Configure OTA callbacks, password, port, and start server listener
    void setup();

    // Call inside main loop to handle OTA update packets
    void process();
}

#endif // OTA_MANAGER_H
