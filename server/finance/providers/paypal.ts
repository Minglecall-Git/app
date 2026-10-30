/**
 * PayPal Orders API v2 — create, capture, webhook verify.
 * Credentials from payment_gateways row (UI) with optional env override.
 */

import type {
  CaptureOrVerifyParams,
  CaptureOrVerifyResult,
  CreateCheckoutParams,
  CreateCheckoutResult,
  GatewayMode,
  GatewaySecrets,
  ParsedWebhookEvent,
  PaymentGatewayProvider,
} from './types';

type PayPalConfig = {
  mode: GatewayMode;
  clientId: string;
  clientSecret: string;
  webhookId: string;
};

function apiBase(mode: GatewayMode): string {
  return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function headerVal(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return Array.isArray(v) ? String(v[0] || '') : String(v || '');
    }
  }
  return '';
}

async function fetchAccessToken(cfg: PayPalConfig): Promise<{ token?: string; error?: string }> {
  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch(`${apiBase(cfg.mode)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    return { error: data.error_description || `PayPal auth failed (${res.status})` };
  }
  return { token: data.access_token };
}

function resolveConfig(
  mode: GatewayMode,
  publicConfig: Record<string, unknown>,
  secrets: GatewaySecrets
): { ok: true; cfg: PayPalConfig } | { ok: false; error: string; code: string } {
  const clientId =
    String(secrets.client_id || publicConfig.client_id || process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(
    secrets.client_secret || process.env.PAYPAL_CLIENT_SECRET || ''
  ).trim();
  const webhookId = String(
    secrets.webhook_id || publicConfig.webhook_id || process.env.PAYPAL_WEBHOOK_ID || ''
  ).trim();

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: 'PayPal Client ID and Client Secret are required',
      code: 'PAYPAL_NOT_CONFIGURED',
    };
  }
  return {
    ok: true,
    cfg: { mode, clientId, clientSecret, webhookId },
  };
}

export function createPayPalProvider(
  mode: GatewayMode,
  publicConfig: Record<string, unknown>,
  secrets: GatewaySecrets
): PaymentGatewayProvider {
  return {
    id: 'paypal',

    async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
      const resolved = resolveConfig(mode, publicConfig, secrets);
      if (resolved.ok === false) {
        return { success: false, error: resolved.error, code: resolved.code };
      }

      const amount = Number(params.amountUsd);
      if (!Number.isFinite(amount) || amount <= 0) {
        return { success: false, error: 'Invalid checkout amount', code: 'INVALID_AMOUNT' };
      }

      const auth = await fetchAccessToken(resolved.cfg);
      if (!auth.token) {
        return { success: false, error: auth.error || 'PayPal auth failed', code: 'PAYPAL_AUTH_FAILED' };
      }

      const currency = (params.currency || 'USD').toUpperCase();
      const value = amount.toFixed(2);
      const body = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: String(params.purchaseId).slice(0, 256),
            custom_id: String(params.customId || params.purchaseId).slice(0, 127),
            description: String(params.description || 'Coin package').slice(0, 127),
            amount: {
              currency_code: currency,
              value,
            },
          },
        ],
        application_context: {
          brand_name: 'MingleCall',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
        },
      };

      const res = await fetch(`${apiBase(resolved.cfg.mode)}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        links?: Array<{ rel?: string; href?: string }>;
        message?: string;
        details?: Array<{ description?: string }>;
      };

      if (!res.ok || !data.id) {
        const detail =
          data.details?.[0]?.description || data.message || `PayPal create order failed (${res.status})`;
        return { success: false, error: detail, code: 'PAYPAL_CREATE_FAILED' };
      }

      const approvalUrl = (data.links || []).find((l) => l.rel === 'approve')?.href;
      if (!approvalUrl) {
        return {
          success: false,
          error: 'PayPal order missing approve link',
          code: 'PAYPAL_NO_APPROVAL_URL',
        };
      }

      return { success: true, externalRef: data.id, approvalUrl };
    },

    async captureOrVerify(params: CaptureOrVerifyParams): Promise<CaptureOrVerifyResult> {
      const resolved = resolveConfig(mode, publicConfig, secrets);
      if (resolved.ok === false) {
        return { success: false, error: resolved.error, code: resolved.code };
      }

      const orderId = String(params.externalRef || '').trim();
      if (!orderId) {
        return { success: false, error: 'PayPal order id required', code: 'INVALID_EXTERNAL_REF' };
      }

      const auth = await fetchAccessToken(resolved.cfg);
      if (!auth.token) {
        return { success: false, error: auth.error || 'PayPal auth failed', code: 'PAYPAL_AUTH_FAILED' };
      }

      const res = await fetch(
        `${apiBase(resolved.cfg.mode)}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: '{}',
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        status?: string;
        purchase_units?: Array<{
          payments?: {
            captures?: Array<{
              status?: string;
              amount?: { value?: string; currency_code?: string };
            }>;
          };
        }>;
        message?: string;
        details?: Array<{ issue?: string; description?: string }>;
      };

      // ORDER_ALREADY_CAPTURED → treat as success for idempotency
      const already =
        res.status === 422 &&
        (data.details || []).some((d) => String(d.issue || '').toUpperCase() === 'ORDER_ALREADY_CAPTURED');

      if (!res.ok && !already) {
        const detail =
          data.details?.[0]?.description || data.message || `PayPal capture failed (${res.status})`;
        return { success: false, error: detail, code: 'PAYPAL_CAPTURE_FAILED' };
      }

      const status = already ? 'COMPLETED' : String(data.status || '');
      if (!already && status !== 'COMPLETED') {
        return {
          success: false,
          error: `PayPal order status is ${status || 'unknown'}`,
          code: 'PAYPAL_NOT_COMPLETED',
        };
      }

      const captureAmount = data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value;
      const amountUsd = captureAmount != null ? Number(captureAmount) : null;

      return {
        success: true,
        externalRef: orderId,
        status: 'COMPLETED',
        amountUsd: amountUsd != null && Number.isFinite(amountUsd) ? amountUsd : null,
      };
    },

    async parseWebhook(
      headers: Record<string, string | string[] | undefined>,
      body: unknown,
      rawBody?: string
    ): Promise<ParsedWebhookEvent> {
      const resolved = resolveConfig(mode, publicConfig, secrets);
      if (resolved.ok === false) {
        return { ok: false, error: resolved.error, code: resolved.code };
      }
      if (!resolved.cfg.webhookId) {
        return {
          ok: false,
          error: 'PayPal webhook_id not configured',
          code: 'PAYPAL_WEBHOOK_NOT_CONFIGURED',
        };
      }

      const transmissionId = headerVal(headers, 'paypal-transmission-id');
      const transmissionTime = headerVal(headers, 'paypal-transmission-time');
      const transmissionSig = headerVal(headers, 'paypal-transmission-sig');
      const certUrl = headerVal(headers, 'paypal-cert-url');
      const authAlgo = headerVal(headers, 'paypal-auth-algo');

      if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
        return { ok: false, error: 'Missing PayPal webhook signature headers', code: 'WEBHOOK_AUTH_FAILED' };
      }

      const auth = await fetchAccessToken(resolved.cfg);
      if (!auth.token) {
        return { ok: false, error: auth.error || 'PayPal auth failed', code: 'PAYPAL_AUTH_FAILED' };
      }

      let webhookEvent: unknown = body;
      if (rawBody) {
        try {
          webhookEvent = JSON.parse(rawBody);
        } catch {
          webhookEvent = body;
        }
      }

      const verifyRes = await fetch(
        `${apiBase(resolved.cfg.mode)}/v1/notifications/verify-webhook-signature`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            auth_algo: authAlgo,
            cert_url: certUrl,
            transmission_id: transmissionId,
            transmission_sig: transmissionSig,
            transmission_time: transmissionTime,
            webhook_id: resolved.cfg.webhookId,
            webhook_event: webhookEvent,
          }),
        }
      );
      const verifyData = (await verifyRes.json().catch(() => ({}))) as {
        verification_status?: string;
      };
      if (
        !verifyRes.ok ||
        String(verifyData.verification_status || '').toUpperCase() !== 'SUCCESS'
      ) {
        return { ok: false, error: 'PayPal webhook signature invalid', code: 'WEBHOOK_AUTH_FAILED' };
      }

      const event = (webhookEvent || body || {}) as {
        event_type?: string;
        resource?: {
          id?: string;
          status?: string;
          custom_id?: string;
          supplementary_data?: { related_ids?: { order_id?: string } };
          purchase_units?: Array<{ custom_id?: string; reference_id?: string }>;
        };
      };

      const eventType = String(event.event_type || '');
      const resource = event.resource || {};
      const purchaseId =
        resource.custom_id ||
        resource.purchase_units?.[0]?.custom_id ||
        resource.purchase_units?.[0]?.reference_id ||
        null;
      const orderId =
        resource.supplementary_data?.related_ids?.order_id ||
        (eventType.startsWith('CHECKOUT.ORDER.') ? resource.id : null) ||
        null;

      if (
        eventType === 'CHECKOUT.ORDER.APPROVED' ||
        eventType === 'PAYMENT.CAPTURE.COMPLETED' ||
        eventType === 'CHECKOUT.ORDER.COMPLETED'
      ) {
        return {
          ok: true,
          eventType,
          shouldComplete: true,
          purchaseId,
          externalRef: orderId || resource.id || null,
        };
      }

      if (
        eventType === 'CHECKOUT.ORDER.VOIDED' ||
        eventType === 'PAYMENT.CAPTURE.DENIED' ||
        eventType === 'PAYMENT.CAPTURE.REFUNDED'
      ) {
        return {
          ok: true,
          eventType,
          shouldFail: eventType !== 'PAYMENT.CAPTURE.REFUNDED',
          purchaseId,
          externalRef: orderId || resource.id || null,
          reason: eventType,
        };
      }

      return { ok: true, eventType, shouldComplete: false, shouldFail: false };
    },
  };
}
