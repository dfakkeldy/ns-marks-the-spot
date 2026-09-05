import "./PokerMapTools.css";
import L from "leaflet";
import { useEffect, useState } from "react";
import { CircleMarker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import {
  CIVIC_ADDRESS_DATASET_URL,
  fetchViewportCivicAddresses,
  type CivicAddress,
} from "../services/civicAddresses";

export interface PokerSession {
  address: CivicAddress | null;
  revision: number;
  aerial: boolean;
  message: string | null;
  onAerialChange: () => void;
  onNext: () => void;
}

export function PokerMapTools({ session }: { session: PokerSession }) {
  const map = useMap();
  const [numbers, setNumbers] = useState(true);
  const [viewport, setViewport] = useState(0);
  const [reading, setReading] = useState<Awaited<ReturnType<typeof fetchViewportCivicAddresses>> | null>(null);
  const [status, setStatus] = useState("Zoom in to see civic numbers.");
  useMapEvents({ movestart: () => { setReading(null); setViewport((value) => value + 1); }, moveend: () => setViewport((value) => value + 1) });

  useEffect(() => {
    if (!session.address) return;
    const [lng, lat] = session.address.coordinates;
    map.setView([lat, lng], 18);
  }, [map, session.address, session.revision]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setReading(null);
      if (!numbers) {
        setStatus("Civic numbers off.");
        return;
      }
      if (map.getZoom() < 16) {
        setStatus("Zoom to level 16 or closer to see civic numbers.");
        return;
      }
      const bounds = map.getBounds();
      setStatus("Loading civic numbers…");
      void fetchViewportCivicAddresses({ north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() }, controller.signal)
        .then((value) => {
          if (controller.signal.aborted) return;
          setReading(value);
          setStatus(value.truncated ? "Showing up to 500 civic points. Zoom in for the rest."
            : value.unreadableRows ? `${value.unreadableRows} civic points could not be read.`
            : value.addresses.length ? `${value.addresses.length} mapped civic ${value.addresses.length === 1 ? "point" : "points"}.` : "No civic points returned for this view.");
        })
        .catch(() => { if (!controller.signal.aborted) setStatus("Civic numbers unavailable. Pan or toggle numbers to retry."); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [map, viewport, numbers]);

  return <>
    <section className="poker-map-tools" aria-label="Poker route measurements" ref={(node) => {
      if (node) { L.DomEvent.disableClickPropagation(node); L.DomEvent.disableScrollPropagation(node); }
    }}>
      <strong>Poker</strong>
      <p>{session.address?.label ?? "Search a civic address to begin."}</p>
      <p>Click the house, then along the driveway to your route. Finish to read the total.</p>
      <div className="poker-buttons">
        <button type="button" aria-pressed={session.aerial} onClick={session.onAerialChange}>Aerial {session.aerial ? "on" : "off"}</button>
        <button type="button" aria-pressed={numbers} onClick={() => setNumbers((value) => !value)}>Civic numbers {numbers ? "on" : "off"}</button>
        <button type="button" onClick={session.onNext}>Next address</button>
      </div>
      {session.message && <p role="status">{session.message}</p>}
      <small role="status">{status}</small>
      <small><a href={CIVIC_ADDRESS_DATASET_URL} target="_blank" rel="noreferrer">Nova Scotia Civic Address File</a>. Points may not mark the house. Distances follow your clicks.</small>
    </section>
    {numbers && reading?.addresses.map((address) => <CircleMarker
      key={address.pntid} center={[address.coordinates[1], address.coordinates[0]]}
      radius={2} pathOptions={{ color: "#173a4a", fillColor: "#fff", fillOpacity: 1, weight: 1 }} interactive={false}
    >
      <Tooltip permanent direction="top" offset={[0, -2]} className="poker-civic-number" opacity={1}>
        {String(address.properties.civicnum ?? "")}{String(address.properties.civsuffix ?? "")}
      </Tooltip>
    </CircleMarker>)}
    {session.address && <CircleMarker center={[session.address.coordinates[1], session.address.coordinates[0]]} radius={7}
      pathOptions={{ color: "#b73324", fillOpacity: 0, weight: 3 }} interactive={false} />}
  </>;
}
