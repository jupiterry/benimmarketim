# Telegram order notifications

Runs independently of checkout and n8n. Start from the project root:

```sh
pm2 start backend/workers/telegram.run.js --name benimmarketim-telegram --time --kill-timeout 20000 --restart-delay 5000
pm2 save
```

The worker reads `MONGO_URI` from `.env`, and `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_PAIRING_CODE` from `.telegram.env` (server-only, mode 0600, gitignored).
The token is never returned by the admin API or logged.

Any real user who opens a private chat with the bot and sends `/start` (or taps
Start) becomes an active subscriber. Groups, channels and bots cannot subscribe.
`/stop` disables that subscriber; another `/start` enables them again. The first
secure pairing remains the owner for the sales-summary commands, while order and
customer live-chat alerts fan out to every active subscriber. Subscribers receive
only events created after their latest subscription time, so joining never leaks
historical orders or messages.

`telegram_jobs` is a durable, uniquely keyed outbox. Saved orders created since
worker initialization are reconciled every 10 seconds. Earlier historical orders
are not broadcast. Sends are serialized with a MongoDB lease. Failed requests
retry with backoff; 429 retry-after is honored. Telegram does not offer a send
idempotency key: a lost acknowledgement after successful delivery can rarely
cause a duplicate message. No claim of exactly-once network delivery is made.

An unseen order still in preparation receives one reminder five minutes after
its initial message is sent. One team member's acknowledgement suppresses the
shared reminder and never changes business order status. New customer-authored
live-chat messages also use the durable outbox and include a panel link.
Daily summaries run after 00:05 Europe/Istanbul for the full previous day;
missed summaries are queued after restart. Summaries exclude cancelled revenue.
Commands: `/bugun`, `/bekleyen`, `/durum`, `/test`, `/yardim`.

The authenticated admin endpoint `/api/telegram/status` exposes only operational
metadata; `/api/telegram/test` enqueues a test message (one per minute). The
overview card polls every 15 seconds. PM2 startup must be enabled for reboot
recovery. Check the worker heartbeat and lastError if delivery stops.

Validation:

```sh
node --test backend/tests/telegram.test.js
RUN_TELEGRAM_INTEGRATION=1 node backend/tests/telegram.integration.mjs
```

Integration validation uses temporary, uniquely prefixed collections and a fake
Telegram transport; it drops only those temporary collections after completion.

Rollback: stop/delete only the `benimmarketim-telegram` PM2 process, remove the
Telegram route mount and restore the prior frontend/backend release backup.
Preserve the state/outbox collections for later recovery. No customer orders
need to be changed or deleted.
