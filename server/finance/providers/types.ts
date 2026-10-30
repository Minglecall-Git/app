/**
 * Payment gateway provider contract — create checkout, capture/verify, parse webhooks.
 */

export type GatewayMode = 'sandbox' | 'live';

export interface GatewaySecrets {
  client_id?: string;
  client_secret?: string;
  webhook_id?: string;
  [key: string]: string | undefined;
}

export interface PaymentGatewayRow {
  id: string;
  display_name: string;
  enabled: boolean;
  is_active: boolean;
  mode: GatewayMode;
  public_config: Record<string, unknown>;
  secrets_encrypted: GatewaySecrets;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface CreateCheckoutParams {
  purchaseId: string;
  amountUsd: number;
  currency?: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  /** Opaque correlation id stored on the PSP order (usually purchaseId). */
  customId?: string;
}

export interface CreateCheckoutResult {
  success: boolean;
  externalRef?: string;
  approvalUrl?: string;
  error?: string;
  code?: string;
}

export interface CaptureOrVerifyParams {
  externalRef: string;
  purchaseId?: string;
}

export interface CaptureOrVerifyResult {
  success: boolean;
  externalRef?: string;
  status?: string;
  amountUsd?: number | null;
  error?: string;
  code?: string;
}

export interface ParsedWebhookEvent {
  ok: boolean;
  eventType?: string;
  /** Complete / credit the purchase when true. */
  shouldComplete?: boolean;
  /** Mark purchase failed when true. */
  shouldFail?: boolean;
  purchaseId?: string | null;
  externalRef?: string | null;
  reason?: string | null;
  error?: string;
  code?: string;
}

export interface PaymentGatewayProvider {
  readonly id: string;
  createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult>;
  captureOrVerify(params: CaptureOrVerifyParams): Promise<CaptureOrVerifyResult>;
  parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    rawBody?: string
  ): Promise<ParsedWebhookEvent>;
}
