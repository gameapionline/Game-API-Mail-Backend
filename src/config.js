import "dotenv/config";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

for (const name of required) {
  if (!process.env[name]) throw new Error("Missing required environment variable: " + name);
}

export const config = {
  port: Number(process.env.PORT || 10000),
  nodeEnv: process.env.NODE_ENV || "development",
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  frontendOrigins: (process.env.FRONTEND_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean),
  mailDomain: (process.env.MAIL_DOMAIN || "game-api.online").toLowerCase(),
  smtp: {
    host: process.env.HOSTINGER_SMTP_HOST || "smtp.hostinger.com",
    port: Number(process.env.HOSTINGER_SMTP_PORT || 465),
    secure: String(process.env.HOSTINGER_SMTP_SECURE || "true") === "true"
  },
  imap: {
    host: process.env.HOSTINGER_IMAP_HOST || "imap.hostinger.com",
    port: Number(process.env.HOSTINGER_IMAP_PORT || 993),
    secure: String(process.env.HOSTINGER_IMAP_SECURE || "true") === "true"
  },
  defaultMailboxEmail: (process.env.HOSTINGER_EMAIL || "").toLowerCase(),
  defaultMailboxPassword: process.env.HOSTINGER_EMAIL_PASSWORD || "",
  hostingerApi: {
    baseUrl: process.env.HOSTINGER_API_BASE_URL || "https://api.hostinger.com",
    token: process.env.HOSTINGER_API_TOKEN || "",
    orderId: process.env.HOSTINGER_ORDER_ID || ""
  },
  encryptionKey: process.env.APP_ENCRYPTION_KEY || "",
  push: {
    publicKey: process.env.WEB_PUSH_PUBLIC_KEY || "",
    privateKey: process.env.WEB_PUSH_PRIVATE_KEY || "",
    subject: process.env.WEB_PUSH_SUBJECT || "mailto:mail@game-api.online"
  },
  syncIntervalMs: Number(process.env.MAIL_SYNC_INTERVAL_MS || 60000),
  syncBatchSize: Number(process.env.MAIL_SYNC_BATCH_SIZE || 50)
};
