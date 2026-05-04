import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/trips");
  return (
    <section className="glass rounded-2xl p-8 ring-1 ring-white/5 text-center">
      <h1 className="text-3xl font-bold mb-3">Pack smarter, not harder</h1>
      <p className="text-slate-300 max-w-xl mx-auto mb-6">
        Tell us where you're going, and we'll build a packing checklist tuned to the weather, your trip type,
        your activities, and your personal defaults — saved per user across devices.
      </p>
      <Link href="/login"
        className="inline-block px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold">
        Sign in to get started →
      </Link>
    </section>
  );
}
