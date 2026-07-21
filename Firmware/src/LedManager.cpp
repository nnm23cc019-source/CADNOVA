#include "LedManager.h"
#include "Config.h"
#include <esp_system.h>

namespace LedManager {
    unsigned long lastToggleTime = 0;
    bool ledState = false;

    // Helper to log if we are active low/high
    bool isActiveLow() {
        return CONFIG_LED_ACTIVE_LOW;
    }

    int getLedPin() {
        #ifdef LED_BUILTIN
            return LED_BUILTIN;
        #else
            return 2; // Default GPIO2 for DOIT DevKit V1
        #endif
    }

    void setup() {
        Serial.println("[Led] Initializing Onboard LED for continuous diagnostic...");
        
        const int pin = getLedPin();

        // Configure pin as OUTPUT
        pinMode(pin, OUTPUT);

        // Print diagnostic startup logs
        Serial.println("==========================================");
        Serial.println("         LED Continuous Diagnostic        ");
        Serial.println("==========================================");
        Serial.printf("  - Target GPIO:  %d\n", pin);
        #ifdef LED_BUILTIN
        Serial.println("  - Pin Status:   Resolved via LED_BUILTIN");
        #else
        Serial.println("  - Pin Status:   Resolved via GPIO2 fallback");
        #endif
        Serial.printf("  - Polarity:     %s\n", CONFIG_LED_ACTIVE_LOW ? "Active LOW" : "Active HIGH");
        Serial.println("  - Pattern:      1s ON / 1s OFF blink loop");
        Serial.println("==========================================\n");

        // Start off
        if (CONFIG_LED_ACTIVE_LOW) {
            digitalWrite(pin, HIGH);
        } else {
            digitalWrite(pin, LOW);
        }
        ledState = false;
        lastToggleTime = millis();
    }

    void writeLed(bool on) {
        // Disabled to prevent conflicting controls during diagnostic
    }

    void setMode(LedMode mode) {
        // Disabled to prevent conflicting controls during diagnostic
    }

    void update() {
        unsigned long currentMillis = millis();

        // Blink loop: toggle every 1000ms (1 second ON, 1 second OFF)
        if (currentMillis - lastToggleTime >= 1000) {
            lastToggleTime = currentMillis;
            ledState = !ledState;

            const int pin = getLedPin();

            // Toggle state taking polarity into account
            if (CONFIG_LED_ACTIVE_LOW) {
                digitalWrite(pin, ledState ? LOW : HIGH);
            } else {
                digitalWrite(pin, ledState ? HIGH : LOW);
            }

            // Print status to Serial Monitor
            if (ledState) {
                Serial.println("LED ON");
            } else {
                Serial.println("LED OFF");
            }
        }
    }
}
