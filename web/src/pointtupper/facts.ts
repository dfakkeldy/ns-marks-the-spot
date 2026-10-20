/**
 * The /pointtupper summary and timeline. Every line names its source, and
 * docs/point-tupper-sources.md lists the same sources with what each supports.
 * Company figures are reported as the company's own, not as checked facts.
 */

export interface SourcedLine {
  readonly label: string;
  readonly text: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
}

export interface TimelineEvent {
  readonly when: string;
  readonly text: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
}

const CP_2026_10_16 = "https://www.cp24.com/news/canada/2026/10/16/everwind-says-10b-ai-data-centre-proposal-largest-private-investment-in-ns-history/";
const IESO_OUTLOOK_2026 = "https://www.ieso-ns.ca/wp-content/uploads/2026/09/20260628-IESO-NS-2026-10-Year-System-Outlook.pdf";

export const POINT_TUPPER_FACTS: readonly SourcedLine[] = [
  {
    label: "Announced",
    text: "October 16, 2026, by EverWind: a data-centre campus at Point Tupper, with Anthropic as tenant on a 20-year lease.",
    sourceLabel: "The Canadian Press",
    sourceUrl: CP_2026_10_16,
  },
  {
    label: "Size",
    text: "95 MW in late 2027. A 325 MW expansion is expected in mid-2028, for 420 MW in all.",
    sourceLabel: "The Canadian Press",
    sourceUrl: CP_2026_10_16,
  },
  {
    label: "Grid",
    text: "Starts on the existing grid, with about 200 MWh of batteries on site. EverWind says the grid operator's study found the existing infrastructure can support it.",
    sourceLabel: "The Canadian Press",
    sourceUrl: CP_2026_10_16,
  },
  {
    label: "Under study",
    text: "IESO Nova Scotia lists large loads of 325, 95 and 230 MW under study in Richmond County. It does not name the customers.",
    sourceLabel: "IESO Nova Scotia, 2026 outlook, Table 8",
    sourceUrl: IESO_OUTLOOK_2026,
  },
  {
    label: "Water",
    text: "Closed-loop cooling from Landrie Lake: about 100,000 litres a day at first and 500,000 after expansion, by the company's figures.",
    sourceLabel: "The Canadian Press",
    sourceUrl: CP_2026_10_16,
  },
  {
    label: "Wind",
    text: "Four EverWind wind farms on the mainland have environmental approval, 650 MW in all, 51% owned by a Membertou-led First Nations consortium. They will not be ready when the campus opens.",
    sourceLabel: "The Canadian Press",
    sourceUrl: CP_2026_10_16,
  },
  {
    label: "Costs",
    text: "EverWind says it will pay the connection and network-upgrade costs so they are not passed on to ratepayers.",
    sourceLabel: "The Canadian Press",
    sourceUrl: CP_2026_10_16,
  },
];

export const POINT_TUPPER_TIMELINE: readonly TimelineEvent[] = [
  {
    when: "1955",
    text: "The Canso Causeway opens.",
    sourceLabel: "Library and Archives Canada",
    sourceUrl: "https://epe.lac-bac.gc.ca/100/205/301/ic/cdc/cansocauseway/historical.htm",
  },
  {
    when: "Early 1960s",
    text: "The pulp mill at Point Tupper starts production.",
    sourceLabel: "Acadiensis",
    sourceUrl: "https://journals.lib.unb.ca/index.php/Acadiensis/article/download/11888/12732",
  },
  {
    when: "1969",
    text: "The Province builds the Landrie Lake water system for Point Tupper industry.",
    sourceLabel: "Landrie Lake Water Utility EA registration",
    sourceUrl: "https://novascotia.ca/nse/ea/little-river-pumping-transmission-system/little-river-ea-registration-document.pdf",
  },
  {
    when: "1970–1985",
    text: "The heavy water plant operates.",
    sourceLabel: "House of Commons Debates",
    sourceUrl: "https://parl.canadiana.ca/view/oop.debates_HOC2701_01/316",
  },
  {
    when: "1971–1980",
    text: "Gulf's refinery operates. Its tanks and jetty carry on as an oil terminal.",
    sourceLabel: "OSTI record",
    sourceUrl: "https://www.osti.gov/etdeweb/biblio/6481353",
  },
  {
    when: "2003–2022",
    text: "Bear Head LNG is proposed as an import, then an export terminal. It never operates.",
    sourceLabel: "Nova Scotia EA file",
    sourceUrl: "https://novascotia.ca/nse/ea/bearHeadLNGTerminal.asp",
  },
  {
    when: "2012",
    text: "The mill restarts as Port Hawkesbury Paper.",
    sourceLabel: "NAFTA tribunal award, Resolute v. Canada",
    sourceUrl: "https://www.italaw.com/sites/default/files/case-documents/italaw170763.pdf",
  },
  {
    when: "2022",
    text: "EverWind registers its green hydrogen and ammonia project at Point Tupper.",
    sourceLabel: "Nova Scotia EA file",
    sourceUrl: "https://novascotia.ca/nse/ea/everwind-point-tupper-green-hydrogen-ammonia-project/",
  },
  {
    when: "2026",
    text: "The data-centre campus is announced.",
    sourceLabel: "The Canadian Press",
    sourceUrl: CP_2026_10_16,
  },
];
