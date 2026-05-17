import { useEffect } from 'react';
import { useTelemetryStore, type TelemetryPacket } from '../stores/telemetryStore';
import { TelemetryChart } from './TelemetryChart';
import { Rocket3D } from './Rocket3D';
import { GPSMap } from './GPSMap';
import './Dashboard.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws/telemetry';

const FLIGHT_STATES = ['PRE_FLIGHT', 'BOOST', 'COAST', 'APOGEE', 'DESCENT', 'LANDED'];

const formatStateLabel = (state: string) => state.replace('_', '-');

const formatHms = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatFlightTime = (timestampMs?: number) => formatHms((timestampMs ?? 0) / 1000);

const isGpsValid = (packet: TelemetryPacket | null) => {
  if (!packet) return false;
  const latValid = Number.isFinite(packet.gps_lat) && packet.gps_lat >= -90 && packet.gps_lat <= 90;
  const lonValid = Number.isFinite(packet.gps_lon) && packet.gps_lon >= -180 && packet.gps_lon <= 180;
  const notZero = Math.abs(packet.gps_lat) > 0.000001 || Math.abs(packet.gps_lon) > 0.000001;
  return latValid && lonValid && notZero;
};

const quaternionToEuler = (packet: TelemetryPacket | null) => {
  if (!packet) return { roll: 0, pitch: 0, yaw: 0 };

  const { quat_w: w, quat_x: x, quat_y: y, quat_z: z } = packet;
  const radToDeg = 180 / Math.PI;

  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp) * radToDeg;

  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * 90 : Math.asin(sinp) * radToDeg;

  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp) * radToDeg;

  return { roll, pitch, yaw };
};

export const Dashboard = () => {
  const {
    connected,
    connecting,
    latestPacket,
    systemStatus,
    altitudeHistory,
    velocityHistory,
    accelerationHistory,
    packetsReceived,
    maxAltitude,
    maxVelocity,
    packetRateHz,
    packetLossPercent,
    mockMode,
    dataRateHz,
    armed,
    events,
    warnings,
    connect,
    disconnect,
    fetchStatus,
    loadHistory,
    sendCommand,
    addEvent,
    clearEvents,
  } = useTelemetryStore();

  useEffect(() => {
    loadHistory();
    connect(WS_URL);
    fetchStatus();

    const statusTimer = window.setInterval(() => {
      fetchStatus();
    }, 1000);

    return () => {
      window.clearInterval(statusTimer);
      disconnect();
    };
  }, [connect, disconnect, fetchStatus, loadHistory]);

  const currentState = latestPacket?.flight_state_name ?? 'NO_DATA';
  const currentStateIndex = FLIGHT_STATES.indexOf(currentState);
  const orientation = quaternionToEuler(latestPacket);
  const gpsValid = isGpsValid(latestPacket);
  const backendUptime = systemStatus?.uptime_seconds ?? 0;
  const backendPackets = systemStatus?.packets_received ?? packetsReceived;
  const backendDropped = systemStatus?.packets_dropped ?? 0;
  const clientCount = systemStatus?.websocket_clients ?? 0;
  const shownPacketRate = packetRateHz || dataRateHz;

  const drogueStatus = currentStateIndex >= FLIGHT_STATES.indexOf('APOGEE') ? 'EXPECTED' : 'STANDBY';
  const mainStatus = currentStateIndex >= FLIGHT_STATES.indexOf('DESCENT') ? 'EXPECTED' : 'STANDBY';
  const recoveryStatus = currentState === 'LANDED' ? 'COMPLETE' : currentStateIndex >= 3 ? 'ACTIVE' : 'STANDBY';

  const runCommand = async (command: string, confirmation?: string) => {
    if (confirmation && !window.confirm(confirmation)) return;

    try {
      await sendCommand(command);
    } catch (error) {
      console.error(error);
      window.alert(`Command failed: ${command}`);
    }
  };

  const exportCsv = async () => {
    try {
      const response = await fetch(`${API_URL}/api/export/csv`);
      if (!response.ok) throw new Error(`Export failed: ${response.status}`);

      const payload = (await response.json()) as { csv: string; rows: number };
      const blob = new Blob([payload.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = `can7usat_telemetry_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      addEvent(`Exported ${payload.rows} telemetry rows`, 'info');
    } catch (error) {
      console.error(error);
      addEvent('CSV export failed', 'danger');
      window.alert('CSV export failed. Make sure the backend has telemetry history.');
    }
  };

  return (
    <div className="mission-shell">
      <header className="mission-topbar">
        <div className="mission-brand">
          <div className="mission-mark">CAN</div>
          <div>
            <h1>CAN-7USAT Ground Control</h1>
            <p>Mission Control Interface - FastAPI WebSocket Telemetry</p>
          </div>
        </div>

        <div className="mission-metrics">
          <div className={`metric-pill ${connected ? 'ok' : 'danger'}`}>
            <span>Telemetry</span>
            <strong>{connecting ? 'CONNECTING' : connected ? 'CONNECTED' : 'DISCONNECTED'}</strong>
          </div>
          <div className="metric-pill">
            <span>Rate</span>
            <strong>{shownPacketRate.toFixed(0)} Hz</strong>
          </div>
          <div className={`metric-pill ${packetLossPercent > 0 ? 'warning' : ''}`}>
            <span>Packet Loss</span>
            <strong>{packetLossPercent.toFixed(1)}%</strong>
          </div>
          <div className="metric-pill">
            <span>Packets</span>
            <strong>{backendPackets}</strong>
          </div>
          <div className="metric-pill">
            <span>Uptime</span>
            <strong>{formatHms(backendUptime)}</strong>
          </div>
          <div className={`metric-pill ${mockMode ? 'warning' : 'ok'}`}>
            <span>Mode</span>
            <strong>{mockMode ? 'MOCK' : 'LIVE'}</strong>
          </div>
        </div>
      </header>

      <main className="mission-main">
        <section className="mission-column left-column">
          <div className="panel flight-panel">
            <div className="panel-header">Flight State Timeline</div>
            <div className="panel-body">
              <div className="state-readout">{formatStateLabel(currentState)}</div>
              <div className="state-list">
                {FLIGHT_STATES.map((state, index) => (
                  <div
                    key={state}
                    className={`state-row ${index <= currentStateIndex ? 'active' : ''} ${index === currentStateIndex ? 'current' : ''}`}
                  >
                    <span className="state-dot" />
                    <span>{formatStateLabel(state)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel status-panel">
            <div className="panel-header">Arm / Safe + Recovery</div>
            <div className="status-grid">
              <div className="status-cell">
                <span>Vehicle</span>
                <strong className={armed ? 'danger-text' : 'ok-text'}>{armed ? 'ARMED' : 'SAFE'}</strong>
              </div>
              <div className="status-cell">
                <span>Recovery</span>
                <strong>{recoveryStatus}</strong>
              </div>
              <div className="status-cell">
                <span>Drogue</span>
                <strong>{drogueStatus}</strong>
              </div>
              <div className="status-cell">
                <span>Main</span>
                <strong>{mainStatus}</strong>
              </div>
            </div>
          </div>

          <div className="panel command-panel">
            <div className="panel-header">Command Panel</div>
            <div className="panel-body command-grid">
              <button
                className={`command-button ${armed ? 'safe-button' : 'arm-button'}`}
                onClick={() => runCommand(armed ? 'DISARM' : 'ARM', armed ? 'Disarm vehicle?' : 'Arm vehicle?')}
              >
                {armed ? 'DISARM VEHICLE' : 'ARM VEHICLE'}
              </button>
              <button
                className="command-button warning-button"
                disabled={!armed}
                onClick={() => runCommand('MANUAL_DEPLOY', 'Manual deploy command? Use only for controlled testing.')}
              >
                MANUAL DEPLOY
              </button>
              <button className="command-button abort-button" onClick={() => runCommand('ABORT', 'Abort mission command?')}>
                ABORT
              </button>
              <button className="command-button" onClick={() => runCommand('RESET', 'Reset command state?')}>
                RESET
              </button>
            </div>
          </div>
        </section>

        <section className="mission-column center-column">
          <div className="telemetry-card-grid">
            <div className="telemetry-card">
              <span>Altitude</span>
              <strong>{latestPacket ? latestPacket.altitude_m.toFixed(1) : '--'} m</strong>
            </div>
            <div className="telemetry-card">
              <span>Velocity</span>
              <strong>{latestPacket ? latestPacket.velocity_ms.toFixed(1) : '--'} m/s</strong>
            </div>
            <div className="telemetry-card">
              <span>Max Altitude</span>
              <strong>{maxAltitude.toFixed(1)} m</strong>
            </div>
            <div className="telemetry-card">
              <span>Max Velocity</span>
              <strong>{maxVelocity.toFixed(1)} m/s</strong>
            </div>
            <div className="telemetry-card wide-card">
              <span>Flight Timer</span>
              <strong>{formatFlightTime(latestPacket?.timestamp_ms)}</strong>
            </div>
          </div>

          <div className="panel chart-panel">
            <div className="panel-header">Altitude Chart</div>
            <div className="chart-body">
              <TelemetryChart data={altitudeHistory} unit="m" height={170} />
            </div>
          </div>

          <div className="panel chart-panel">
            <div className="panel-header">Velocity Chart</div>
            <div className="chart-body">
              <TelemetryChart data={velocityHistory} unit="m/s" height={170} />
            </div>
          </div>

          <div className="panel chart-panel compact-chart">
            <div className="panel-header">Derived Acceleration Chart</div>
            <div className="chart-body">
              <TelemetryChart data={accelerationHistory} unit="m/s2" height={120} />
            </div>
          </div>
        </section>

        <section className="mission-column right-column">
          <div className="panel orientation-panel">
            <div className="panel-header">3D Rocket Orientation</div>
            <div className="rocket-viewport">
              <Rocket3D
                quat_w={latestPacket?.quat_w ?? 1}
                quat_x={latestPacket?.quat_x ?? 0}
                quat_y={latestPacket?.quat_y ?? 0}
                quat_z={latestPacket?.quat_z ?? 0}
              />
            </div>
          </div>

          <div className="panel quaternion-panel">
            <div className="panel-header">Quaternion / Attitude</div>
            <div className="quat-grid">
              <div><span>W</span><strong>{latestPacket?.quat_w.toFixed(4) ?? '1.0000'}</strong></div>
              <div><span>X</span><strong>{latestPacket?.quat_x.toFixed(4) ?? '0.0000'}</strong></div>
              <div><span>Y</span><strong>{latestPacket?.quat_y.toFixed(4) ?? '0.0000'}</strong></div>
              <div><span>Z</span><strong>{latestPacket?.quat_z.toFixed(4) ?? '0.0000'}</strong></div>
              <div><span>Roll</span><strong>{orientation.roll.toFixed(1)}Â°</strong></div>
              <div><span>Pitch</span><strong>{orientation.pitch.toFixed(1)}Â°</strong></div>
              <div><span>Yaw</span><strong>{orientation.yaw.toFixed(1)}Â°</strong></div>
            </div>
          </div>

          <div className="panel gps-panel">
            <div className="panel-header">GPS + Map</div>
            <div className="panel-body">
              <div className="gps-lines">
                <div><span>Latitude</span><strong>{latestPacket ? latestPacket.gps_lat.toFixed(6) : '--'}</strong></div>
                <div><span>Longitude</span><strong>{latestPacket ? latestPacket.gps_lon.toFixed(6) : '--'}</strong></div>
                <div><span>Fix</span><strong className={gpsValid ? 'ok-text' : 'warning-text'}>{gpsValid ? 'VALID' : 'WAITING'}</strong></div>
              </div>
              <GPSMap lat={latestPacket?.gps_lat ?? 0} lon={latestPacket?.gps_lon ?? 0} valid={gpsValid} />
            </div>
          </div>

          <div className="panel diagnostics-panel">
            <div className="panel-header">Diagnostics</div>
            <div className="diagnostic-list">
              <div><span>Backend</span><strong className={systemStatus ? 'ok-text' : 'danger-text'}>{systemStatus ? 'ONLINE' : 'OFFLINE'}</strong></div>
              <div><span>Radio / WS</span><strong className={connected ? 'ok-text' : 'danger-text'}>{connected ? 'NOMINAL' : 'LOST'}</strong></div>
              <div><span>GPS</span><strong className={gpsValid ? 'ok-text' : 'warning-text'}>{gpsValid ? 'VALID' : 'NO FIX'}</strong></div>
              <div><span>Dropped</span><strong className={backendDropped > 0 ? 'warning-text' : 'ok-text'}>{backendDropped}</strong></div>
              <div><span>Clients</span><strong>{clientCount}</strong></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mission-bottom">
        <div className="bottom-panel event-log">
          <div className="bottom-header">
            <span>Event Log</span>
            <button onClick={clearEvents}>Clear</button>
          </div>
          <div className="event-list">
            {events.length === 0 ? (
              <div className="empty-row">No mission events yet.</div>
            ) : (
              events.slice(0, 8).map((event) => (
                <div key={event.id} className={`event-row ${event.level}`}>
                  <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
                  <span>{event.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bottom-panel warnings-panel">
          <div className="bottom-header">
            <span>Warnings / Alerts</span>
            <button onClick={exportCsv}>Export CSV</button>
          </div>
          <div className="warning-list">
            {warnings.length === 0 ? (
              <div className="empty-row ok-text">No active warnings.</div>
            ) : (
              warnings.slice(0, 5).map((warning) => (
                <div key={warning} className="warning-row">âš  {warning}</div>
              ))
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};



