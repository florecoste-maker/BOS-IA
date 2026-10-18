import { getTidyCalServerConfig } from "./config";

const TIDYCAL_API = "https://tidycal.com/api";

export type TidyCalBooking = {
  id: number;
  contact_id: number;
  booking_type_id: number;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
  timezone: string;
  meeting_url?: string | null;
  contact?: {
    id: number;
    name: string;
    email: string;
    phone_number?: string | null;
    timezone?: string;
  };
};

export type TidyCalBookingType = {
  id: number;
  title: string;
  duration_minutes?: number;
  url_slug?: string;
};

async function tidycalFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const { apiToken } = getTidyCalServerConfig();
  if (!apiToken) {
    return {
      ok: false,
      status: 503,
      error:
        "TidyCal non configuré : ajoutez TIDYCAL_API_TOKEN (Integrations → Advanced → Personal tokens).",
    };
  }

  const res = await fetch(`${TIDYCAL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      error: body || `Erreur TidyCal HTTP ${res.status}`,
    };
  }

  const data = (await res.json()) as T;
  return { ok: true, data };
}

export async function listTidyCalBookings(params?: {
  startsAt?: string;
  endsAt?: string;
  cancelled?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.startsAt) query.set("starts_at", params.startsAt);
  if (params?.endsAt) query.set("ends_at", params.endsAt);
  if (params?.cancelled != null) query.set("cancelled", String(params.cancelled));
  const qs = query.toString();
  return tidycalFetch<{ data: TidyCalBooking[] }>(
    `/bookings${qs ? `?${qs}` : ""}`,
  );
}

export async function listTidyCalBookingTypes() {
  return tidycalFetch<{ data: TidyCalBookingType[] }>("/booking-types");
}

export async function listTidyCalTimeslots(params: {
  bookingTypeId: string;
  startsAt: string;
  endsAt: string;
}) {
  const query = new URLSearchParams({
    starts_at: params.startsAt,
    ends_at: params.endsAt,
  });
  return tidycalFetch<{ data: Array<{ starts_at: string }> }>(
    `/booking-types/${params.bookingTypeId}/timeslots?${query}`,
  );
}

export async function createTidyCalBooking(input: {
  bookingTypeId: string;
  startsAt: string;
  name: string;
  email: string;
  timezone: string;
}) {
  return tidycalFetch<{ data: TidyCalBooking }>(
    `/booking-types/${input.bookingTypeId}/bookings`,
    {
      method: "POST",
      body: JSON.stringify({
        starts_at: input.startsAt,
        name: input.name,
        email: input.email,
        timezone: input.timezone,
      }),
    },
  );
}

export async function probeTidyCalConnection() {
  const config = getTidyCalServerConfig();
  if (!config.hasApiAccess) {
    return {
      connected: false as const,
      reason: "missing_token" as const,
      message: "Aucun jeton API TidyCal.",
    };
  }

  const result = await listTidyCalBookingTypes();
  if (!result.ok) {
    return {
      connected: false as const,
      reason: "api_error" as const,
      message: result.error,
      status: result.status,
    };
  }

  return {
    connected: true as const,
    bookingTypes: result.data.data?.length ?? 0,
    bookingUrl: config.bookingUrl,
  };
}
