import type { FastifyPluginAsync } from "fastify";
import {
  APP_VERSION,
  getApifyActor,
  getOpenRouterModel,
  hasConfig,
} from "../config.js";
import { stats } from "../db/repo.js";

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

function runChecks(): { ok: boolean; version: string; checks: Check[] } {
  const checks: Check[] = [];

  // Base de données
  let dbOk = true;
  let s = { sources: 0, videos: 0, imported: 0, deleted: 0 };
  try {
    s = stats();
  } catch (e) {
    dbOk = false;
    checks.push({ label: "Base SQLite", ok: false, detail: (e as Error).message });
  }
  if (dbOk) {
    checks.push({
      label: "Base SQLite",
      ok: true,
      detail: `${s.sources} source(s), ${s.videos} vidéo(s) visibles, ${s.imported} import(s) au registre, ${s.deleted} supprimée(s)`,
    });
  }

  // Clés / config (présence seulement, jamais les valeurs)
  checks.push({
    label: "Clé YouTube",
    ok: hasConfig("youtube_api_key"),
    detail: hasConfig("youtube_api_key") ? "configurée" : "absente (obligatoire)",
  });
  checks.push({
    label: "Clé OpenRouter",
    ok: true,
    detail: hasConfig("openrouter_api_key")
      ? `configurée — modèle ${getOpenRouterModel()}`
      : "absente (résumés IA désactivés)",
  });
  checks.push({
    label: "Token Apify",
    ok: true,
    detail: hasConfig("apify_token")
      ? `configuré — actor ${getApifyActor()}`
      : "absent (transcriptions désactivées)",
  });

  const ok = checks.every((c) => c.ok);
  return { ok, version: APP_VERSION, checks };
}

const DOC_PAGE = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>YouTube Playlists Analyser — API</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 22px; } h2 { font-size: 16px; margin-top: 28px; }
  code { background: #f0f0f0; padding: 1px 5px; border-radius: 3px; font-size: 13px; }
  .warn { background: #fff6e0; border: 1px solid #e0b400; padding: 10px 14px; border-radius: 8px; }
  button { background: #7a4ddb; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-size: 14px; cursor: pointer; }
  button:hover { background: #6a3dcb; }
  ul { padding-left: 20px; } li { margin: 3px 0; }
  #out { margin-top: 16px; }
  .row { display: flex; gap: 8px; align-items: baseline; padding: 4px 0; border-bottom: 1px solid #eee; }
  .ok { color: #1a8f3c; font-weight: 600; } .ko { color: #cc0000; font-weight: 600; }
  .label { min-width: 160px; font-weight: 500; } .detail { color: #555; font-size: 13px; }
</style></head>
<body>
  <h1>YouTube Playlists Analyser — API backend</h1>
  <p>Backend Fastify + SQLite. Le frontend parle uniquement à cette API (préfixe <code>/api</code>) ;
     les clés API vivent côté serveur et ne sont jamais renvoyées au navigateur.</p>
  <div class="warn"><strong>Sécurité :</strong> aucune authentification. Ne pas exposer publiquement
     sans auth au niveau du reverse proxy (réseau privé uniquement).</div>
  <h2>Endpoints clés</h2>
  <ul>
    <li><code>GET /api/health</code> — vérifie que le serveur tourne</li>
    <li><code>GET /api/sources</code>, <code>POST /api/sources/:key/refresh</code> — sources & import additif</li>
    <li><code>GET /api/sources/:key/videos</code>, <code>GET /api/videos/all</code>, <code>GET /api/videos/duplicates</code></li>
    <li><code>GET /api/settings</code>, <code>POST /api/data/export</code>, <code>POST /api/data/import</code></li>
    <li><code>GET /api/check</code> — diagnostic (utilisé par le bouton ci-dessous)</li>
  </ul>
  <h2>Diagnostic</h2>
  <button onclick="runCheck()">Lancer le check</button>
  <div id="out"></div>
<script>
async function runCheck() {
  const out = document.getElementById('out');
  out.textContent = 'Vérification…';
  try {
    const r = await fetch('/api/check');
    const d = await r.json();
    out.innerHTML = '<p><strong>État global : </strong><span class="' + (d.ok?'ok':'ko') + '">' +
      (d.ok ? 'OK' : 'Problème détecté') + '</span> — version ' + d.version + '</p>' +
      d.checks.map(c => '<div class="row"><span class="' + (c.ok?'ok':'ko') + '">' +
        (c.ok?'✓':'✗') + '</span><span class="label">' + c.label + '</span><span class="detail">' +
        c.detail + '</span></div>').join('');
  } catch (e) { out.innerHTML = '<span class="ko">Échec : ' + e + '</span>'; }
}
</script>
</body></html>`;

const checkRoutes: FastifyPluginAsync = async (app) => {
  // Page de documentation + bouton de diagnostic (hors préfixe /api).
  app.get("/", async (_req, reply) => {
    reply.type("text/html").send(DOC_PAGE);
  });

  // Diagnostic JSON (sous /api).
  app.get("/api/check", async () => runChecks());
};

export default checkRoutes;
