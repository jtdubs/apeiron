import { useStore } from 'zustand';
import { viewportStore } from './stores/viewportStore';
import { ApeironViewport } from './components/ApeironViewport';
import { ApeironHUD } from './components/ApeironHUD';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import './App.css';

function App() {
  const isTelemetryOpen = useStore(viewportStore, (s) => s.isTelemetryOpen);
  const telemetryDock = useStore(viewportStore, (s) => s.telemetryDock);

  return (
    <div className={`app-container dock-${telemetryDock}`}>
      <div className="scene-container">
        <ApeironViewport />
        <ApeironHUD />
      </div>
      {isTelemetryOpen && <TelemetryDashboard />}
    </div>
  );
}

export default App;
