import { HomeCta } from "@/components/marketing/HomeCta";
import { HomeFaq } from "@/components/marketing/HomeFaq";
import { HomeFeatures } from "@/components/marketing/HomeFeatures";
import { HomeHero } from "@/components/marketing/HomeHero";
import { HomePricing } from "@/components/marketing/HomePricing";
import { HomeProof } from "@/components/marketing/HomeProof";

export default function MarketingHomePage() {
  return (
    <>
      <HomeHero />
      <HomeProof />
      <HomeFeatures />
      <HomePricing />
      <HomeFaq />
      <HomeCta />
    </>
  );
}
