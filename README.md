# VEIA Shop API

API mínima para Mercado Pago Checkout Pro. El frontend estático nunca recibe `MP_ACCESS_TOKEN`.

Variables:

- `MP_ACCESS_TOKEN`: Access Token de prueba o producción de Mercado Pago.
- `PUBLIC_SITE_URL`: URL pública de la tienda.
- `WEBHOOK_URL`: URL HTTPS pública del API, sin `/` final.
- `ALLOWED_ORIGINS`: orígenes separados por comas.
- `PORT`: puerto local, por defecto `8095`.

Endpoints:

- `GET /healthz`
- `POST /api/create-preference` con `{ "items": [{ "id": "cables", "quantity": 1 }] }`
- `POST /api/webhooks/mercadopago`

Antes de cobrar en producción hay que validar el pago consultando la API de Mercado Pago desde el webhook, guardar la orden y configurar la firma secreta de webhooks.
