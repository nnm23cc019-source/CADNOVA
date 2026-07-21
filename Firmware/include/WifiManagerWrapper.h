#ifndef WIFI_MANAGER_WRAPPER_H
#define WIFI_MANAGER_WRAPPER_H

#include <Arduino.h>

namespace WifiManagerWrapper {
    // Set up WiFiManager and connect (or start captive portal)
    void setup();

    // Monitor WiFi status and handle reconnects in a non-blocking way
    void process();

    // Check current connection status
    bool isConnected();
}

#endif // WIFI_MANAGER_WRAPPER_H
