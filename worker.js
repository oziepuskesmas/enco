/**
 * ENCO Mobile - Cloudflare Worker API Backend
 * Deploy to Cloudflare Workers with Cloudflare D1 binding "DB"
 */

const PLANS = {
  free_trial: {
    code: "free_trial",
    name: "Free (Trial 3 Hari)",
    durationDays: 3,
    price: 0,
    isTrial: true
  },
  pro_mingguan: {
    code: "pro_mingguan",
    name: "Pro Mingguan (7 Hari)",
    durationDays: 7,
    price: 25000,
    isTrial: false
  },
  pro_bulanan: {
    code: "pro_bulanan",
    name: "Pro Bulanan (30 Hari)",
    durationDays: 30,
    price: 78000,
    isTrial: false
  },
  pro_tahunan: {
    code: "pro_tahunan",
    name: "Pro Tahunan (365 Hari)",
    durationDays: 365,
    price: 750000,
    isTrial: false
  }
};

// ── Helper: CORS Headers ───────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400"
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders
    }
  });
}

// ── Helper: Password Hashing (Web Crypto API) ───────────────────
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(password + ":" + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRandomString(len = 16) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let res = "";
  const randomValues = new Uint8Array(len);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < len; i++) {
    res += chars[randomValues[i] % chars.length];
  }
  return res;
}

function generateToken(payload) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify({ ...payload, exp: Date.now() + 30 * 86400 * 1000 }));
  const sig = btoa(generateRandomString(32));
  return `${header}.${body}.${sig}`;
}

function parseToken(token) {
  try {
    if (!token) return null;
    const parts = token.replace("Bearer ", "").split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function addDaysToDate(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ── Cloudflare Worker Main Handler ─────────────────────────────
export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (!env.DB) {
      return jsonResponse({
        error: "Database D1 binding 'DB' belum terhubung di Cloudflare Workers. Pastikan binding DB telah diatur pada wrangler.toml."
      }, 500);
    }

    try {
      // ── ROUTE: GET /api/plans ──────────────────────────────
      if (path === "/api/plans" && method === "GET") {
        return jsonResponse({ success: true, plans: Object.values(PLANS) });
      }

      // ── ROUTE: POST /api/register ──────────────────────────
      if (path === "/api/register" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const {
          email,
          password,
          nama_lengkap = "",
          instansi,
          provinsi = "",
          kabupaten_kota = "",
          kecamatan = "",
          kelurahan = "",
          alamat_lengkap = "",
          subscription_plan = "free_trial"
        } = body;

        // Validasi input
        if (!email || !password || !instansi || !alamat_lengkap) {
          return jsonResponse({
            error: "Harap lengkapi semua field wajib (Email, Password, Instansi, dan Alamat Lengkap)."
          }, 400);
        }

        const cleanEmail = String(email).trim().toLowerCase();
        if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
          return jsonResponse({ error: "Format email tidak valid." }, 400);
        }

        if (String(password).length < 6) {
          return jsonResponse({ error: "Password minimal harus 6 karakter." }, 400);
        }

        const planConfig = PLANS[subscription_plan] || PLANS.free_trial;

        // Cek apakah email sudah terdaftar
        const existing = await env.DB.prepare(
          "SELECT id, email, has_used_free_trial FROM users WHERE email = ?"
        ).bind(cleanEmail).first();

        if (existing) {
          return jsonResponse({ error: "Email sudah terdaftar. Silakan gunakan email lain atau langsung login." }, 409);
        }

        // Aturan Free Trial: Hanya bisa 1x per akun
        let hasUsedFree = 0;
        if (planConfig.isTrial) {
          hasUsedFree = 1;
        }

        const now = new Date();
        const startedAt = now.toISOString();
        const expiresAt = addDaysToDate(now, planConfig.durationDays);

        const salt = generateRandomString(16);
        const passHash = await hashPassword(password, salt);
        const userId = `usr_${Date.now()}_${generateRandomString(6)}`;

        // Role otomatis NAKES
        const role = "nakes";
        const subscriptionStatus = "active";

        // Insert user baru
        await env.DB.prepare(`
          INSERT INTO users (
            id, email, password_hash, salt, nama_lengkap, role, instansi,
            provinsi, kabupaten_kota, kecamatan, kelurahan, alamat_lengkap,
            subscription_plan, subscription_status, subscription_started_at,
            subscription_expires_at, has_used_free_trial, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          userId, cleanEmail, passHash, salt, nama_lengkap || cleanEmail.split("@")[0],
          role, instansi, provinsi, kabupaten_kota, kecamatan, kelurahan, alamat_lengkap,
          planConfig.code, subscriptionStatus, startedAt, expiresAt, hasUsedFree, 1
        ).run();

        // Insert riwayat langganan
        const subId = `sub_${Date.now()}_${generateRandomString(6)}`;
        await env.DB.prepare(`
          INSERT INTO subscription_history (
            id, user_id, plan_code, plan_name, price, duration_days, status, payment_method, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          subId, userId, planConfig.code, planConfig.name, planConfig.price,
          planConfig.durationDays, "active", planConfig.isTrial ? "free_trial" : "direct_registration",
          `Pendaftaran baru paket ${planConfig.name}`
        ).run();

        const token = generateToken({ id: userId, email: cleanEmail, role });

        return jsonResponse({
          success: true,
          message: "Pendaftaran berhasil! Akun Tenaga Kesehatan (Nakes) Anda siap digunakan.",
          token,
          user: {
            id: userId,
            email: cleanEmail,
            nama_lengkap: nama_lengkap || cleanEmail.split("@")[0],
            role,
            instansi,
            provinsi,
            kabupaten_kota,
            kecamatan,
            kelurahan,
            alamat_lengkap,
            subscription_plan: planConfig.code,
            subscription_name: planConfig.name,
            subscription_status: subscriptionStatus,
            subscription_expires_at: expiresAt,
            days_remaining: planConfig.durationDays
          }
        }, 201);
      }

      // ── ROUTE: POST /api/login ─────────────────────────────
      if (path === "/api/login" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const { email, password } = body;

        if (!email || !password) {
          return jsonResponse({ error: "Email dan password wajib diisi." }, 400);
        }

        const cleanEmail = String(email).trim().toLowerCase();
        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE email = ?"
        ).bind(cleanEmail).first();

        if (!user) {
          return jsonResponse({ error: "Email atau password salah." }, 401);
        }

        // Verifikasi password
        const checkHash = await hashPassword(password, user.salt);
        if (checkHash !== user.password_hash) {
          return jsonResponse({ error: "Email atau password salah." }, 401);
        }

        // Cek status aktif akun
        if (user.is_active === 0) {
          return jsonResponse({
            error: "Akun Anda telah dinonaktifkan oleh administrator. Silakan hubungi admin ENCO."
          }, 403);
        }

        // Cek masa aktif langganan
        const now = new Date();
        const expiresAt = new Date(user.subscription_expires_at);
        const isExpired = now > expiresAt;
        let subStatus = user.subscription_status;

        if (isExpired && subStatus === "active") {
          subStatus = "expired";
          await env.DB.prepare(
            "UPDATE users SET subscription_status = 'expired', updated_at = datetime('now', '+7 hours') WHERE id = ?"
          ).bind(user.id).run();
        }

        // Hitung sisa hari
        const diffMs = expiresAt.getTime() - now.getTime();
        const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

        // Update waktu login terakhir
        await env.DB.prepare(
          "UPDATE users SET last_login_at = datetime('now', '+7 hours') WHERE id = ?"
        ).bind(user.id).run();

        const token = generateToken({ id: user.id, email: user.email, role: user.role });
        const planObj = PLANS[user.subscription_plan] || { name: user.subscription_plan };

        return jsonResponse({
          success: true,
          token,
          user: {
            id: user.id,
            email: user.email,
            nama_lengkap: user.nama_lengkap,
            role: user.role,
            instansi: user.instansi,
            provinsi: user.provinsi,
            kabupaten_kota: user.kabupaten_kota,
            kecamatan: user.kecamatan,
            kelurahan: user.kelurahan,
            alamat_lengkap: user.alamat_lengkap,
            subscription_plan: user.subscription_plan,
            subscription_name: planObj.name,
            subscription_status: subStatus,
            subscription_expires_at: user.subscription_expires_at,
            days_remaining: daysRemaining,
            is_expired: isExpired
          }
        });
      }

      // ── ROUTE: GET /api/me ─────────────────────────────────
      if (path === "/api/me" && method === "GET") {
        const authHeader = request.headers.get("Authorization");
        const tokenData = parseToken(authHeader);
        if (!tokenData || !tokenData.id) {
          return jsonResponse({ error: "Sesi tidak valid atau telah berakhir. Silakan login kembali." }, 401);
        }

        const user = await env.DB.prepare(
          "SELECT id, email, nama_lengkap, role, instansi, provinsi, kabupaten_kota, kecamatan, kelurahan, alamat_lengkap, subscription_plan, subscription_status, subscription_started_at, subscription_expires_at, is_active FROM users WHERE id = ?"
        ).bind(tokenData.id).first();

        if (!user) {
          return jsonResponse({ error: "Pengguna tidak ditemukan." }, 404);
        }

        const now = new Date();
        const expiresAt = new Date(user.subscription_expires_at);
        const isExpired = now > expiresAt;
        const diffMs = expiresAt.getTime() - now.getTime();
        const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        const planObj = PLANS[user.subscription_plan] || { name: user.subscription_plan };

        return jsonResponse({
          success: true,
          user: {
            ...user,
            subscription_name: planObj.name,
            days_remaining: daysRemaining,
            is_expired: isExpired
          }
        });
      }

      // ── ROUTE: POST /api/admin/login ───────────────────────
      if (path === "/api/admin/login" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const { email, password } = body;

        if (!email || !password) {
          return jsonResponse({ error: "Email dan password admin wajib diisi." }, 400);
        }

        const cleanEmail = String(email).trim().toLowerCase();
        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE email = ? AND role = 'superadmin'"
        ).bind(cleanEmail).first();

        if (!user) {
          return jsonResponse({ error: "Kredensial Super Admin tidak valid." }, 401);
        }

        const checkHash = await hashPassword(password, user.salt);
        if (checkHash !== user.password_hash) {
          return jsonResponse({ error: "Kredensial Super Admin tidak valid." }, 401);
        }

        const token = generateToken({ id: user.id, email: user.email, role: "superadmin" });
        return jsonResponse({
          success: true,
          message: "Login Super Admin berhasil.",
          token,
          admin: {
            id: user.id,
            email: user.email,
            nama_lengkap: user.nama_lengkap,
            role: user.role
          }
        });
      }

      // ── ROUTE: GET /api/admin/users ────────────────────────
      if (path === "/api/admin/users" && method === "GET") {
        const authHeader = request.headers.get("Authorization");
        const tokenData = parseToken(authHeader);
        if (!tokenData || tokenData.role !== "superadmin") {
          return jsonResponse({ error: "Akses ditolak. Khusus Super Administrator." }, 403);
        }

        const usersResult = await env.DB.prepare(`
          SELECT id, email, nama_lengkap, role, instansi, provinsi,
                 kabupaten_kota, kecamatan, kelurahan, alamat_lengkap,
                 subscription_plan, subscription_status, subscription_started_at,
                 subscription_expires_at, has_used_free_trial, is_active,
                 last_login_at, created_at
          FROM users
          ORDER BY created_at DESC
        `).all();

        const now = new Date();
        const list = (usersResult.results || []).map(u => {
          const exp = new Date(u.subscription_expires_at);
          const isExp = now > exp;
          const diffMs = exp.getTime() - now.getTime();
          const daysRem = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          const planObj = PLANS[u.subscription_plan] || { name: u.subscription_plan };
          return {
            ...u,
            subscription_name: planObj.name,
            is_expired: isExp,
            days_remaining: daysRem
          };
        });

        return jsonResponse({
          success: true,
          total: list.length,
          users: list
        });
      }

      // ── ROUTE: POST /api/admin/users/update-plan ───────────
      if (path === "/api/admin/users/update-plan" && method === "POST") {
        const authHeader = request.headers.get("Authorization");
        const tokenData = parseToken(authHeader);
        if (!tokenData || tokenData.role !== "superadmin") {
          return jsonResponse({ error: "Akses ditolak. Khusus Super Administrator." }, 403);
        }

        const body = await request.json().catch(() => ({}));
        const { userId, plan, additionalDays, newExpiresAt, newStatus, newRole } = body;

        if (!userId) {
          return jsonResponse({ error: "User ID wajib disertakan." }, 400);
        }

        const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
        if (!user) {
          return jsonResponse({ error: "User tidak ditemukan." }, 404);
        }

        let updatedPlan = plan || user.subscription_plan;
        let updatedStatus = newStatus || user.subscription_status;
        let updatedRole = newRole || user.role;
        let updatedExpires = user.subscription_expires_at;

        if (newExpiresAt) {
          updatedExpires = new Date(newExpiresAt).toISOString();
        } else if (additionalDays && !isNaN(parseInt(additionalDays, 10))) {
          const baseDate = new Date(user.subscription_expires_at) > new Date()
            ? new Date(user.subscription_expires_at)
            : new Date();
          updatedExpires = addDaysToDate(baseDate, parseInt(additionalDays, 10));
          updatedStatus = "active";
        }

        await env.DB.prepare(`
          UPDATE users
          SET subscription_plan = ?,
              subscription_status = ?,
              subscription_expires_at = ?,
              role = ?,
              updated_at = datetime('now', '+7 hours')
          WHERE id = ?
        `).bind(updatedPlan, updatedStatus, updatedExpires, updatedRole, userId).run();

        // Audit Log
        const logId = `log_${Date.now()}_${generateRandomString(6)}`;
        await env.DB.prepare(`
          INSERT INTO admin_audit_logs (id, admin_email, action, target_user_id, details)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          logId, tokenData.email, "UPDATE_PLAN", userId,
          `Perubahan paket: ${updatedPlan}, status: ${updatedStatus}, expires: ${updatedExpires}`
        ).run();

        return jsonResponse({
          success: true,
          message: "Data langganan berhasil diperbarui oleh admin.",
          user: {
            id: userId,
            subscription_plan: updatedPlan,
            subscription_status: updatedStatus,
            subscription_expires_at: updatedExpires,
            role: updatedRole
          }
        });
      }

      // ── ROUTE: POST /api/admin/users/toggle-status ──────────
      if (path === "/api/admin/users/toggle-status" && method === "POST") {
        const authHeader = request.headers.get("Authorization");
        const tokenData = parseToken(authHeader);
        if (!tokenData || tokenData.role !== "superadmin") {
          return jsonResponse({ error: "Akses ditolak. Khusus Super Administrator." }, 403);
        }

        const body = await request.json().catch(() => ({}));
        const { userId, isActive } = body;

        if (!userId) {
          return jsonResponse({ error: "User ID wajib disertakan." }, 400);
        }

        const activeVal = isActive ? 1 : 0;
        await env.DB.prepare(
          "UPDATE users SET is_active = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?"
        ).bind(activeVal, userId).run();

        return jsonResponse({
          success: true,
          message: `Status akun berhasil diubah menjadi ${activeVal === 1 ? "Aktif" : "Dinonaktifkan"}.`,
          userId,
          is_active: activeVal
        });
      }

      // ── ROUTE: DELETE /api/admin/users/delete ───────────────
      if (path === "/api/admin/users/delete" && method === "POST") {
        const authHeader = request.headers.get("Authorization");
        const tokenData = parseToken(authHeader);
        if (!tokenData || tokenData.role !== "superadmin") {
          return jsonResponse({ error: "Akses ditolak. Khusus Super Administrator." }, 403);
        }

        const body = await request.json().catch(() => ({}));
        const { userId } = body;

        if (!userId) {
          return jsonResponse({ error: "User ID wajib disertakan." }, 400);
        }

        await env.DB.prepare("DELETE FROM subscription_history WHERE user_id = ?").bind(userId).run();
        await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

        return jsonResponse({
          success: true,
          message: "Akun berhasil dihapus permanen.",
          userId
        });
      }

      // Default 404
      return jsonResponse({ error: "Endpoint tidak ditemukan: " + path }, 404);
    } catch (err) {
      console.error("[Worker Error]", err);
      return jsonResponse({ error: "Terjadi kesalahan pada server: " + err.message }, 500);
    }
  }
};
