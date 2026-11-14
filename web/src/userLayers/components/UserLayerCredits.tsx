import type { VisibleUserLayer } from "./UserTileLayers";
export function UserLayerCredits({ layers }: { layers: VisibleUserLayer[] }) {
  if (!layers.length) return null;
  return <section className="collar-group"><p className="collar-licence">Your layers</p><ul>{layers.map(({ record }) => <li key={record.id}>Your layer: {record.attribution}</li>)}</ul></section>;
}
