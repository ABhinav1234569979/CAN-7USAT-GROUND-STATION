import { useEffect, useMemo, useState } from 'react';
import './Dashboard.css';
import { useTelemetryStore } from '../stores/telemetryStore';
import { OperatorChart } from './OperatorChart';
import { Rocket3D } from './Rocket3D';
import { GPSMap } from './GPSMap';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws/telemetry';

const FLIGHT_STATES = ['PRE_FLIGHT', 'BOOST', 'COAST', 'APOGEE', 'DESCENT', 'LANDED'];

const stateLabel = (state?: string | null) => {
  if (!state) return 'NO DATA';
  return state.replaceAll('_', '-');
};

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;

  return [h, m, s].map((part) => String(part).padStart(2, '0')).join(':');
};

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

const isGpsValid = (lat?: number, lon?: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  Math.abs(lat ?? 0) > 0.000001 &&
  Math.abs(lon ?? 0) > 0.000001;

type ConfirmCommand = {
  command: string;
  title: string;
  body: string;
  danger?: boolean;
} | null;

type CommandButtonProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  warning?: boolean;
  active?: boolean;
};

const CommandButton = ({ label, onClick, disabled, danger, warning, active }: CommandButtonProps) => (
  <button
    className={[
      'command-button',
      danger ? 'danger' : '',
      warning ? 'warning' : '',
      active ? 'active' : '',
    ].join(' ')}
    disabled={disabled}
    onClick={onClick}
  >
    {label}
  </button>
);

export const Dashboard = () => {
  const {
    connected,
    mockMode,
    latestPacket,
    systemStatus,
    altitudeHistory,
    velocityHistory,
    accelerationHistory,
    packetRateHz,
    packetLossPercent,
    maxAltitude,
    maxVelocity,
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

  const [confirmCommand, setConfirmCommand] = useState<ConfirmCommand>(null);
  const [commandBusy, setCommandBusy] = useState<string | null>(null);

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

  const flightState = latestPacket?.flight_state_name ?? 'NO_DATA';
  const flightSeconds = latestPacket ? latestPacket.timestamp_ms / 1000 : 0;
  const gpsValid = isGpsValid(latestPacket?.gps_lat, latestPacket?.gps_lon);

  const euler = useMemo(() => {
    if (!latestPacket) return { roll: 0, pitch: 0, yaw: 0 };

    return quaternionToEuler(
      latestPacket.quat_w,
      latestPacket.quat_x,
      latestPacket.quat_y,
      latestPacket.quat_z,
    );
  }, [latestPacket]);

  const recoveryStatus = useMemo(() => {
    const index = FLIGHT_STATES.indexOf(flightState);
    const apogeeIndex = FLIGHT_STATES.indexOf('APOGEE');
    const descentIndex = FLIGHT_STATES.indexOf('DESCENT');
    const landedIndex = FLIGHT_STATES.indexOf('LANDED');

    return {
      recovery: index >= landedIndex ? 'COMPLETE' : index >= apogeeIndex ? 'ACTIVE' : 'STANDBY',
      drogue: index >= apogeeIndex ? 'EXPECTED' : 'STANDBY',
      main: index >= descentIndex ? 'EXPECTED' : 'STANDBY',
    };
  }, [flightState]);

  const canSendCommands = connected && !commandBusy;
  const manualDeployLocked = !armed || !connected || Boolean(commandBusy);

  const runCommand = async (command: string) => {
    try {
      setCommandBusy(command);
      await sendCommand(command);
    } catch (error) {
      console.error(error);
      addEvent(`Command failed locally: ${command}`, 'danger');
    } finally {
      setCommandBusy(null);
      setConfirmCommand(null);
    }
  };

  const requestCommand = (command: string) => {
    if (command === 'ARM') {
      setConfirmCommand({
        command,
        title: 'ARM VEHICLE',
        body: 'This will place the ground station in ARMED command mode. Manual deploy becomes available after this.',
        danger: true,
      });
      return;
    }

    if (command === 'MANUAL_DEPLOY') {
      setConfirmCommand({
        command,
        title: 'MANUAL DEPLOY',
        body: 'This is a recovery command. Confirm only if the vehicle is armed and manual deployment is intentional.',
        danger: true,
      });
      return;
    }

    if (command === 'ABORT') {
      setConfirmCommand({
        command,
        title: 'ABORT MISSION',
        body: 'This will send an abort command and return the command panel to safe mode.',
        danger: true,
      });
      return;
    }

    if (command === 'RESET') {
      setConfirmCommand({
        command,
        title: 'RESET SESSION',
        body: 'This will send a reset command and clear the local armed state.',
        danger: false,
      });
      return;
    }

    runCommand(command);
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
          <div className={`metric-pill ${connected ? 'good' : 'bad'}`}>
            <span>Telemetry</span>
            <strong>{connected ? 'CONNECTED' : 'DISCONNECTED'}</strong>
          </div>
          <div className="metric-pill">
            <span>Rate</span>
            <strong>{packetRateHz} Hz</strong>
          </div>
          <div className="metric-pill">
            <span>Packet Loss</span>
            <strong>{packetLossPercent.toFixed(1)}%</strong>
          </div>
          <div className="metric-pill">
            <span>Packets</span>
            <strong>{systemStatus?.packets_received ?? 0}</strong>
          </div>
          <div className="metric-pill">
            <span>Uptime</span>
            <strong>{formatDuration(systemStatus?.uptime_seconds ?? 0)}</strong>
          </div>
          <div className={`metric-pill ${mockMode ? 'warn' : 'good'}`}>
            <span>Mode</span>
            <strong>{mockMode ? 'MOCK' : 'LIVE'}</strong>
          </div>
        </div>
      </header>

      <main className="mission-main">
        <section className="mission-column left-column">
          <div className="panel timeline-panel">
            <div className="panel-header">Flight State Timeline</div>
            <div className="panel-body">
              <div className="current-state">{stateLabel(flightState)}</div>
              <div className="state-list">
                {FLIGHT_STATES.map((state) => {
                  const currentIndex = FLIGHT_STATES.indexOf(flightState);
                  const stateIndex = FLIGHT_STATES.indexOf(state);
                  const complete = currentIndex >= stateIndex && currentIndex !== -1;
                  const active = flightState === state;

                  return (
                    <div
                      key={state}
                      className={`state-step ${complete ? 'complete' : ''} ${active ? 'active' : ''}`}
                    >
                      <span />
                      {stateLabel(state)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={`panel arm-panel ${armed ? 'armed' : 'safe'}`}>
            <div className="panel-header">Arm / Safe + Recovery</div>
            <div className="panel-body">
              <div className="status-grid">
                <div className="status-cell">
                  <span>Vehicle</span>
                  <strong className={armed ? 'danger-text' : 'good-text'}>
                    {armed ? 'ARMED' : 'SAFE'}
                  </strong>
                </div>
                <div className="status-cell">
                  <span>Recovery</span>
                  <strong>{recoveryStatus.recovery}</strong>
                </div>
                <div className="status-cell">
                  <span>Drogue</span>
                  <strong>{recoveryStatus.drogue}</strong>
                </div>
                <div className="status-cell">
                  <span>Main</span>
                  <strong>{recoveryStatus.main}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="panel command-panel">
            <div className="panel-header">
              Command Panel
              <span className={`command-lock ${armed ? 'armed' : 'safe'}`}>
                {armed ? 'ARMED' : 'SAFE LOCK'}
              </span>
            </div>

            <div className="panel-body">
              {!connected && (
                <div className="command-note danger-note">
                  Commands disabled: telemetry link disconnected.
                </div>
              )}

              {commandBusy && (
                <div className="command-note">
                  Sending command: {commandBusy}
                </div>
              )}

              {!armed ? (
                <CommandButton
                  label="ARM VEHICLE"
                  danger
                  disabled={!canSendCommands}
                  onClick={() => requestCommand('ARM')}
                />
              ) : (
                <CommandButton
                  label="DISARM VEHICLE"
                  active
                  disabled={!canSendCommands}
                  onClick={() => requestCommand('DISARM')}
                />
              )}

              <CommandButton
                label={armed ? 'MANUAL DEPLOY' : 'MANUAL DEPLOY LOCKED'}
                warning
                disabled={manualDeployLocked}
                onClick={() => requestCommand('MANUAL_DEPLOY')}
              />

              <CommandButton
                label="ABORT"
                danger
                disabled={!canSendCommands}
                onClick={() => requestCommand('ABORT')}
              />

              <CommandButton
                label="RESET SESSION"
                disabled={!canSendCommands}
                onClick={() => requestCommand('RESET')}
              />
            </div>
          </div>
        </section>

        <section className="mission-column center-column">
          <div className="telemetry-card-grid">
            <div className="telemetry-card">
              <span>Altitude</span>
              <strong>{(latestPacket?.altitude_m ?? 0).toFixed(1)} m</strong>
            </div>
            <div className="telemetry-card">
              <span>Vertical Velocity</span>
              <strong>{(latestPacket?.velocity_ms ?? 0).toFixed(1)} m/s</strong>
            </div>
            <div className="telemetry-card">
              <span>Max Altitude</span>
              <strong>{maxAltitude.toFixed(1)} m</strong>
            </div>
            <div className="telemetry-card">
              <span>Max Vertical Velocity</span>
              <strong>{maxVelocity.toFixed(1)} m/s</strong>
            </div>
            <div className="telemetry-card wide-card">
              <span>Flight Timer</span>
              <strong>{formatDuration(flightSeconds)}</strong>
            </div>
          </div>

          <div className="chart-grid-console">
            <div className="panel chart-panel square-chart">
              <div className="panel-header">Altitude Chart</div>
              <div className="chart-body">
                <OperatorChart data={altitudeHistory} label="Altitude" unit="m" />
              </div>
            </div>

            <div className="panel chart-panel square-chart">
              <div className="panel-header">Vertical Velocity Chart</div>
              <div className="chart-body">
                <OperatorChart data={velocityHistory} label="Vertical Velocity" unit="m/s" />
              </div>
            </div>

            <div className="panel chart-panel acceleration-wide">
              <div className="panel-header">Derived Vertical Acceleration Chart</div>
              <div className="chart-body">
                <OperatorChart data={accelerationHistory} label="Derived Vertical Acceleration" unit="m/s2" />
              </div>
            </div>
          </div>
        </section>

        <section className="mission-column right-column">
          <div className="panel orientation-panel">
            <div className="panel-header">Attitude Visualizer</div>
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
              <div><span>W</span><strong>{(latestPacket?.quat_w ?? 1).toFixed(4)}</strong></div>
              <div><span>X</span><strong>{(latestPacket?.quat_x ?? 0).toFixed(4)}</strong></div>
              <div><span>Y</span><strong>{(latestPacket?.quat_y ?? 0).toFixed(4)}</strong></div>
              <div><span>Z</span><strong>{(latestPacket?.quat_z ?? 0).toFixed(4)}</strong></div>
              <div><span>Roll</span><strong>{euler.roll.toFixed(1)}°</strong></div>
              <div><span>Pitch</span><strong>{euler.pitch.toFixed(1)}°</strong></div>
              <div><span>Yaw</span><strong>{euler.yaw.toFixed(1)}°</strong></div>
            </div>
          </div>

          <div className="panel gps-panel">
            <div className="panel-header">GPS + Map</div>
            <div className="panel-body">
              <div className="gps-lines">
                <div><span>Latitude</span><strong>{(latestPacket?.gps_lat ?? 0).toFixed(6)}</strong></div>
                <div><span>Longitude</span><strong>{(latestPacket?.gps_lon ?? 0).toFixed(6)}</strong></div>
                <div><span>Fix</span><strong className={gpsValid ? 'good-text' : 'warn-text'}>{gpsValid ? 'VALID' : 'WAIT'}</strong></div>
              </div>
              <GPSMap lat={latestPacket?.gps_lat ?? 0} lon={latestPacket?.gps_lon ?? 0} valid={gpsValid} />
            </div>
          </div>

          <div className="panel diagnostics-panel">
            <div className="panel-header">Diagnostics</div>
            <div className="diagnostic-list">
              <div><span>Backend</span><strong className={systemStatus ? 'good-text' : 'warn-text'}>{systemStatus ? 'ONLINE' : 'WAIT'}</strong></div>
              <div><span>Radio / WS</span><strong className={connected ? 'good-text' : 'danger-text'}>{connected ? 'NOMINAL' : 'LOST'}</strong></div>
              <div><span>GPS</span><strong className={gpsValid ? 'good-text' : 'warn-text'}>{gpsValid ? 'VALID' : 'WAIT'}</strong></div>
              <div><span>Decoder</span><strong className={(systemStatus?.packets_dropped ?? 0) > 0 ? 'warn-text' : 'good-text'}>{(systemStatus?.packets_dropped ?? 0) > 0 ? 'DROPS' : 'CLEAN'}</strong></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mission-bottom">
        <div className="bottom-panel event-panel">
          <div className="bottom-header">
            <h3>Event Log</h3>
            <button className="clear-button" onClick={clearEvents}>Clear</button>
          </div>
          <div className="event-list">
            {events.length === 0 ? (
              <div className="empty-row">No events yet.</div>
            ) : (
              events.map((event) => (
                <div key={event.id} className={`event-row ${event.level}`}>
                  <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                  <strong>{event.message}</strong>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bottom-panel warning-panel">
          <div className="bottom-header">
            <h3>Warnings / Alerts</h3>
            <a className="export-button" href={`${API_URL}/api/export/csv`} target="_blank" rel="noreferrer">
              Export CSV
            </a>
          </div>
          <div className="warning-list">
            {warnings.length === 0 ? (
              <div className="empty-row good-text">No active warnings.</div>
            ) : (
              warnings.map((warning) => (
                <div key={warning} className="warning-row">
                  ⚠ {warning}
                </div>
              ))
            )}
          </div>
        </div>
      </footer>

      {confirmCommand && (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className={`confirm-modal ${confirmCommand.danger ? 'danger' : ''}`}>
            <div className="confirm-kicker">
              {confirmCommand.danger ? 'SAFETY CONFIRMATION REQUIRED' : 'CONFIRM COMMAND'}
            </div>
            <h2>{confirmCommand.title}</h2>
            <p>{confirmCommand.body}</p>

            <div className="confirm-actions">
              <button
                className="confirm-cancel"
                disabled={Boolean(commandBusy)}
                onClick={() => setConfirmCommand(null)}
              >
                Cancel
              </button>
              <button
                className={confirmCommand.danger ? 'confirm-danger' : 'confirm-send'}
                disabled={Boolean(commandBusy)}
                onClick={() => runCommand(confirmCommand.command)}
              >
                {commandBusy ? 'Sending...' : `Confirm ${confirmCommand.command}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;





