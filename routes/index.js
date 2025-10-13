const express = require('express');
const router = express.Router();

const SYSCOM_BASE = 'https://developers.syscom.mx';

// Obtener el access_token desde SYSCOM
async function getAccessToken() {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Faltan variables de entorno CLIENT_ID o CLIENT_SECRET');
  }

  const res = await fetch(`${SYSCOM_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error al obtener token (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

// Proxy hacia SYSCOM
async function proxyToSyscom(req, res) {
  try {
    const token = await getAccessToken();

    const target = new URL(`${SYSCOM_BASE}/api/v1${req.path}`);
    for (const [k, v] of Object.entries(req.query || {})) {
      target.searchParams.append(k, v);
    }

    const init = {
      method: req.method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
      init.headers['Content-Type'] = req.headers['content-type'] || 'application/json';
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    }

    const resp = await fetch(target, init);
    const text = await resp.text();

    res
      .status(resp.status)
      .type(resp.headers.get('content-type') || 'application/json')
      .send(text);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
}

// Ruta de prueba
router.get('/health', (req, res) => res.json({ ok: true }));

// Proxy para cualquier ruta restante
router.all('*', proxyToSyscom);

module.exports = router;
