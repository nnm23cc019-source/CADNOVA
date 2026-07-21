#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>

// ── Network Config ─────────────────────────────────────────────────────────────
const char* ssid     = "Galaxy A34 5G 7CF0";
const char* password = "00000007";

// Local machine IP address running the backend on port 3000
const char* websockets_server_host = "10.237.206.16";
const uint16_t websockets_server_port = 3000;

using namespace websockets;
WebsocketsClient client;

// ── LED / GPIO Config ──────────────────────────────────────────────────────────
const int  LED_PIN        = 2;   // Onboard blue LED (also used for brightness)
const int  PIN_RED        = 12;  // External RGB - Red
const int  PIN_GREEN      = 13;  // External RGB - Green
const int  PIN_BLUE       = 14;  // External RGB - Blue

const int  PWM_FREQ       = 5000;
const int  PWM_RESOLUTION = 8;
const int  PWM_CH_ONBOARD = 0;   // Channel 0 → GPIO 2 (onboard blue LED)
const int  PWM_CH_R       = 1;   // Channel 1 → GPIO 12 (external R)
const int  PWM_CH_G       = 2;   // Channel 2 → GPIO 13 (external G)
const int  PWM_CH_B       = 3;   // Channel 3 → GPIO 14 (external B)

bool currentLedState      = false;
int  currentBrightness    = 75;
struct Color { int r; int g; int b; };
Color currentColor = {255, 180, 40};

// ── Timing & Watchdog State ───────────────────────────────────────────────────
unsigned long wsLastReconnectAttempt  = 0;
unsigned long wsReconnectDelay        = 1000;     // doubles up to 30 s
unsigned long lastHeartbeatSentMs     = 0;
const unsigned long HEARTBEAT_INTERVAL = 5000;   // 5 s heartbeat
unsigned long wifiLastCheckMs         = 0;
const unsigned long WIFI_CHECK_MS     = 30000;   // WiFi watchdog every 30 s
unsigned long lastActivityMs          = 0;       // watchdog activity tracker

bool wsConnected = false;
int  wsConsecutiveFailures = 0; // track consecutive WS connect failures

// ── Helpers ───────────────────────────────────────────────────────────────────
void LOG(const char* tag, const String& msg) {
    Serial.printf("[%s] %s\n", tag, msg.c_str());
}


// Apply PWM brightness to onboard LED + optional external RGB
// NOTE: Onboard LED on DOIT ESP32 DevKit is active-LOW:
//   duty=0   -> LED fully ON  (100% brightness)
//   duty=255 -> LED fully OFF (0% brightness)
void applyLed(bool state) {
    if (!state) {
        // OFF: active-LOW -> write 255 (LED turns off)
        ledcWrite(PWM_CH_ONBOARD, 255);
        // External RGB OFF (active-HIGH, so 0 = off)
        ledcWrite(PWM_CH_R, 0);
        ledcWrite(PWM_CH_G, 0);
        ledcWrite(PWM_CH_B, 0);
    } else {
        float b = currentBrightness / 100.0f;
        int duty = constrain((int)(b * 255), 0, 255);
        // Onboard LED INVERTED: higher duty = dimmer
        ledcWrite(PWM_CH_ONBOARD, 255 - duty);
        // External RGB LED (active-HIGH): color * brightness
        ledcWrite(PWM_CH_R, constrain((int)(currentColor.r * b), 0, 255));
        ledcWrite(PWM_CH_G, constrain((int)(currentColor.g * b), 0, 255));
        ledcWrite(PWM_CH_B, constrain((int)(currentColor.b * b), 0, 255));
    }
}


// Send JSON led_status ACK to backend
void sendLedStatus() {
    if (!wsConnected) return;
    StaticJsonDocument<200> doc;
    doc["type"]       = "led_status";
    doc["state"]      = currentLedState;
    doc["brightness"] = currentBrightness;
    doc["rssi"]       = WiFi.RSSI();
    String out; serializeJson(doc, out);
    client.send(out);
    LOG("ACK", String("led_status → state=") + (currentLedState?"ON":"OFF")
        + " brightness=" + currentBrightness + " rssi=" + WiFi.RSSI());
}

// Set LED state + apply brightness + report ACK
void setLedState(bool state) {
    currentLedState = state;
    applyLed(state);
    if (state) {
        Serial.printf("Power ON: Brightness: %d%%, Color: RGB(%d,%d,%d)\n", 
                      currentBrightness, currentColor.r, currentColor.g, currentColor.b);
    } else {
        Serial.println("Power OFF");
    }
    sendLedStatus();
}

// Identify this device to backend on connect
void sendIdentify() {
    StaticJsonDocument<256> doc;
    doc["client"]     = "esp32";
    doc["deviceId"]   = "esp32-01";
    doc["state"]      = currentLedState;
    doc["brightness"] = currentBrightness;
    doc["rssi"]       = WiFi.RSSI();
    doc["ip"]         = WiFi.localIP().toString();
    String out; serializeJson(doc, out);
    client.send(out);
    Serial.println("ESP32 Registered as esp32-01");
}

// Send ESP32-initiated heartbeat
void sendHeartbeat() {
    if (!wsConnected) return;
    StaticJsonDocument<128> doc;
    doc["type"]   = "heartbeat";
    doc["rssi"]   = WiFi.RSSI();
    doc["uptime"] = millis() / 1000;
    String out; serializeJson(doc, out);
    client.send(out);
    LOG("HB", String("Sent → rssi=") + WiFi.RSSI() + " uptime=" + (millis()/1000) + "s");
}

// ── WebSocket Callbacks ───────────────────────────────────────────────────────
void onMessageCallback(WebsocketsMessage message) {
    lastActivityMs = millis(); // Refresh activity timer on message
    LOG("WS-RX", message.data());
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, message.data())) { LOG("ERR","JSON parse fail"); return; }

    // Check for device specific commands first (e.g. device = "esp32")
    if (doc.containsKey("device") && strcmp(doc["device"], "esp32") == 0) {
        if (doc.containsKey("power")) {
            currentLedState = doc["power"];
        }
        if (doc.containsKey("brightness")) {
            currentBrightness = doc["brightness"];
        }
        if (doc.containsKey("color")) {
            currentColor.r = doc["color"]["r"];
            currentColor.g = doc["color"]["g"];
            currentColor.b = doc["color"]["b"];
        }
        
        setLedState(currentLedState);
        return;
    }

    const char* type = doc["type"];
    if (!type) return;

    // Ping → Pong
    if (strcmp(type, "ping") == 0) {
        StaticJsonDocument<128> pong;
        pong["type"]   = "pong";
        pong["rssi"]   = WiFi.RSSI();
        pong["uptime"] = millis() / 1000;
        String out; serializeJson(pong, out);
        client.send(out);
        Serial.println("Heartbeat OK");
        return;
    }

    // Heartbeat ACK from server
    if (strcmp(type, "heartbeat_ack") == 0) {
        Serial.println("Heartbeat OK");
        return;
    }

    // Set LED ON/OFF
    if (strcmp(type, "set_led") == 0) {
        bool state = doc["state"];
        LOG("CMD", String("set_led received → ") + (state ? "ON" : "OFF"));
        setLedState(state);
        return;
    }

    // Set brightness — applies immediately to LED if it is ON
    if (strcmp(type, "set_brightness") == 0) {
        int b = constrain((int)doc["brightness"], 0, 100);
        currentBrightness = b;
        LOG("CMD", String("set_brightness → ") + b + "%");
        applyLed(currentLedState); // update PWM duty in real time
        sendLedStatus();
        return;
    }
}

void onEventsCallback(WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
        wsConnected      = true;
        wsReconnectDelay = 1000;
        lastActivityMs   = millis(); // Initialize activity watchdog
        // Pulse onboard LED to show connection (brief full brightness)
        ledcWrite(PWM_CH_ONBOARD, 255);
        delay(100);
        ledcWrite(PWM_CH_ONBOARD, 0);
        Serial.println("ESP32 Connected");
        sendIdentify();
    } else if (event == WebsocketsEvent::ConnectionClosed) {
        wsConnected = false;
        ledcWrite(PWM_CH_ONBOARD, 0); // Turn off onboard LED on disconnect
        LOG("WS", String("DISCONNECTED. reason=") + data);
    } else if (event == WebsocketsEvent::GotPing) {
        client.pong();
    }
}

// ── WiFi helpers ──────────────────────────────────────────────────────────────
void connectWifi() {
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(true);
    delay(200);

    // Max TX power for weak signal environment (-85 dBm)
    WiFi.setTxPower(WIFI_POWER_19_5dBm);

    // Connect directly — no scan needed, saves ~6 seconds
    WiFi.begin(ssid, password);
    unsigned long t = millis();
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED && millis() - t < 40000) {
        delay(500); Serial.print(".");
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("WiFi Connected");
        Serial.printf("[WiFi] IP=%s RSSI=%d dBm\n",
            WiFi.localIP().toString().c_str(), WiFi.RSSI());
    } else {
        LOG("WiFi", "FAILED to connect (40 s timeout)");
    }
}

void connectWebSocket() {
    // Force close any stale socket before reconnecting
    client.close();
    delay(50);
    Serial.println("Connecting to CADNOVA...");
    bool ok = client.connect(websockets_server_host, websockets_server_port, "/");
    if (ok) {
        wsConsecutiveFailures = 0;
        LOG("WS", "Initial connect OK");
    } else {
        wsConsecutiveFailures++;
        wsReconnectDelay = min(wsReconnectDelay * 2, (unsigned long)30000);
        LOG("WS", String("Connect FAILED. Next attempt in ") + wsReconnectDelay + " ms");
        // After 3 consecutive failures, force full WiFi cycle to clear bad socket
        if (wsConsecutiveFailures >= 3) {
            LOG("WS", "3 consecutive failures — forcing WiFi reconnect");
            wsConsecutiveFailures = 0;
            wsReconnectDelay = 1000;
            WiFi.disconnect();
            delay(200);
            connectWifi();
        }
    }
}

// ── LED startup diagnostic blink ───────────────────────────────────────────────
void runLedDiagnostics() {
    LOG("DIAG", "LED diagnostic blink start");
    // PWM already set up before calling this
    for (int j = 0; j < 3; j++) {
        ledcWrite(PWM_CH_R, 255); ledcWrite(PWM_CH_G, 255); ledcWrite(PWM_CH_B, 255); delay(200); // full brightness ON
        ledcWrite(PWM_CH_R, 0); ledcWrite(PWM_CH_G, 0); ledcWrite(PWM_CH_B, 0); delay(200); // OFF
    }
    LOG("DIAG", "LED diagnostic done");
}

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(1000);

    LOG("BOOT", "=== CADNOVA ESP32 Smart Dimmer v3.0 ===");
    LOG("BOOT", String("Target: ") + websockets_server_host + ":" + websockets_server_port);

    // ── Init PWM for LED brightness control ──────────────────────────────────
    // Onboard LED → PWM channel 0 (so brightness is visible immediately)
    ledcSetup(PWM_CH_ONBOARD, PWM_FREQ, PWM_RESOLUTION);
    ledcAttachPin(LED_PIN, PWM_CH_ONBOARD);

    // External RGB LED channels
    ledcSetup(PWM_CH_R, PWM_FREQ, PWM_RESOLUTION);
    ledcSetup(PWM_CH_G, PWM_FREQ, PWM_RESOLUTION);
    ledcSetup(PWM_CH_B, PWM_FREQ, PWM_RESOLUTION);
    
    ledcAttachPin(PIN_RED,   PWM_CH_R);
    ledcAttachPin(PIN_GREEN, PWM_CH_G);
    ledcAttachPin(PIN_BLUE,  PWM_CH_B);

    applyLed(false); // All LEDs OFF at boot

    connectWifi();

    client.onMessage(onMessageCallback);
    client.onEvent(onEventsCallback);

    if (WiFi.status() == WL_CONNECTED) {
        connectWebSocket();
    }
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
    unsigned long now = millis();

    if (client.available()) {
        client.poll();
        wsReconnectDelay = 1000; // reset backoff while connected

        // ESP32-initiated heartbeat every 5 s
        if (now - lastHeartbeatSentMs >= HEARTBEAT_INTERVAL) {
            lastHeartbeatSentMs = now;
            sendHeartbeat();
        }

        // Connection Watchdog: Reconnect if no server response/activity for 30 s
        if (wsConnected && now > lastActivityMs && (now - lastActivityMs > 30000)) {
            LOG("WS", "Connection watchdog timeout. Reconnecting...");
            client.close();
            wsConnected = false;
            lastActivityMs = now; // reset to avoid immediate loops
        }
    } else {
        wsConnected = false;

        // WiFi watchdog every 30 s
        if (now - wifiLastCheckMs >= WIFI_CHECK_MS) {
            wifiLastCheckMs = now;
            if (WiFi.status() != WL_CONNECTED) {
                LOG("WiFi", "Lost — reconnecting...");
                WiFi.disconnect();
                connectWifi();
                wsReconnectDelay = 1000;
            } else {
                LOG("WiFi", String("OK. RSSI=") + WiFi.RSSI() + "dBm");
            }
        }

        // WebSocket reconnect with exponential backoff
        if (WiFi.status() == WL_CONNECTED && now - wsLastReconnectAttempt >= wsReconnectDelay) {
            wsLastReconnectAttempt = now;
            LOG("WS", String("Reconnect attempt (delay=") + wsReconnectDelay + "ms)");
            connectWebSocket();
        }
    }

    delay(10);
}
