# Panduan Deploy Backend Cloudflare D1 & Worker untuk ENCO Mobile

Dokumen ini berisi panduan lengkap untuk melakukan deploy database **Cloudflare D1 (SQL)** dan **Cloudflare Workers (API Backend & Web Portal)** untuk sistem pendaftaran dan autentikasi akun Tenaga Kesehatan (Nakes) ENCO Mobile.

---

## 📁 Struktur File di Folder `WEB/`

- **`schema.sql`**: Skrip SQL untuk membuat tabel database `users`, `subscription_history`, `admin_sessions`, dan `admin_audit_logs`, serta akun awal Super Admin.
- **`worker.js`**: Kode Cloudflare Worker yang menangani API Register, Login, Me, dan Control Panel Super Admin.
- **`wrangler.toml`**: File konfigurasi deploy untuk Cloudflare Workers CLI.
- **`public/index.html`**: Halaman Beranda / Portal Akses ENCO.
- **`public/register.html`**: Halaman Web Pendaftaran Akun Nakes (dengan form lengkap, pilihan paket langganan, dan role otomatis Nakes).
- **`public/admin.html`**: Halaman Web Control Panel Super Admin (untuk manajemen akun, aktivasi, perpanjang masa aktif, dan edit paket).

---

## 🚀 Langkah 1: Buat Database D1 di Cloudflare

Anda dapat membuat database D1 langsung melalui **Cloudflare Dashboard** atau melalui **Wrangler CLI**:

### Opsi A: Lewat Cloudflare Dashboard (Browser)
1. Buka [dash.cloudflare.com](https://dash.cloudflare.com/) dan login ke akun Anda.
2. Di menu samping kiri, klik **Workers & Pages** > **D1 SQL Database**.
3. Klik tombol **Create database**.
4. Beri nama database, misalnya: `enco_db`.
5. Salin **Database ID** yang muncul (berupa string seperti `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
6. Buka tab **Console** di database D1 tersebut, buka file `schema.sql`, salin seluruh isi teks SQL-nya, lalu tempelkan di console dan klik **Execute**.
7. Tabel berhasil dibuat beserta akun awal Super Admin!

### Opsi B: Lewat Terminal (Wrangler CLI)
Jika menggunakan Wrangler di komputer (buka terminal di dalam folder `WEB`):
```bash
# Login ke akun Cloudflare
npx wrangler login

# Buat database D1
npx wrangler d1 create enco_db

# Jalankan skrip schema.sql ke D1
npx wrangler d1 execute enco_db --file=./schema.sql
```

---

## ⚙️ Langkah 2: Konfigurasi `wrangler.toml`

Buka file `WEB/wrangler.toml`, lalu masukkan `database_id` yang Anda dapatkan dari Langkah 1:
```toml
name = "enco-auth-api"
main = "worker.js"
compatibility_date = "2024-09-23"

[[d1_databases]]
binding = "DB"
database_name = "enco_db"
database_id = "MASUKKAN_DATABASE_ID_D1_DISINI"

[assets]
directory = "./public"
binding = "ASSETS"
```

---

## 🌐 Langkah 3: Deploy Worker ke Cloudflare

Jalankan perintah berikut di dalam folder `WEB`:
```bash
cd WEB
npx wrangler deploy
```

Setelah selesai, Cloudflare akan memberikan URL publik untuk worker Anda, contohnya:
`https://enco-auth-api.nama-subdomain.workers.dev`

### Akses Web Portal:
- **Web Pendaftaran**: `https://enco-auth-api.nama-subdomain.workers.dev/register.html`
- **Control Panel Super Admin**: `https://enco-auth-api.nama-subdomain.workers.dev/admin.html`
- **API Endpoint**: `https://enco-auth-api.nama-subdomain.workers.dev/api`

---

## 🔑 Kredensial Default Super Admin

Setelah menjalankan `schema.sql`, akun default Super Admin telah dibuat:
- **Email**: `admin@enco.id`
- **Password**: `AdminEnco2026!`
- **Role**: `superadmin`

*(Password dan akun dapat Anda ubah atau tambah kapan saja melalui Control Panel Admin).*

---

## 📦 Paket Berlangganan yang Disediakan

| Paket | Masa Aktif | Harga | Keterangan |
|---|---|---|---|
| **Free Trial** | 3 Hari | Rp 0 | Hanya dapat diklaim 1x per akun saat pendaftaran awal |
| **Pro Mingguan** | 7 Hari | Rp 25.000 | Akses penuh selama 7 hari |
| **Pro Bulanan** | 30 Hari | Rp 78.000 | Akses penuh selama 30 hari (Paling populer) |
| **Pro Tahunan** | 365 Hari | Rp 750.000 | Akses penuh selama 1 tahun (Paling hemat) |

---

## 🧩 Menghubungkan ke Ekstensi ENCO Mobile

Di dalam ekstensi ENCO Mobile:
1. Klik ikon roda gigi / pengaturan URL API jika ingin menghubungkan ekstensi ke domain Cloudflare Worker Anda sendiri.
2. Nakes memasukkan **Email** dan **Password** yang telah didaftarkan melalui web pendaftaran.
3. Ekstensi akan memverifikasi email, password, role NAKES, dan masa aktif berlangganan secara otomatis.
