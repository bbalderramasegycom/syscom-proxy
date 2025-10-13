// --- dependencias existentes de la plantilla ---
var createError   = require('http-errors');
var express       = require('express');
var path          = require('path');
var cookieParser  = require('cookie-parser');
var logger        = require('morgan');

// --- NUEVO: CORS para permitir tu dominio ---
var cors = require('cors');

var indexRouter = require('./routes/index');
// var usersRouter = require('./routes/users');

var app = express();

// view engine setup (deja igual)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// middlewares base
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// habilitar CORS (ajusta dominios si quieres)
app.use(cors({ origin: ['https://www.segycom.mx', 'http://localhost:5173'] }));

app.use('/', indexRouter);
// app.use('/users', usersRouter);

// ====================
//  PROXY SYSCOM NUEVO
// ====================

// Node 18+ ya trae fetch global; si no, cambia a `const fetch = (...args)=>import('node-fetch').then(m=>m.default(...args))`
const SYSCOM_TOKEN_URL = 'https://developers.syscom.mx/oauth/token';
const SYSCOM_API_BASE  = 'https://developers.syscom.mx/api/v1/';
const { SYSCOM_CLIENT_ID, SYSCOM_CLIENT_SECRET } = process.env;

let tokenCache = { token: null, exp: 0 };

async function getToken() {
  // reutiliza el token y renuévalo 1 minuto antes
  if (tokenCache.token && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;

  const body = new URLSearchParams({
    client_id: SYSCOM_CLIENT_ID,
    client_secret: SYSCOM_CLIENT_SECRET,
    grant_type: 'client_credentials'
  });

  const r = await fetch(SYSCOM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Token ${r.status}: ${txt}`);
  }

  const j = await r.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

// Ruta proxy: /api/syscom/* → SYSCOM /api/v1/*
app.get('/api/syscom/*', async (req, res) => {
  try {
    const t = await getToken();
    const pathPart = req.params[0] || '';
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

    const upstream = await fetch(SYSCOM_API_BASE + pathPart + qs, {
      headers: { Authorization: `Bearer ${t}` }
    });

    const text  = await upstream.text();
    const ctype = upstream.headers.get('content-type') || 'application/json';
    res.status(upstream.status).type(ctype).send(text);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// 404 y handler de errores (igual que estaba)
app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error   = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
