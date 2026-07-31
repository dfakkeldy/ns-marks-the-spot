import { landscapeTemplate } from "./landscape";
import { portraitTemplate } from "./portrait";
import type { PdfTemplate, PdfTemplateId } from "./types";

export const pdfTemplates: Record<PdfTemplateId, PdfTemplate> = {
  portrait: portraitTemplate,
  landscape: landscapeTemplate,
};

export function templateForOrientation(id: PdfTemplateId): PdfTemplate {
  return pdfTemplates[id];
}
