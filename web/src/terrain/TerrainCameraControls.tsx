import { useEffect, useId, useState } from 'react';
import type { Map } from 'maplibre-gl';

/** Keep camera readouts local so dragging the map does not rerender its layers. */
export function TerrainCameraControls({ map }: { map: Map }) {
  const id = useId();
  const [camera, setCamera] = useState(() => ({ pitch: Math.round(map.getPitch()), bearing: Math.round(map.getBearing()) }));
  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const pitch = Math.round(map.getPitch()), bearing = Math.round(map.getBearing());
        setCamera(previous => previous.pitch === pitch && previous.bearing === bearing ? previous : { pitch, bearing });
      });
    };
    map.on('move', update);
    return () => { map.off('move', update); cancelAnimationFrame(frame); };
  }, [map]);
  return <div className="terrain-camera-controls">
    <label htmlFor={`${id}-tilt`}><span>Tilt</span><output>{camera.pitch}°</output>
      <input id={`${id}-tilt`} aria-label="Map tilt" type="range" min="0" max="65" step="1" value={camera.pitch}
        onChange={event => map.easeTo({ pitch: Number(event.target.value), duration: 100 })} />
    </label>
    <div className="terrain-bearing">Direction <output>{(camera.bearing + 360) % 360}°</output></div>
    <div className="terrain-rotate-buttons">
      <button type="button" aria-label="Rotate left" onClick={() => map.easeTo({ bearing: map.getBearing() - 30, duration: 150 })}>↶</button>
      <button type="button" onClick={() => map.easeTo({ bearing: 0, duration: 150 })}>North up</button>
      <button type="button" aria-label="Rotate right" onClick={() => map.easeTo({ bearing: map.getBearing() + 30, duration: 150 })}>↷</button>
    </div>
    <small>0° tilt looks straight down.</small>
  </div>;
}
