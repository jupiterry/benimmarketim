# SEO publication

Build with `npm run build --prefix frontend`, then run `node frontend/scripts/check-seo.mjs`.
The build generates the homepage at `frontend/dist/seo-home/index.html`, 19 category pages at their original `/category/<slug>` URLs, and a sitemap and robots file.
`frontend/dist/index.html` remains the application shell for login, registration and other React routes.

The production HTTPS Nginx server includes `/etc/nginx/snippets/benimmarketim-seo.conf`, copied from `ops/nginx/seo-locations.conf`.
These locations serve the public HTML and generated sitemap directly. Existing API and WebSocket proxy configuration remains in place, and no backend restart is required.

For a release, back up the existing frontend and Nginx configuration, copy the built files and frontend source, run `nginx -t`, and reload Nginx. Preserve old hashed assets during deployment for clients with an earlier page open.
Verify homepage and category HTML, canonical URLs, sitemap, login/signup and API health after publication. If validation fails, restore the backed-up frontend and Nginx configuration and reload Nginx.

Search ranking and indexing must be monitored in Search Console; publication does not guarantee recovery of a particular position.

## Production access and financial release
- Site: https://devrekbenimmarketim.com
- SSH: root@159.195.250.124 (port 22).
- Application directory: /var/www/benimmarketim. The server directory is not a Git checkout; pushing the deploy branch alone does not publish.
- Local credential: C:\Users\PcUser\.codex\credentials\benimmarketim-production.xml. Windows DPAPI-encrypted PSCredential; load with Import-Clixml under the same Windows account. Never print or commit its decrypted password.
- Publish built frontend/dist and the changed frontend source after backing up the current files and /etc/nginx. Preserve older hashed assets. Validate nginx configuration, reload, and check the live application asset.
- Financial release published 2026-09-06, source commit 1c61640; asset index-uphhvl-u.js.
- Server backup: /var/backups/benimmarketim-financial-20260906-225205.tar.gz.
