import { HomeCta } from "@/components/marketing/HomeCta";
import { HomeFaq } from "@/components/marketing/HomeFaq";
import { HomeFeatures } from "@/components/marketing/HomeFeatures";
import { HomeHero } from "@/components/marketing/HomeHero";
import { HomePricing } from "@/components/marketing/HomePricing";
import { HomeProcess } from "@/components/marketing/HomeProcess";
import { HomeProof } from "@/components/marketing/HomeProof";

export default function MarketingHomePage() {
  return (
    <div className="space-y-24">
      <HomeHero />
      <HomeProof />
      <HomeFeatures />
      <HomeProcess />
      <HomePricing />
      <HomeFaq />
      <HomeCta />
    </div>
  );
}
