import { ApeironViewport } from './components/ApeironViewport';
import { ApeironHUD } from './components/ApeironHUD';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import './App.css';

function App() {
  return (
    <>
      <ApeironViewport />
      <ApeironHUD />
      <TelemetryDashboard />
    </>
  );
}

export default App;
