import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export default async function Home() {
  const admin = await requireAdmin();
  redirect(admin ? "/admin/events" : "/login");
}
