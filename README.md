# Game API Mail Backend

Backend for Game API Mail.

Frontend: https://mail.game-api.online
Backend target: https://api.game-api.online

## Stack

- Node.js + Express
- Supabase Auth/Postgres
- Hostinger SMTP
- Hostinger IMAP
- Optional Hostinger Mail API provisioning
- Web Push

## Render

Environment: Web Service
Build command: npm install
Start command: npm start
Node: 22+

Copy variables from .env.example into Render. Never commit .env.

## Supabase

The current project already contains profiles, mailboxes, folders, messages, message_recipients, attachments, contacts, push_subscriptions and mail_sync_state.

Run sql/001_mailbox_credentials.sql once in the Supabase SQL editor.

## Hostinger

Standard Hostinger Email settings:
IMAP imap.hostinger.com:993 SSL
SMTP smtp.hostinger.com:465 SSL
SMTP alternative: smtp.hostinger.com:587 TLS/STARTTLS

For automatic mailbox creation configure HOSTINGER_API_TOKEN, HOSTINGER_ORDER_ID and APP_ENCRYPTION_KEY.

## API

GET /
GET /health
GET /api/me
GET /api/mailbox
POST /api/mailbox/provision
GET /api/mail?folder=INBOX
GET /api/mail/:id
POST /api/mail/read
POST /api/mail/star
POST /api/mail/delete
POST /api/mail/sync
POST /api/mail/send
GET /api/push/public-key
POST /api/push/subscribe
DELETE /api/push/subscribe

## Secrets

Never expose the Supabase service-role key, Hostinger API token, mailbox passwords, APP_ENCRYPTION_KEY or Web Push private key to the browser.

## Keys

Generate APP_ENCRYPTION_KEY with:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

Generate VAPID keys with:
npx web-push generate-vapid-keys

## Flow

Incoming mail:
Gmail/other sender -> Hostinger MX -> Hostinger mailbox -> backend IMAP -> Supabase -> Game API Mail frontend.

Outgoing mail:
Game API Mail frontend -> Supabase session -> backend -> Hostinger SMTP -> recipient.

The backend validates the Supabase access token before accessing user mail.
