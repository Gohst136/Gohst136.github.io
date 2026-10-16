/* Einstellungen der App.
 *
 * feedUrl: wo status.enc und img/ liegen.
 *   'feed/'                               -> Feed liegt im Repo (GitHub Pages, verzögert)
 *   'https://<mac>.<tailnet>.ts.net/'     -> Feed kommt live vom Mac (tools/serve_feed.py + Tailscale Funnel)
 * Kann auch auf dem Handy im Anmeldebildschirm unter „Feed-Adresse“ überschrieben werden.
 */
window.MACRAY_CONFIG = {
  feedUrl: 'feed/',
};
