/**
 * The /pointtupper summary and timeline. Every line names its source, and
 * docs/point-tupper-sources.md lists the same sources with what each supports.
 * Company figures are reported as the company's own, not as checked facts.
 */

export interface SourcedNote {
  readonly text: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
}

export interface SourcedLine {
  readonly label: string;
  readonly text: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
  /** A qualification from a different source, shown after the line's own source. */
  readonly note?: SourcedNote;
}

export interface TimelineEvent {
  readonly when: string;
  readonly text: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
}

export interface FactGroup {
  readonly title: string;
  readonly facts: readonly SourcedLine[];
}

/** The day every source behind the summary was last re-read. */
export const POINT_TUPPER_CHECKED = { iso: "2026-11-05", text: "November 5, 2026" } as const;

const CP_2026_10_16 = "https://www.cp24.com/news/canada/2026/10/16/everwind-says-10b-ai-data-centre-proposal-largest-private-investment-in-ns-history/";
const EVERWIND_CAMPUS = "https://everwinddc.com/";
const MEMBERTOU_2026_10_20 = "https://membertou.ca/membertou-community-update-on-partnership-with-everwind-fuels/";
const GLOBAL_2026_10_19 = "https://globalnews.ca/news/12107998/backlash-nova-scotia-ai-data-centre-point-tupper/";
const CBC_2026_10_20 = "https://www.cbc.ca/news/canada/nova-scotia/government-data-centre-everwind-anthropic-scott-armstrong-tim-houston-claudia-chender-tim-halman-9.7388702";
const IESO_OUTLOOK_2026 = "https://www.ieso-ns.ca/wp-content/uploads/2026/09/20260628-IESO-NS-2026-10-Year-System-Outlook.pdf";
const NRCAN_WIND_TURBINES = "https://open.canada.ca/data/en/dataset/79fdad93-9025-49ad-ba16-c26d718cc070";
const PLANNED_WIND_SOURCES = "https://github.com/dfakkeldy/ns-marks-the-spot/blob/nightly/docs/planned-wind-turbines-sources.md";

/**
 * Two groups, kept apart on purpose: what the company says it will do, and
 * what records and reporting outside the company show.
 */
export const POINT_TUPPER_FACT_GROUPS: readonly FactGroup[] = [
  {
    title: "What EverWind says",
    facts: [
      {
        label: "Announced",
        text: "October 16, 2026: a data-centre campus at its Point Tupper industrial site, with Anthropic as tenant on a 20-year lease.",
        sourceLabel: "The Canadian Press",
        sourceUrl: CP_2026_10_16,
      },
      {
        label: "Size",
        text: "95 MW, targeted for late 2027, then 325 MW more from 2028: 420 MW in all. The expansion still needs new grid studies, transmission and tariff approvals.",
        sourceLabel: "EverWind's campus site",
        sourceUrl: EVERWIND_CAMPUS,
      },
      {
        label: "Grid",
        text: "Phase 1 would draw from the existing grid through the terminal's 138 kV service, as load that can be cut on ten minutes' notice, backed by batteries and diesel generators. EverWind says its grid studies are done and that it will pay the connection and upgrade costs.",
        sourceLabel: "EverWind's campus site",
        sourceUrl: EVERWIND_CAMPUS,
      },
      {
        label: "Water",
        text: "Closed-loop cooling from Landrie Lake: about 100,000 litres a day at first and 500,000 at full build-out.",
        sourceLabel: "EverWind's campus site",
        sourceUrl: EVERWIND_CAMPUS,
      },
      {
        label: "Wind",
        text: "Four mainland wind farms, more than 650 MW, expected in 2028 and 2029, after the campus opens. A Membertou-led Mi'kmaw consortium is to hold 51% at financial close.",
        sourceLabel: "EverWind's campus site",
        sourceUrl: EVERWIND_CAMPUS,
        note: {
          text: "Two of the four, Bear Lake and Kmtnuk, passed their December 2025 deadlines to start work with no extension posted, so this map leaves them off.",
          sourceLabel: "Nova Scotia EA filings, compiled for this map",
          sourceUrl: `${PLANNED_WIND_SOURCES}#approval-possibly-lapsed-kept-off-the-map`,
        },
      },
    ],
  },
  {
    title: "On the public record",
    facts: [
      {
        label: "Under study",
        text: "IESO Nova Scotia lists large loads of 325, 95 and 230 MW under study in Richmond County. It does not name the customers.",
        sourceLabel: "IESO Nova Scotia, 2026 outlook, Table 8",
        sourceUrl: IESO_OUTLOOK_2026,
      },
      {
        label: "Permits",
        text: "On October 19 the county warden said no building permit application had been submitted.",
        sourceLabel: "Global News",
        sourceUrl: GLOBAL_2026_10_19,
        note: {
          text: "The next day the environment minister said EverWind had applied for an industrial approval for diesel generators.",
          sourceLabel: "CBC News",
          sourceUrl: CBC_2026_10_20,
        },
      },
      {
        label: "Partners",
        text: "Membertou said on October 20 that it is not partnered on the data centre and has not invested.",
        sourceLabel: "Membertou",
        sourceUrl: MEMBERTOU_2026_10_20,
        note: {
          text: "EverWind says it is negotiating a stake in the campus for a consortium led by Membertou Development Corporation.",
          sourceLabel: "EverWind's campus site",
          sourceUrl: EVERWIND_CAMPUS,
        },
      },
      {
        label: "Turbines",
        text: "The Point Tupper wind farm already stands just east of the terminal: 12 Enercon turbines, 22.8 MW in all, one from 2006 and eleven from 2010.",
        sourceLabel: "NRCan, Canadian Wind Turbine Database",
        sourceUrl: NRCAN_WIND_TURBINES,
      },
      {
        label: "Planned wind",
        text: "Six wind farms with turbines within 45 km have environmental approval, and one, Goose Harbour Lake, is under construction: up to 2,229 MW from 285 turbines in their filed layouts, the nearest about 4 km from Point Tupper.",
        sourceLabel: "Nova Scotia EA filings, compiled for this map",
        sourceUrl: PLANNED_WIND_SOURCES,
      },
    ],
  },
];

/** Every summary line, in page order. */
export const POINT_TUPPER_FACTS: readonly SourcedLine[] = POINT_TUPPER_FACT_GROUPS.flatMap(({ facts }) => facts);

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
    text: "EverWind announces the data-centre campus.",
    sourceLabel: "The Canadian Press",
    sourceUrl: CP_2026_10_16,
  },
];
