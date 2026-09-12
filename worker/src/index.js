const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const PAYMENT_STATUSES = ["unpaid", "deposit", "paid_full"];
const BOOKING_STATUSES = ["pending", "confirmed", "cancelled"];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(env, origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    try {
      const url = new URL(request.url);
      const response = await routeRequest(request, env, url);
      for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
      }
      return response;
    } catch (error) {
      console.error(JSON.stringify({ event: "request_error", message: error.message }));
      const status = error instanceof HttpError ? error.status : 500;
      const message = status < 500 ? error.message : "เกิดข้อผิดพลาดภายในระบบ";
      return json({ error: message }, status, headers);
    }
  },
};

async function routeRequest(request, env, url) {
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "deepsleep456-booking-api" });
  }

  await requireAdmin(request, env);

  if (url.pathname === "/api/bookings" && request.method === "GET") {
    return listBookings(env, url.searchParams);
  }

  if (url.pathname === "/api/bookings" && request.method === "POST") {
    return createBooking(request, env);
  }

  const bookingMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if (bookingMatch && request.method === "PATCH") {
    return updateBooking(request, env, bookingMatch[1]);
  }
  if (bookingMatch && request.method === "DELETE") {
    return deleteBooking(env, bookingMatch[1]);
  }

  if (url.pathname === "/api/dashboard" && request.method === "GET") {
    return getDashboard(env, url.searchParams);
  }

  return json({ error: "ไม่พบเส้นทางที่เรียก" }, 404);
}

async function listBookings(env, params) {
  const from = params.get("from") || "1900-01-01";
  const to = params.get("to") || "2999-12-31";
  validateDateRange(from, to);
  const result = await env.DB.prepare(
    `SELECT id, customer_name, customer_phone, customer_email, check_in, check_out,
            total_amount, payment_status, status, note, created_at, updated_at
     FROM bookings
     WHERE check_in < ?2 AND check_out > ?1
     ORDER BY check_in ASC`
  ).bind(from, to).all();
  return json({ bookings: result.results || [] });
}

async function createBooking(request, env) {
  const body = await readJson(request);
  const required = ["customerName", "customerPhone", "checkIn", "checkOut"];
  if (required.some((field) => body[field] === undefined || body[field] === "")) {
    return json({ error: "กรุณากรอกชื่อ เบอร์โทร และวันที่เข้าพักให้ครบถ้วน" }, 400);
  }

  const dates = validateDateRange(body.checkIn, body.checkOut);
  const nights = dateRange(dates.checkIn, dates.checkOut);
  if (nights.length > 60) {
    return json({ error: "การจองต้องไม่เกิน 60 คืนต่อรายการ" }, 400);
  }

  const conflict = await findConflictingNights(env, nights);
  if (conflict.length) {
    return json({ error: "ช่วงวันที่เลือกมีการจองอื่นทับซ้อนอยู่แล้ว", conflictDates: conflict }, 409);
  }

  const paymentStatus = validatePaymentStatus(body.paymentStatus, "unpaid");
  const status = BOOKING_STATUSES.includes(body.status) ? body.status : "confirmed";
  const bookingId = crypto.randomUUID();

  const statements = [
    env.DB.prepare(
      `INSERT INTO bookings
       (id, customer_name, customer_phone, customer_email, check_in, check_out, total_amount, payment_status, status, note)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    ).bind(
      bookingId,
      String(body.customerName).trim().slice(0, 120),
      String(body.customerPhone).trim().slice(0, 40),
      body.customerEmail ? String(body.customerEmail).trim().slice(0, 160) : null,
      dates.checkIn,
      dates.checkOut,
      Number.isInteger(body.totalAmount) ? body.totalAmount : null,
      paymentStatus,
      status,
      body.note ? String(body.note).trim().slice(0, 1000) : null,
    ),
    ...nights.map((night) =>
      env.DB.prepare("INSERT INTO booking_nights (night_date, booking_id) VALUES (?1, ?2)").bind(night, bookingId)
    ),
  ];

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error(JSON.stringify({ event: "booking_insert_failed", bookingId, message: error.message }));
    return json({ error: "ช่วงเวลานี้เพิ่งถูกจองไปพอดี กรุณาตรวจสอบวันว่างอีกครั้ง" }, 409);
  }

  return json({ bookingId, status, checkIn: dates.checkIn, checkOut: dates.checkOut }, 201);
}

async function updateBooking(request, env, bookingId) {
  const body = await readJson(request);
  const existing = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?1").bind(bookingId).first();
  if (!existing) {
    return json({ error: "ไม่พบรายการจอง" }, 404);
  }
  if (existing.status === "cancelled" && body.status !== "cancelled") {
    return json({ error: "รายการนี้ถูกยกเลิกแล้ว ไม่สามารถแก้ไขได้" }, 409);
  }

  const dates = validateDateRange(body.checkIn || existing.check_in, body.checkOut || existing.check_out);
  const datesChanged = dates.checkIn !== existing.check_in || dates.checkOut !== existing.check_out;
  const status = body.status !== undefined ? body.status : existing.status;
  if (!BOOKING_STATUSES.includes(status)) {
    return json({ error: "สถานะการจองไม่ถูกต้อง" }, 400);
  }
  const paymentStatus = validatePaymentStatus(body.paymentStatus, existing.payment_status);

  let nights = [];
  if (status !== "cancelled" && datesChanged) {
    nights = dateRange(dates.checkIn, dates.checkOut);
    if (nights.length > 60) {
      return json({ error: "การจองต้องไม่เกิน 60 คืนต่อรายการ" }, 400);
    }
    const conflict = await findConflictingNights(env, nights, bookingId);
    if (conflict.length) {
      return json({ error: "ช่วงวันที่ใหม่มีการจองอื่นทับซ้อนอยู่", conflictDates: conflict }, 409);
    }
  }

  const statements = [];
  if (status === "cancelled") {
    statements.push(env.DB.prepare("DELETE FROM booking_nights WHERE booking_id = ?1").bind(bookingId));
  } else if (datesChanged) {
    statements.push(env.DB.prepare("DELETE FROM booking_nights WHERE booking_id = ?1").bind(bookingId));
    for (const night of nights) {
      statements.push(env.DB.prepare("INSERT INTO booking_nights (night_date, booking_id) VALUES (?1, ?2)").bind(night, bookingId));
    }
  }

  statements.push(
    env.DB.prepare(
      `UPDATE bookings
       SET customer_name = ?1, customer_phone = ?2, customer_email = ?3,
           check_in = ?4, check_out = ?5, total_amount = ?6,
           payment_status = ?7, status = ?8, note = ?9, updated_at = datetime('now')
       WHERE id = ?10`
    ).bind(
      body.customerName !== undefined ? String(body.customerName).trim().slice(0, 120) : existing.customer_name,
      body.customerPhone !== undefined ? String(body.customerPhone).trim().slice(0, 40) : existing.customer_phone,
      body.customerEmail !== undefined
        ? (body.customerEmail ? String(body.customerEmail).trim().slice(0, 160) : null)
        : existing.customer_email,
      status === "cancelled" ? existing.check_in : dates.checkIn,
      status === "cancelled" ? existing.check_out : dates.checkOut,
      body.totalAmount !== undefined ? (Number.isInteger(body.totalAmount) ? body.totalAmount : null) : existing.total_amount,
      paymentStatus,
      status,
      body.note !== undefined ? (body.note ? String(body.note).trim().slice(0, 1000) : null) : existing.note,
      bookingId,
    )
  );

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error(JSON.stringify({ event: "booking_update_failed", bookingId, message: error.message }));
    return json({ error: "บันทึกไม่สำเร็จ อาจมีการจองซ้อนทับ" }, 409);
  }

  return json({ bookingId, status });
}

async function deleteBooking(env, bookingId) {
  const existing = await env.DB.prepare("SELECT id FROM bookings WHERE id = ?1").bind(bookingId).first();
  if (!existing) {
    return json({ error: "ไม่พบรายการจอง" }, 404);
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM booking_nights WHERE booking_id = ?1").bind(bookingId),
    env.DB.prepare("DELETE FROM bookings WHERE id = ?1").bind(bookingId),
  ]);
  return json({ bookingId, status: "deleted" });
}

async function getDashboard(env, params) {
  const today = params.get("date") || new Date().toISOString().slice(0, 10);
  validateDate(today);
  const month = params.get("month") || today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new HttpError("รูปแบบเดือนต้องเป็น YYYY-MM", 400);
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const nextMonthStart = monthNumber === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;

  const [checkIns, checkOuts, revenueRows] = await Promise.all([
    env.DB.prepare(
      `SELECT id, customer_name, customer_phone, check_in, check_out, status
       FROM bookings WHERE check_in = ?1 AND status != 'cancelled' ORDER BY customer_name`
    ).bind(today).all(),
    env.DB.prepare(
      `SELECT id, customer_name, customer_phone, check_in, check_out, status
       FROM bookings WHERE check_out = ?1 AND status != 'cancelled' ORDER BY customer_name`
    ).bind(today).all(),
    env.DB.prepare(
      `SELECT total_amount, payment_status FROM bookings
       WHERE check_in >= ?1 AND check_in < ?2 AND status != 'cancelled'`
    ).bind(monthStart, nextMonthStart).all(),
  ]);

  const rows = revenueRows.results || [];
  const sumWhere = (predicate) => rows.filter(predicate).reduce((sum, row) => sum + (row.total_amount || 0), 0);
  return json({
    date: today,
    month,
    checkIns: checkIns.results || [],
    checkOuts: checkOuts.results || [],
    revenue: {
      totalAmount: sumWhere(() => true),
      paidFullAmount: sumWhere((row) => row.payment_status === "paid_full"),
      depositAmount: sumWhere((row) => row.payment_status === "deposit"),
      unpaidAmount: sumWhere((row) => row.payment_status === "unpaid"),
      bookingsCount: rows.length,
    },
  });
}

async function findConflictingNights(env, nights, excludeBookingId) {
  const placeholders = nights.map(() => "?").join(",");
  const query = excludeBookingId
    ? env.DB.prepare(`SELECT night_date FROM booking_nights WHERE night_date IN (${placeholders}) AND booking_id != ?`)
        .bind(...nights, excludeBookingId)
    : env.DB.prepare(`SELECT night_date FROM booking_nights WHERE night_date IN (${placeholders})`).bind(...nights);
  const result = await query.all();
  return (result.results || []).map((row) => row.night_date);
}

function validateDateRange(checkIn, checkOut) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn || "") || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut || "")) {
    throw new HttpError("รูปแบบวันที่ต้องเป็น YYYY-MM-DD", 400);
  }
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new HttpError("วันเช็คเอาต์ต้องอยู่หลังวันเช็คอิน", 400);
  }
  return { checkIn, checkOut };
}

function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    throw new HttpError("รูปแบบวันที่ต้องเป็น YYYY-MM-DD", 400);
  }
  return value;
}

function validatePaymentStatus(value, fallback) {
  if (value === undefined) return fallback;
  if (!PAYMENT_STATUSES.includes(value)) {
    throw new HttpError("สถานะการชำระเงินไม่ถูกต้อง", 400);
  }
  return value;
}

function dateRange(checkIn, checkOut) {
  const dates = [];
  const current = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  while (current < end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

async function requireAdmin(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!env.ADMIN_TOKEN || !(await tokensMatch(token, env.ADMIN_TOKEN))) {
    throw new HttpError("ไม่ได้รับอนุญาต", 401);
  }
}

async function tokensMatch(left, right) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(left)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] || 0) ^ (b[index] || 0);
  }
  return difference === 0;
}

async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("JSON body must be an object");
    }
    return body;
  } catch {
    throw new HttpError("ข้อมูล JSON ไม่ถูกต้อง", 400);
  }
}

// The admin page's real home is env.CORS_ORIGIN (deepsleep456.com), but while
// the custom domain is still stuck on the old GitHub repo the page is only
// reachable at the GitHub Pages URL below — allow it too so the admin UI
// isn't silently broken by CORS in the meantime.
const TEMPORARY_ALLOWED_ORIGINS = ["https://baanporjai.github.io"];

function corsHeaders(env, origin) {
  const allowedOrigin = origin === env.CORS_ORIGIN || TEMPORARY_ALLOWED_ORIGINS.includes(origin)
    ? origin
    : env.CORS_ORIGIN;
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-max-age": "86400",
  };
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
