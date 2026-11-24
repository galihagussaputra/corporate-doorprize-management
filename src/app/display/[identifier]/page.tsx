import type { Metadata } from "next";
import { DisplayStage } from "@/components/display/DisplayStage";

export const metadata: Metadata = {
  title: "Live results",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  return <DisplayStage identifier={identifier} />;
}
