CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    nama_lengkap TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'nakes',
    instansi TEXT NOT NULL DEFAULT '',
    provinsi TEXT NOT NULL DEFAULT '',
    kabupaten_kota TEXT NOT NULL DEFAULT '',
    kecamatan TEXT NOT NULL DEFAULT '',
    kelurahan TEXT NOT NULL DEFAULT '',
    alamat_lengkap TEXT NOT NULL DEFAULT '',
    subscription_plan TEXT NOT NULL DEFAULT 'free_trial',
    subscription_status TEXT NOT NULL DEFAULT 'active',
    subscription_started_at TEXT NOT NULL,
    subscription_expires_at TEXT NOT NULL,
    has_used_free_trial INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_expires ON users(subscription_expires_at);

CREATE TABLE IF NOT EXISTS subscription_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_code TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    duration_days INTEGER NOT NULL DEFAULT 3,
    status TEXT NOT NULL DEFAULT 'active',
    payment_method TEXT DEFAULT 'free',
    payment_proof TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sub_history_user ON subscription_history(user_id);

CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    admin_email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_user_id TEXT,
    details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO users (
    id,
    email,
    password_hash,
    salt,
    nama_lengkap,
    role,
    instansi,
    provinsi,
    kabupaten_kota,
    kecamatan,
    kelurahan,
    alamat_lengkap,
    subscription_plan,
    subscription_status,
    subscription_started_at,
    subscription_expires_at,
    has_used_free_trial,
    is_active
) VALUES (
    'usr_admin_enco_001',
    'admin@enco.id',
    '6596f2fb6fb71c99f0a8d8cc4237f736001991d2ba9b05f9e6a7f87743227b0b',
    'enco_superadmin_salt_2026',
    'Super Administrator ENCO',
    'superadmin',
    'Kantor Pusat ENCO',
    'Jawa Barat',
    'Bandung',
    'Banjaran',
    'Banjaran Wetan',
    'Jl. Raya Banjaran No. 100',
    'pro_tahunan',
    'active',
    datetime('now'),
    datetime('now', '+10 years'),
    1,
    1
);
