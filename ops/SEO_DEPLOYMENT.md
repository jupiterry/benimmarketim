# SEO publication

Build with `npm run build --prefix frontend`, then run `node frontend/scripts/check-seo.mjs`.
The build generates the homepage at `frontend/dist/seo-home/index.html`, 19 category pages at their original `/category/<slug>` URLs, and a sitemap and robots file.
`frontend/dist/index.html` remains the application shell for login, registration and other React routes.

The production HTTPS Nginx server includes `/etc/nginx/snippets/benimmarketim-seo.conf`, copied from `ops/nginx/seo-locations.conf`.
These locations serve the public HTML and generated sitemap directly. Existing API and WebSocket proxy configuration remains in place, and no backend restart is required.

For a release, back up the existing frontend and Nginx configuration, copy the built files and frontend source, run `nginx -t`, and reload Nginx. Preserve old hashed assets during deployment for clients with an earlier page open.
Verify homepage and category HTML, canonical URLs, sitemap, login/signup and API health after publication. If validation fails, restore the backed-up frontend and Nginx configuration and reload Nginx.

Search ranking and indexing must be monitored in Search Console; publication does not guarantee recovery of a particular position.
