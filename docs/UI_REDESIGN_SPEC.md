# CAN-7USAT Ground Station — Aerospace Console Redesign Spec

## Goal

Redesign the current working telemetry dashboard into a dense aerospace engineering console inspired by technical rocket simulator and mission-control interfaces.

The current system already works:

- FastAPI backend
- WebSocket telemetry stream
- React + Vite frontend
- Mission-control dashboard
- GPS map
- 3D orientation view
- History loading
- Command safety controls

The next design direction should be more:

- monochrome
- technical
- numerical
- table-heavy
- engineering-console style
- less neon/glow
- more precise telemetry readouts

---

## Current Real Telemetry Fields

The backend currently provides these real packet values:

| Value | Source | Type |
|---|---|---|
| Mission time | `timestamp_ms` | Real |
| Flight state | `flight_state_name` | Real |
| Altitude | `altitude_m` | Real |
| Velocity | `velocity_ms` | Real |
| Quaternion W/X/Y/Z | `quat_w/x/y/z` | Real |
| GPS latitude | `gps_lat` | Real |
| GPS longitude | `gps_lon` | Real |
| Checksum | `checksum_xor` | Real |
| Received time | `received_at` | Real |

Backend status provides:

| Value | Source | Type |
|---|---|---|
| Packets received | `/api/status` | Real |
| Packets dropped | `/api/status` | Real |
| WebSocket clients | `/api/status` | Real |
| Uptime | `/api/status` | Real |

---

## Derived Frontend Values

These are calculated in the frontend:

| Value | Method | Type |
|---|---|---|
| Max altitude | max altitude history | Derived |
| Max velocity | max velocity history | Derived |
| Acceleration | delta velocity / delta time | Derived |
| Roll / pitch / yaw | quaternion conversion | Derived |
| Packet loss % | dropped / total packets | Derived |
| GPS fix validity | coordinate validity check | Derived |
| Recovery state | inferred from flight state | Estimated |

---

## Missing Data

These should not be faked as real values:

| Value | Status |
|---|---|
| Battery voltage | Missing |
| RSSI / radio signal | Missing |
| Pyro continuity | Missing |
| Drogue deployed sensor | Missing |
| Main deployed sensor | Missing |
| IMU health | Missing |
| Barometer health | Missing |
| GPS satellites | Missing |
| Raw packet hex | Missing but possible later |
| Mach number | Missing / future derived |
| Chamber pressure | Not available |
| Structural vibration | Not available |
| Thermal gradient | Not available |

Any missing value must be labeled as `N/A`, `PENDING SENSOR`, `SIMULATED`, or `DERIVED`.

---

## Required Screens

### 1. Mission Control

Live operator page.

Should show:

- flight state
- mission timer
- altitude
- velocity
- acceleration
- GPS map
- 3D attitude
- command safety panel
- warning strip
- event log
- packet/link status

### 2. Engineering Telemetry

Dense numerical telemetry page.

Should show:

- telemetry matrix
- altitude chart
- velocity chart
- acceleration chart
- attitude matrix
- quaternion values
- GPS/navigation values
- packet integrity
- link statistics
- raw packet/checksum area

### 3. Flight Analysis

Post-flight analysis page.

Should show:

- apogee altitude
- time to apogee
- max velocity
- max acceleration
- total flight duration
- ascent duration
- descent duration
- landing GPS
- state transition table
- export CSV

### 4. System Logs

Terminal-style log page.

Should show:

- timestamp
- subsystem
- event
- detail
- status

Subsystem examples:

- TEL_RX
- FLIGHT
- NAV_SYS
- CMD
- BACKEND
- DECODER
- GPS
- WS

### 5. Mission Configuration

System information page.

Should show:

- mission name
- backend URL
- WebSocket URL
- mock/live mode
- telemetry rate
- packet format
- flight states
- missing sensor list

---

## New Visual Theme

Target style:

- black background
- white/gray text
- sharp rectangular panels
- thin borders
- dense readouts
- terminal tables
- monochrome charts
- red/amber only for warnings
- minimal glow
- technical typography

Suggested palette:

| Token | Color |
|---|---|
| Background | `#050505` |
| Panel | `#111111` |
| Panel raised | `#171717` |
| Border | `#2a2a2a` |
| Strong border | `#3a3a3a` |
| Primary text | `#f4f4f4` |
| Secondary text | `#9a9a9a` |
| Muted text | `#666666` |
| Warning | `#ffcc66` |
| Danger | `#ff8a8a` |

---

## Milestones

### Milestone 5 — Aerospace Console Shell

- Add sidebar navigation
- Add top technical nav/status bar
- Convert theme to monochrome aerospace console
- Keep current mission-control page functional

### Milestone 6 — Engineering Telemetry Page

- Add telemetry matrix
- Add dense numerical readouts
- Add packet/link stats
- Add attitude matrix
- Add precise charts

### Milestone 7 — Flight Analysis Page

- Add post-flight summary
- Add state transition table
- Add apogee/time calculations
- Add export section

### Milestone 8 — System Logs Page

- Add terminal-style logs
- Add subsystem labels
- Add command/history rows

### Milestone 9 — Mission Configuration Page

- Add system metadata
- Add backend/frontend config
- Add missing-sensor list

---

## Design Rule

The UI must clearly distinguish:

- `REAL`
- `DERIVED`
- `ESTIMATED`
- `MISSING`
- `SIMULATED`

This is important for credibility and safety.
