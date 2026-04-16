import { useState, useEffect } from 'react';
import { TelemetryRegistry } from '../../engine/debug/TelemetryRegistry';

export function useTelemetry(pollingRate = 10) {
  const [data, setData] = useState<Record<string, number>>({});

  useEffect(() => {
    const registry = TelemetryRegistry.getInstance();
    const interval = 1000 / pollingRate;

    const poller = setInterval(() => {
      const ids = registry.getAllRegisteredIds();
      const newData: Record<string, number> = {};
      ids.forEach((id) => {
        newData[id] = registry.getEma(id);
      });
      setData(newData);
    }, interval);

    return () => clearInterval(poller);
  }, [pollingRate]);

  return data;
}
