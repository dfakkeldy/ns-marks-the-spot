import { unavailableLayers, unavailableReasonLabels } from "../layers/unavailableLayers";

export function UnavailableLayers() {
  return (
    <details className="resource-layer-group unavailable-layers">
      <summary>
        Unavailable layers
        <small>{unavailableLayers.length} layers · information only</small>
      </summary>
      <p>These layers stay off the map and out of exports.</p>
      <ul>
        {unavailableLayers.map(layer => (
          <li key={layer.id} aria-disabled="true">
            <strong>{layer.name}</strong>
            <span className="unavailable-layer-reason">{unavailableReasonLabels[layer.reason]}</span>
            <p>{layer.detail}</p>
          </li>
        ))}
      </ul>
      <p>Source: Nova Scotia Department of Natural Resources.</p>
    </details>
  );
}
