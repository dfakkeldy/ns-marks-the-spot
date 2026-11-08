import { atlasPalettes } from "../atlas/palette";
import type { BasemapPreference, BasemapStyle } from "../atlas/basemap";

const ROOMS: readonly (readonly [style: BasemapStyle, label: string])[] = [
  ["day", "Day"],
  ["night", "Night"],
  ["fletcher", "Fletcher"],
  ["handdrawn", "Hand-drawn"],
  ["osm", "OpenStreetMap"],
];

/**
 * A key of the room in its own colours (atlas/palette.ts): land, wood, water
 * and a road. OpenStreetMap's colours are not ours to sample, so its key is a
 * neutral one. The shape is decoration; it is not a piece of any real map.
 */
function RoomSwatch({ style }: { style: BasemapStyle }) {
  const palette = style === "osm"
    ? { land: "#e8e8e8", wood: "#d9d9d9", water: "#c9c9c9", road: "#ffffff", roadEdge: "#a8a8a8" }
    : atlasPalettes[style];
  return (
    <svg className="basemap-room-swatch" viewBox="0 0 60 24" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="60" height="24" fill={palette.land} />
      <path d="M0 0h20c-3 6-10 8-20 9z" fill={palette.wood} />
      <path d="M60 24H30c4-7 11-9 16-12 5-2 9-6 14-7z" fill={palette.water} />
      <path d="M-2 19C10 14 20 15 29 8S44 0 48-2" fill="none" stroke={palette.roadEdge} strokeWidth="3.5" />
      <path d="M-2 19C10 14 20 15 29 8S44 0 48-2" fill="none" stroke={palette.road} strokeWidth="2" />
    </svg>
  );
}

/** One control for one question: which map is underneath. */
export function BasemapRooms({ preference, style, onChange }: {
  preference: BasemapPreference;
  style: BasemapStyle;
  onChange: (preference: BasemapPreference) => void;
}) {
  return (
    <div className="basemap-rooms-control">
      <span className="basemap-rooms-label" aria-hidden="true">Map style</span>
      <div className="basemap-rooms" role="radiogroup" aria-label="Map style">
        {ROOMS.map(([room, label]) => (
          <label key={room} className={style === room ? "selected" : undefined}>
            <input type="radio" name="basemap-room" value={room}
              checked={style === room} onChange={() => onChange(room)} />
            <RoomSwatch style={room} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {preference === "system"
        ? <small className="basemap-rooms-follow">Day or Night follows your device.</small>
        : <button type="button" className="text-button basemap-rooms-follow" onClick={() => onChange("system")}>Follow my device for Day or Night</button>}
    </div>
  );
}
