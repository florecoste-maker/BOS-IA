import { NextResponse } from "next/server";
import { getTidyCalPublicConfig, getTidyCalServerConfig } from "@/lib/integrations/config";
import {
  createTidyCalBooking,
  listTidyCalBookings,
  listTidyCalBookingTypes,
  listTidyCalTimeslots,
} from "@/lib/integrations/tidycal";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") ?? "bookings";

  if (view === "public") {
    return NextResponse.json({
      ...getTidyCalPublicConfig(),
      configured: Boolean(getTidyCalPublicConfig().bookingUrl),
    });
  }

  if (view === "types") {
    const result = await listTidyCalBookingTypes();
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.data);
  }

  if (view === "timeslots") {
    const config = getTidyCalServerConfig();
    const bookingTypeId =
      searchParams.get("bookingTypeId") ?? config.bookingTypeId;
    const startsAt = searchParams.get("starts_at");
    const endsAt = searchParams.get("ends_at");

    if (!bookingTypeId || !startsAt || !endsAt) {
      return NextResponse.json(
        {
          error:
            "Paramètres requis : bookingTypeId (ou TIDYCAL_BOOKING_TYPE_ID), starts_at, ends_at",
        },
        { status: 400 },
      );
    }

    const result = await listTidyCalTimeslots({
      bookingTypeId,
      startsAt,
      endsAt,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.data);
  }

  const result = await listTidyCalBookings({
    startsAt: searchParams.get("starts_at") ?? undefined,
    endsAt: searchParams.get("ends_at") ?? undefined,
    cancelled:
      searchParams.get("cancelled") != null
        ? searchParams.get("cancelled") === "true"
        : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

export async function POST(request: Request) {
  const config = getTidyCalServerConfig();
  const body = (await request.json()) as {
    bookingTypeId?: string;
    startsAt: string;
    name: string;
    email: string;
    timezone: string;
  };

  const bookingTypeId = body.bookingTypeId ?? config.bookingTypeId;
  if (!bookingTypeId) {
    return NextResponse.json(
      {
        error:
          "TIDYCAL_BOOKING_TYPE_ID manquant (ou passez bookingTypeId dans le corps).",
      },
      { status: 400 },
    );
  }

  if (!body.startsAt || !body.name || !body.email || !body.timezone) {
    return NextResponse.json(
      { error: "Champs requis : startsAt, name, email, timezone" },
      { status: 400 },
    );
  }

  const result = await createTidyCalBooking({
    bookingTypeId,
    startsAt: body.startsAt,
    name: body.name,
    email: body.email,
    timezone: body.timezone,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 201 });
}
