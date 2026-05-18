import { useMemo, useState } from 'react';
import Dashboard from '../Dashboard';
import { TelemetryChart } from '../TelemetryChart';
import { OperatorChart } from '../OperatorChart';
import { useTelemetryStore } from '../../stores/telemetryStore';

type PageKey = 'mission' | 'telemetry' | 'analysis' | 'logs' | 'config';
type DataSource = 'REAL' | 'DERIVED' | 'ESTIMATED' | 'SIMULATED';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws/telemetry';

const pages: Array<{ key: PageKey; label: string; code: string }> = [
  { key: 'mission', label: 'Mission Control', code: 'MC' },
  { key: 'telemetry', label: 'Engineering Telemetry', code: 'ET' },
  { key: 'analysis', label: 'Flight Analysis', code: 'FA' },
  { key: 'logs', label: 'System Logs', code: 'SL' },
  { key: 'config', label: 'Mission Config', code: 'CF' },
];

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;

  return [h, m, s].map((part) => String(part).padStart(2, '0')).join(':');
};

const formatNum = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return 'N/A';
  return value.toFixed(digits);
};

const stateLabel = (value?: string | null) => value?.replaceAll('_', '-') ?? 'NO DATA';

const quaternionToEuler = (w: number, x: number, y: number, z: number) => {
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);

  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);

  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);

  return {
    roll: roll * 180 / Math.PI,
    pitch: pitch * 180 / Math.PI,
    yaw: yaw * 180 / Math.PI,
  };
};

const DataTag = ({ type }: { type: DataSource }) => (
  <span className={`aero-tag ${type.toLowerCase()}`}>{type}</span>
);

const Readout = ({
  label,
  value,
  unit,
  type = 'REAL',
}: {
  label: string;
  value: string | number;
  unit?: string;
  type?: DataSource;
}) => (
  <div className="aero-readout">
    <div className="aero-readout-head">
      <span>{label}</span>
      <DataTag type={type} />
    </div>
    <strong>
      {value}
      {unit ? <em>{unit}</em> : null}
    </strong>
  </div>
);

const EngineeringTelemetry = () => {
  const {
    latestPacket,
    systemStatus,
    altitudeHistory,
    velocityHistory,
    accelerationHistory,
    packetRateHz,
    packetLossPercent,
    maxAltitude,
    maxVelocity,
  } = useTelemetryStore();

  const latestAcceleration = accelerationHistory.at(-1)?.value ?? 0;

  const euler = latestPacket
    ? quaternionToEuler(latestPacket.quat_w, latestPacket.quat_x, latestPacket.quat_y, latestPacket.quat_z)
    : { roll: 0, pitch: 0, yaw: 0 };

  const checksum = latestPacket
    ? `0x${latestPacket.checksum_xor.toString(16).toUpperCase().padStart(2, '0')}`
    : 'N/A';

  return (
    <section className="aero-page">
      <div className="aero-page-title">
        <div>
          <span>TELEMETRY MATRIX // CAN-7USAT</span>
          <h2>Engineering Telemetry</h2>
        </div>
        <div className="aero-page-stamp">T+ {formatDuration((latestPacket?.timestamp_ms ?? 0) / 1000)}</div>
      </div>

      <div className="aero-matrix-grid">
        <Readout label="Altitude" value={formatNum(latestPacket?.altitude_m ?? 0, 2)} unit="m" />
        <Readout label="Velocity" value={formatNum(latestPacket?.velocity_ms ?? 0, 2)} unit="m/s" />
        <Readout label="Acceleration" value={formatNum(latestAcceleration, 2)} unit="m/s2" type="DERIVED" />
        <Readout label="Max Altitude" value={formatNum(maxAltitude, 2)} unit="m" type="DERIVED" />
        <Readout label="Max Velocity" value={formatNum(maxVelocity, 2)} unit="m/s" type="DERIVED" />
        <Readout label="Packet Rate" value={packetRateHz} unit="Hz" type="DERIVED" />
        <Readout label="Packet Loss" value={formatNum(packetLossPercent, 2)} unit="%" type="DERIVED" />
        <Readout label="Checksum" value={checksum} />
      </div>

      <div className="aero-telemetry-layout">
        <div className="aero-panel span-2">
          <div className="aero-panel-head">
            <span>ALTITUDE PROFILE</span>
            <em>REAL PACKET FIELD: altitude_m</em>
          </div>
          <div className="aero-chart-slot">
            <TelemetryChart data={altitudeHistory} unit="m" />
          </div>
        </div>

        <div className="aero-panel">
          <div className="aero-panel-head">
            <span>ATTITUDE MATRIX</span>
            <em>REAL QUATERNION / DERIVED EULER</em>
          </div>
          <div className="aero-table">
            <div><span>QUAT_W</span><strong>{formatNum(latestPacket?.quat_w ?? 1, 5)}</strong><DataTag type="REAL" /></div>
            <div><span>QUAT_X</span><strong>{formatNum(latestPacket?.quat_x ?? 0, 5)}</strong><DataTag type="REAL" /></div>
            <div><span>QUAT_Y</span><strong>{formatNum(latestPacket?.quat_y ?? 0, 5)}</strong><DataTag type="REAL" /></div>
            <div><span>QUAT_Z</span><strong>{formatNum(latestPacket?.quat_z ?? 0, 5)}</strong><DataTag type="REAL" /></div>
            <div><span>ROLL</span><strong>{formatNum(euler.roll, 2)} deg</strong><DataTag type="DERIVED" /></div>
            <div><span>PITCH</span><strong>{formatNum(euler.pitch, 2)} deg</strong><DataTag type="DERIVED" /></div>
            <div><span>YAW</span><strong>{formatNum(euler.yaw, 2)} deg</strong><DataTag type="DERIVED" /></div>
          </div>
        </div>

        <div className="aero-panel">
          <div className="aero-panel-head">
            <span>LINK / PACKET INTEGRITY</span>
            <em>BACKEND STATUS</em>
          </div>
          <div className="aero-table">
            <div><span>PACKETS_RECEIVED</span><strong>{systemStatus?.packets_received ?? 0}</strong><DataTag type="REAL" /></div>
            <div><span>PACKETS_DROPPED</span><strong>{systemStatus?.packets_dropped ?? 0}</strong><DataTag type="REAL" /></div>
            <div><span>WEBSOCKET_CLIENTS</span><strong>{systemStatus?.websocket_clients ?? 0}</strong><DataTag type="REAL" /></div>
            <div><span>BACKEND_UPTIME</span><strong>{formatDuration(systemStatus?.uptime_seconds ?? 0)}</strong><DataTag type="REAL" /></div>
            <div><span>LAST_PACKET_TIME</span><strong>{systemStatus?.last_packet_time ?? 'N/A'}</strong><DataTag type="REAL" /></div>
          </div>
        </div>

        <div className="aero-panel">
          <div className="aero-panel-head">
            <span>VELOCITY PROFILE</span>
            <em>REAL PACKET FIELD: velocity_ms</em>
          </div>
          <div className="aero-chart-slot small">
            <TelemetryChart data={velocityHistory} unit="m/s" />
          </div>
        </div>

        <div className="aero-panel">
          <div className="aero-panel-head">
            <span>ACCELERATION PROFILE</span>
            <em>DERIVED: Δv / Δt</em>
          </div>
          <div className="aero-chart-slot small">
            <TelemetryChart data={accelerationHistory} unit="m/s2" />
          </div>
        </div>
      </div>
    </section>
  );
};

type FlightChartPoint = {
  time: number;
  value: number;
};

const formatMissionTime = (seconds: number | undefined) => {
  if (!Number.isFinite(seconds ?? NaN)) return '--:--:--';

  const safeSeconds = Math.max(0, Math.floor(seconds ?? 0));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;

  return [h, m, s].map((part) => String(part).padStart(2, '0')).join(':');
};

const formatMetric = (value: number | undefined, digits = 2) => {
  if (!Number.isFinite(value ?? NaN)) return 'N/A';
  return (value ?? 0).toFixed(digits);
};

const getSeriesStats = (series: FlightChartPoint[]) => {
  if (series.length === 0) {
    return {
      current: 0,
      min: 0,
      max: 0,
      average: 0,
      range: 0,
      samples: 0,
      peakPoint: { time: 0, value: 0 },
      finalPoint: { time: 0, value: 0 },
    };
  }

  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const peakPoint = series.reduce(
    (best, point) => (Math.abs(point.value) > Math.abs(best.value) ? point : best),
    series[0],
  );
  const finalPoint = series.at(-1) ?? series[0];

  return {
    current: finalPoint.value,
    min,
    max,
    average,
    range: max - min,
    samples: series.length,
    peakPoint,
    finalPoint,
  };
};

const formatEventTime = (timestamp: string | number | Date) => {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString();
};

const FlightAnalysis = () => {
  const {
    latestPacket,
    altitudeHistory,
    velocityHistory,
    accelerationHistory,
    events,
  } = useTelemetryStore();

  const altitudeStats = getSeriesStats(altitudeHistory);
  const velocityStats = getSeriesStats(velocityHistory);
  const accelerationStats = getSeriesStats(accelerationHistory);

  const flightDurationSeconds =
    latestPacket?.timestamp_ms !== undefined
      ? latestPacket.timestamp_ms / 1000
      : altitudeStats.finalPoint.time;

  const stateTransitions = events
    .filter((event) => event.message.startsWith('Flight state changed:'))
    .slice(0, 8);

  const landingLat = latestPacket?.gps_lat;
  const landingLon = latestPacket?.gps_lon;
  const isLanded = latestPacket?.flight_state_name === 'LANDED';

  return (
    <div className="aero-page analysis-page">
      <div className="aero-hero analysis-hero">
        <div>
          <span>POST-FLIGHT REVIEW // CAN-7USAT</span>
          <h2>Flight Analysis</h2>
        </div>
        <div className="analysis-hero-status">
          <span>{isLanded ? 'MISSION COMPLETE' : 'MISSION IN PROGRESS'}</span>
          <strong>T+ {formatMissionTime(flightDurationSeconds)}</strong>
        </div>
      </div>

      <div className="analysis-summary-grid">
        <div className="analysis-metric-card">
          <span>APOGEE</span>
          <strong>{formatMetric(altitudeStats.max, 2)} <em>m</em></strong>
          <DataTag type="DERIVED" />
        </div>

        <div className="analysis-metric-card">
          <span>TIME TO APOGEE</span>
          <strong>{formatMissionTime(altitudeStats.peakPoint.time)}</strong>
          <DataTag type="DERIVED" />
        </div>

        <div className="analysis-metric-card">
          <span>MAX VERTICAL VELOCITY</span>
          <strong>{formatMetric(velocityStats.max, 2)} <em>m/s</em></strong>
          <DataTag type="DERIVED" />
        </div>

        <div className="analysis-metric-card">
          <span>MAX DERIVED ACCEL</span>
          <strong>{formatMetric(accelerationStats.max, 2)} <em>m/s2</em></strong>
          <DataTag type="DERIVED" />
        </div>

        <div className="analysis-metric-card">
          <span>FLIGHT DURATION</span>
          <strong>{formatMissionTime(flightDurationSeconds)}</strong>
          <DataTag type="REAL" />
        </div>

        <div className="analysis-metric-card">
          <span>FINAL VERTICAL VELOCITY</span>
          <strong>{formatMetric(latestPacket?.velocity_ms, 2)} <em>m/s</em></strong>
          <DataTag type="REAL" />
        </div>

        <div className="analysis-metric-card">
          <span>LANDING LAT</span>
          <strong>{formatMetric(landingLat, 6)}</strong>
          <DataTag type="REAL" />
        </div>

        <div className="analysis-metric-card">
          <span>LANDING LON</span>
          <strong>{formatMetric(landingLon, 6)}</strong>
          <DataTag type="REAL" />
        </div>
      </div>

      <div className="analysis-main-grid">
        <section className="analysis-panel analysis-chart-panel">
          <header>
            <div>
              <span>ALTITUDE HISTORY</span>
              <h3>Flight Profile</h3>
            </div>
            <DataTag type="REAL" />
          </header>
          <OperatorChart data={altitudeHistory} label="Post-Flight Altitude Profile" unit="m" />
        </section>

        <section className="analysis-panel">
          <header>
            <div>
              <span>FRONTEND EVENT LOG</span>
              <h3>State Transition Table</h3>
            </div>
            <DataTag type="DERIVED" />
          </header>

          <div className="analysis-transition-table">
            {stateTransitions.length === 0 ? (
              <div className="analysis-empty-row">
                No state transitions recorded yet.
              </div>
            ) : (
              stateTransitions.map((event, index) => (
                <div className="analysis-transition-row" key={`${event.timestamp}-${index}`}>
                  <span>{formatEventTime(event.timestamp)}</span>
                  <strong>FLIGHT</strong>
                  <p>{event.message.replace('Flight state changed: ', '')}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

const SystemLogs = () => {
  const { events, warnings } = useTelemetryStore();

  return (
    <section className="aero-page">
      <div className="aero-page-title">
        <div>
          <span>TERMINAL EVENT STREAM</span>
          <h2>System Logs</h2>
        </div>
        <div className="aero-page-stamp">ROWS {events.length}</div>
      </div>

      <div className="aero-panel">
        <div className="aero-panel-head">
          <span>EVENT LOG</span>
          <em>COMMANDS / STATE / WEBSOCKET</em>
        </div>
        <div className="aero-log-table tall">
          {events.length === 0 ? (
            <div className="aero-log-row">
              <span>--:--:--</span>
              <strong>SYS</strong>
              <em>No events yet.</em>
              <DataTag type="REAL" />
            </div>
          ) : (
            events.map((event) => (
              <div key={event.id} className={`aero-log-row ${event.level}`}>
                <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                <strong>{event.level === 'danger' ? 'ALERT' : event.level === 'warning' ? 'WARN' : 'SYS'}</strong>
                <em>{event.message}</em>
                <DataTag type="REAL" />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="aero-panel">
        <div className="aero-panel-head">
          <span>ACTIVE WARNINGS</span>
          <em>DERIVED FROM CONNECTION / PACKET STATUS</em>
        </div>
        <div className="aero-log-table">
          {warnings.length === 0 ? (
            <div className="aero-log-row">
              <span>OK</span>
              <strong>STATUS</strong>
              <em>No active warnings.</em>
              <DataTag type="DERIVED" />
            </div>
          ) : (
            warnings.map((warning) => (
              <div key={warning} className="aero-log-row danger">
                <span>WARN</span>
                <strong>ALERT</strong>
                <em>{warning}</em>
                <DataTag type="DERIVED" />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

const MissionConfig = () => {
  const { mockMode, dataRateHz, systemStatus } = useTelemetryStore();

  return (
    <section className="aero-page">
      <div className="aero-page-title">
        <div>
          <span>SYSTEM CONFIGURATION</span>
          <h2>Mission Configuration</h2>
        </div>
        <div className="aero-page-stamp">CAN-7USAT</div>
      </div>

      <div className="aero-two-col">
        <div className="aero-panel">
          <div className="aero-panel-head">
            <span>MISSION PARAMETERS</span>
            <em>PROJECT CONFIG</em>
          </div>
          <div className="aero-table">
            <div><span>MISSION</span><strong>CAN-7USAT</strong><DataTag type="REAL" /></div>
            <div><span>FRONTEND</span><strong>React + Vite</strong><DataTag type="REAL" /></div>
            <div><span>BACKEND</span><strong>FastAPI</strong><DataTag type="REAL" /></div>
            <div><span>TELEMETRY_STREAM</span><strong>WebSocket</strong><DataTag type="REAL" /></div>
            <div><span>MODE</span><strong>{mockMode ? 'MOCK' : 'LIVE'}</strong><DataTag type={mockMode ? 'SIMULATED' : 'REAL'} /></div>
            <div><span>DATA_RATE</span><strong>{dataRateHz || 10} Hz</strong><DataTag type={mockMode ? 'SIMULATED' : 'REAL'} /></div>
          </div>
        </div>

        <div className="aero-panel">
          <div className="aero-panel-head">
            <span>INTERFACE ENDPOINTS</span>
            <em>LOCAL RUNTIME</em>
          </div>
          <div className="aero-table">
            <div><span>API_URL</span><strong>{API_URL}</strong><DataTag type="REAL" /></div>
            <div><span>WS_URL</span><strong>{WS_URL}</strong><DataTag type="REAL" /></div>
            <div><span>STATUS_ENDPOINT</span><strong>/api/status</strong><DataTag type="REAL" /></div>
            <div><span>HISTORY_ENDPOINT</span><strong>/api/telemetry/history</strong><DataTag type="REAL" /></div>
            <div><span>COMMAND_ENDPOINT</span><strong>/api/command</strong><DataTag type="REAL" /></div>
            <div><span>WEBSOCKET_CLIENTS</span><strong>{systemStatus?.websocket_clients ?? 0}</strong><DataTag type="REAL" /></div>
          </div>
        </div>
      </div>

      <div className="aero-panel">
        <div className="aero-panel-head">
          <span>FLIGHT STATE MODEL</span>
          <em>BACKEND STATE NAMES</em>
        </div>
        <div className="aero-state-strip">
          {['PRE_FLIGHT', 'BOOST', 'COAST', 'APOGEE', 'DESCENT', 'LANDED'].map((state) => (
            <div key={state}>{state.replaceAll('_', '-')}</div>
          ))}
        </div>
      </div>
    </section>
  );
};

export const AppShell = () => {
  const [activePage, setActivePage] = useState<PageKey>('mission');

  const {
    connected,
    mockMode,
    packetRateHz,
    packetLossPercent,
    latestPacket,
    systemStatus,
  } = useTelemetryStore();

  const pageTitle = pages.find((page) => page.key === activePage)?.label ?? 'Mission Control';

  const nonMissionContent = useMemo(() => {
    if (activePage === 'telemetry') return <EngineeringTelemetry />;
    if (activePage === 'analysis') return <FlightAnalysis />;
    if (activePage === 'logs') return <SystemLogs />;
    if (activePage === 'config') return <MissionConfig />;
    return null;
  }, [activePage]);

  return (
    <div className="aero-shell">
      <aside className="aero-sidebar">
        <div className="aero-logo">
          <span>GROUND STATION</span>
          <strong>CAN-7USAT</strong>
        </div>

        <nav className="aero-nav">
          {pages.map((page) => (
            <button
              key={page.key}
              className={activePage === page.key ? 'active' : ''}
              onClick={() => setActivePage(page.key)}
            >
              <span>{page.code}</span>
              <strong>{page.label}</strong>
            </button>
          ))}
        </nav>

        <div className="aero-sidebar-footer">
          <span>UPLINK MODE</span>
          <strong>{mockMode ? 'SIMULATION' : 'LIVE LINK'}</strong>
        </div>
      </aside>

      <section className="aero-workspace">
        <header className="aero-topbar">
          <div>
            <span>HORIZON // CAN-7USAT</span>
            <h1>{pageTitle}</h1>
          </div>

          <div className="aero-top-status">
            <div className={connected ? 'ok' : 'bad'}>
              <span>LINK</span>
              <strong>{connected ? 'ONLINE' : 'OFFLINE'}</strong>
            </div>
            <div>
              <span>STATE</span>
              <strong>{stateLabel(latestPacket?.flight_state_name)}</strong>
            </div>
            <div>
              <span>RATE</span>
              <strong>{packetRateHz} Hz</strong>
            </div>
            <div>
              <span>LOSS</span>
              <strong>{packetLossPercent.toFixed(1)}%</strong>
            </div>
            <div>
              <span>UPTIME</span>
              <strong>{formatDuration(systemStatus?.uptime_seconds ?? 0)}</strong>
            </div>
          </div>
        </header>

        <main className="aero-content">
          <div className={activePage === 'mission' ? 'aero-page-host active' : 'aero-page-host hidden'}>
            <Dashboard />
          </div>

          {activePage !== 'mission' && nonMissionContent}
        </main>
      </section>
    </div>
  );
};

