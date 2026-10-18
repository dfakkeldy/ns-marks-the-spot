import type { ReactNode, Ref } from "react";
import type { LayerCategoryId } from "../layers/layerCategories";

export interface LayerCategorySectionProps {
  id: LayerCategoryId;
  name: string;
  description: string;
  summary: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  buttonRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

export function LayerCategorySection({
  id,
  name,
  description,
  summary,
  expanded,
  onExpandedChange,
  buttonRef,
  children,
}: LayerCategorySectionProps) {
  const buttonId = `layer-category-${id}-button`;
  const panelId = `layer-category-${id}-panel`;

  return (
    <section className="layer-category" data-category-id={id}>
      <h3>
        <button
          ref={buttonRef}
          id={buttonId}
          type="button"
          className="layer-category-heading"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => onExpandedChange(!expanded)}
        >
          <span>{name}</span>
          <span className="layer-category-summary">{summary}</span>
        </button>
      </h3>
      {expanded ? (
        <div
          id={panelId}
          className="layer-category-panel"
          role="region"
          aria-labelledby={buttonId}
        >
          <p className="layer-category-description">{description}</p>
          {children}
        </div>
      ) : null}
    </section>
  );
}
