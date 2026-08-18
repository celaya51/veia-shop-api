import http from "node:http";
import crypto from "node:crypto";
import { catalog } from "./catalog.mjs";

const port = Number(process.env.PORT || 8095);
const accessToken = process.env.MP_ACCESS_TOKEN || "";
const publicSiteUrl = process.env.PUBLIC_SITE_URL || "https://celaya51.github.io/veia-shop";
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "https://celaya51.github.io,http://localhost:4321")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function corsHeaders(origin) {
  const allowed = allowedOrigins.has(origin) ? origin : [...allowedOrigins][0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function sendJson(res, status, body, origin) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("payload_too_large");
  }
  return raw ? JSON.parse(raw) : {};
}

function normalizedItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) {
    throw new Error("invalid_items");
  }
  return items.map((item) => {
    const product = catalog[String(item?.id || "")];
    const quantity = Number(item?.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new Error("invalid_item");
    }
    return {
      id: product.id,
      title: product.title,
      quantity,
      currency_id: "MXN",
      unit_price: product.price,
    };
  });
}

async function createPreference(items) {
  if (!accessToken) throw new Error("payment_not_configured");
  const reference = `veia-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items,
      external_reference: reference,
      back_urls: {
        success: `${publicSiteUrl}/?payment=success`,
        failure: `${publicSiteUrl}/?payment=failure`,
        pending: `${publicSiteUrl}/?payment=pending`,
      },
      auto_return: "approved",
      notification_url: `${process.env.WEBHOOK_URL || ""}/api/webhooks/mercadopago`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Mercado Pago preference error", response.status, detail.slice(0, 500));
    throw new Error("payment_provider_error");
  }
  const preference = await response.json();
  return { id: preference.id, init_point: preference.init_point, sandbox_init_point: preference.sandbox_init_point, reference };
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    return res.end();
  }
  if (req.method === "GET" && req.url === "/healthz") {
    return sendJson(res, 200, { ok: true, service: "veia-shop-api", paymentConfigured: Boolean(accessToken) }, origin);
  }
  if (req.method === "POST" && req.url === "/api/create-preference") {
    try {
      const body = await readJson(req);
      const items = normalizedItems(body.items);
      const preference = await createPreference(items);
      return sendJson(res, 200, preference, origin);
    } catch (error) {
      const status = error.message === "payment_not_configured" ? 503 : error.message.startsWith("invalid") ? 400 : 502;
      return sendJson(res, status, { error: error.message }, origin);
    }
  }
  if (req.method === "POST" && req.url?.startsWith("/api/webhooks/mercadopago")) {
    // Recepción inicial: la confirmación real debe consultar el pago a Mercado Pago.
    // Dejamos respuesta rápida para que el proveedor reintente solo ante fallos de red.
    console.log("Mercado Pago webhook", new Date().toISOString(), req.headers["x-request-id"] || "without-request-id");
    res.writeHead(200, corsHeaders(origin));
    return res.end("ok");
  }
  return sendJson(res, 404, { error: "not_found" }, origin);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`veia-shop-api listening on 127.0.0.1:${port}`);
});
