import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import SettingsForm from "./SettingsForm";
import { SEED_DEFAULTS } from "@/lib/seed-defaults";
import type { DefaultItem } from "@/lib/types";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/login");

  const defaults: DefaultItem[] = safeParse(user.defaults, []);
  return (
    <SettingsForm
      email={user.email || ""}
      name={user.name || ""}
      unitSystem={(user.unitSystem as any) || "imperial"}
      defaults={defaults}
      seedTemplate={SEED_DEFAULTS}
    />
  );
}

function safeParse<T>(s: string | null | undefined, fb: T): T {
  try { return s ? JSON.parse(s) : fb; } catch { return fb; }
}
