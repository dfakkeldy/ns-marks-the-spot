import "./PokerMapTools.css";
import L from "leaflet";
import { useEffect, useState } from "react";
import { CircleMarker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import {
  fetchViewportCivicAddresses,
  type CivicAddress,
} from "../services/civicAddresses";

export interface PokerSession {
  address: CivicAddress | null;
  revision: number;
  onCivicStatusChange: (status: string) => void;
}

export function PokerMapTools({ session }: { session: PokerSession }) {
  const map = useMap();
  const { onCivicStatusChange } = session;
  const [viewport, setViewport] = useState(0);
  const [reading, setReading] = useState<Awaited<ReturnType<typeof fetchViewportCivicAddresses>> | null>(null);
  const [status, setStatus] = useState("Zoom in to see civic numbers.");
  useMapEvents({ movestart: () => { setReading(null); setViewport((value) => value + 1); }, moveend: () => setViewport((value) => value + 1) });

  useEffect(() => {
    if (!session.address) return;
    const [lng, lat] = session.address.coordinates;
    map.setView([lat, lng], 18);
    // Centre the selected point in the exposed phone map, rather than under
    // the dock. Reframe on rotation/keyboard dismissal, never on user pans.
    const frameAddress = () => {
      if (!window.matchMedia("(max-width: 860px)").matches) return;
      const dock = map.getContainer().querySelector(".poker-workspace")?.getBoundingClientRect();
      if (!dock || dock.height === 0) return;
      const bounds = map.getContainer().getBoundingClientRect();
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      const target = L.point(
        landscape ? (dock.left - bounds.left + 60) / 2 : bounds.width / 2,
        landscape ? (100 + dock.bottom - bounds.top) / 2 : (100 + dock.top - bounds.top) / 2,
      );
      const point = map.latLngToContainerPoint([lat, lng]);
      map.panBy(point.subtract(target), { animate: false });
    };
    const frame = requestAnimationFrame(frameAddress);
    map.on("resize", frameAddress);
    return () => { cancelAnimationFrame(frame); map.off("resize", frameAddress); };
  }, [map, session.address, session.revision]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setReading(null);
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
        .catch(() => { if (!controller.signal.aborted) setStatus("Civic numbers unavailable. Pan to retry."); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [map, viewport]);

  useEffect(() => {
    onCivicStatusChange(status);
  }, [onCivicStatusChange, status]);

  return <>
    {reading?.addresses.map((address) => <CircleMarker
      key={address.pntid} center={[address.coordinates[1], address.coordinates[0]]}
      radius={2} pathOptions={{ color: "#173a4a", fillColor: "#fff", fillOpacity: 1, weight: 1 }} interactive={false}
    >
      <Tooltip permanent direction="top" offset={[0, -2]} className="poker-civic-number" opacity={1}>
        {String(address.properties.civicnum ?? "")}{String(address.properties.civsuffix ?? "")}
      </Tooltip>
    </CircleMarker>)}
    {session.address && <CircleMarker center={[session.address.coordinates[1], session.address.coordinates[0]]} radius={7}
      pathOptions={{ className: "poker-selected-address", color: "#b73324", fillOpacity: 0, weight: 3 }} interactive={false} />}
  </>;
}
