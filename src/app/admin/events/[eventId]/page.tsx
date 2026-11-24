import { Dashboard } from "@/components/admin/Dashboard";

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <Dashboard eventId={eventId} />;
}
