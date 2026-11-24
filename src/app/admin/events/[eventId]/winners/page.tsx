import { WinnersPage } from "@/components/admin/WinnersPage";

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <WinnersPage eventId={eventId} />;
}
