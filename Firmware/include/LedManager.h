#ifndef LED_MANAGER_H
#define LED_MANAGER_H

#include <Arduino.h>

namespace LedManager {
    enum LedMode {
        LED_OFF,
        LED_SOLID_ON,
        LED_SLOW_BLINK,    // Booting (500 ms)
        LED_FAST_BLINK,    // WiFi Connecting (200 ms)
        LED_DOUBLE_BLINK,  // WiFiManager Portal Active
        LED_SHORT_FLASH,   // HTTP Request (Single short flash)
        LED_TRIPLE_BLINK   // Error / Exception (Triple blink continuously)
    };

    // Initialize LED pin and perform boot self-test (blink 3 times)
    void setup();

    // Set the active indication mode
    void setMode(LedMode mode);

    // Call continuously in loop() to handle blinking non-blockingly
    void update();

    // Direct LED state controller (useful for blocking callbacks like OTA)
    void writeLed(bool on);

    // Get the configured LED pin number
    int getLedPin();

    // Check if LED is active low configuration
    bool isActiveLow();
}

#endif // LED_MANAGER_H
