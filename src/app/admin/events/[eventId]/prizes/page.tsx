import { PrizesPage } from "@/components/admin/PrizesPage";

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <PrizesPage eventId={eventId} />;
}
