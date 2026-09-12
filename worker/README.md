# Deepsleep456 Booking API

Cloudflare Worker + D1 backend for managing bookings of a single daily-rental
house. This is a private back-office tool for the owner/staff — every route
except `/api/health` requires the admin bearer token, there is no public
customer-facing booking flow.

## Local setup

1. Install Wrangler and authenticate with Cloudflare.
2. Apply the migration locally:

```bash
npx wrangler d1 migrations apply deepsleep456-bookings --local
```

3. Set the admin token for local dev in a `.dev.vars` file (git-ignored):

```
ADMIN_TOKEN=some-local-token
```

4. Start the Worker:

```bash
npx wrangler dev
```

## Deploy

```bash
npx wrangler d1 migrations apply deepsleep456-bookings --remote
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

## Data model

- `bookings` — one row per booking: customer name/phone/email, check-in/out
  dates, total amount, `payment_status` (`unpaid` | `deposit` | `paid_full`),
  `status` (`pending` | `confirmed` | `cancelled`), note.
- `booking_nights` — one row per reserved night (`night_date TEXT PRIMARY KEY`
  referencing `bookings.id`). Its primary key is what prevents double-booking:
  two requests racing for the same night can't both insert the same
  `night_date`, so conflict checking is safe even under concurrent requests.
  Cancelling or deleting a booking, or rescheduling it to different dates,
  releases its nights.

## API

All routes below (except `/api/health`) require `Authorization: Bearer <ADMIN_TOKEN>`.

- `GET /api/health`
- `GET /api/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD` — bookings overlapping the range (for the calendar view)
- `POST /api/bookings` — create a manual booking:
  `{ customerName, customerPhone, customerEmail?, checkIn, checkOut, totalAmount?, paymentStatus?, status?, note? }`
  Returns `409` with `conflictDates` if any night in the range is already booked.
- `PATCH /api/bookings/:id` — edit any subset of the same fields. Changing
  `checkIn`/`checkOut` reschedules the booking (re-checked for conflicts,
  excluding its own current nights). Setting `status: "cancelled"` releases
  its nights. Cancelled bookings can't be edited further except to reopen
  is not supported — create a new booking instead.
- `DELETE /api/bookings/:id` — permanently delete a booking and release its nights.
- `GET /api/dashboard?date=YYYY-MM-DD&month=YYYY-MM` — today's check-ins/check-outs
  (defaults to the current date) and a rough revenue summary for the given
  month (defaults to the month of `date`), broken down by payment status.

`paymentStatus` is one of `unpaid` | `deposit` | `paid_full`.
`status` is one of `pending` | `confirmed` | `cancelled`.

The admin UI lives at `/admin/` as a static page that stores the Worker's
URL and the admin token in `sessionStorage` and calls this API directly from
the browser. Do not put `ADMIN_TOKEN` anywhere in the public website code.
