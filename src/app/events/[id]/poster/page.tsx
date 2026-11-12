import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import logo from "@/assets/brand/logo.jpg";
import { SiteFooter, SiteHeader } from "@/components/site";
import { getClubData } from "@/lib/club-data";
import { eventHref } from "@/lib/event-format";
import type { PosterData } from "@/lib/canvas/poster";
import { requireOperator } from "@/server/auth/viewer";
import { PosterStudio } from "./poster-studio";

export const metadata: Metadata = { title: "Make a poster", robots: { index: false } };

export default function PosterPage({ params }: PageProps<"/events/[id]/poster">) {
  return (
    <>
      <SiteHeader current="events" />
      <main className="paper flex-1">
        <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">Moon poster</p>
          <h1 className="mt-1.5 font-display text-[44px] font-extrabold uppercase leading-[0.9] text-midnight">Make a poster</h1>
          <Suspense fallback={<div className="mt-6 aspect-[3/4] w-full max-w-[420px] animate-pulse rounded-md bg-ivory/60" />}>
            <Poster params={params} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function Poster({ params }: Pick<PageProps<"/events/[id]/poster">, "params">) {
  const { id } = await params;
  await requireOperator(`/events/${id}/poster`);
  const event = (await getClubData()).events.find((e) => e.id === id || e.id === safeDecode(id));
  if (!event) notFound();

  // Only public fields, exactly as the site shows them; nothing is invented.
  const data: PosterData = {
    title: event.title,
    category: event.category,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    location: event.location,
    fee: event.fee,
    notes: event.notes,
    canceled: event.status === "canceled",
  };

  return (
    <div className="mt-6">
      <p className="mb-5 text-[15px] text-ink-soft">
        <Link href={eventHref(event)} className="font-semibold text-midnight underline underline-offset-4">
          {event.title}
        </Link>
        의 공개 정보로 만든 포스터예요. 규격을 고르고 저장하세요.
      </p>
      <PosterStudio data={data} fileBase={`aftermoon-${event.id}`} logoSrc={logo.src} />
    </div>
  );
}
