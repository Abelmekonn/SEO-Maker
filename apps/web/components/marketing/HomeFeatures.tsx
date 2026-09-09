import {
  ChartMock,
  GapsMock,
  GatewayMock,
  PagesMock,
  ScheduleMock,
} from "@/components/marketing/feature-mocks";
import { FeatureFlight } from "@/components/marketing/FeatureFlight";

const bento = [
  {
    title: "Page audits in one table",
    body: "Title, meta, H1, and word count — status on every row.",
    visual: <PagesMock />,
    span: "md:col-span-2",
  },
  {
    title: "Core Web Vitals stored",
    body: "LCP, CLS, and INP per page. You choose the PageSpeed scope.",
    visual: <ChartMock />,
    span: "md:col-span-2",
  },
  {
    title: "AI title and meta drafts",
    body: "Copy the suggestion. Ship the change. Re-audit later.",
    visual: <GatewayMock />,
    span: "md:col-span-2",
  },
  {
    title: "Automated crawl scope",
    body: "Homepage first. Add important pages when you are ready.",
    visual: <ScheduleMock />,
    span: "md:col-span-3",
  },
  {
    title: "Competitor page gaps",
    body: "Manual domains first. See pages they have that you do not.",
    visual: <GapsMock />,
    span: "md:col-span-3",
  },
];

const pills = ["Homepage first", "Scoped PageSpeed", "Manual competitors"];

export function HomeFeatures() {
  return (
    <div id="features">
      <FeatureFlight />
      
    </div>
  );
}
