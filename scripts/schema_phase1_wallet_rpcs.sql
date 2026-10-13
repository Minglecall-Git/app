-- Atomic gift spend (FOR UPDATE + ledger + idempotency_key)
CREATE OR REPLACE FUNCTION public.gift_spend_atomic(
    p_sender_id TEXT,
    p_receiver_id TEXT,
    p_tl_id TEXT,
    p_coins INT,
    p_host_coins INT,
    p_tl_coins INT,
    p_idempotency_key TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_sender_balance BIGINT;
    v_host_earnings BIGINT := 0;
    v_tl_earnings BIGINT := 0;
    v_host_earned INT;
    v_tl_earned INT;
    v_key TEXT;
BEGIN
    v_key := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
    IF p_sender_id IS NULL OR p_receiver_id IS NULL OR v_key IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'sender_id, receiver_id, and idempotency_key required',
            'error_code', 'INVALID_INPUT'
        );
    END IF;

    IF p_coins IS NULL OR p_coins <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'Invalid coins',
            'error_code', 'INVALID_AMOUNT'
        );
    END IF;

    v_host_earned := GREATEST(0, COALESCE(p_host_coins, 0));
    v_tl_earned := GREATEST(0, COALESCE(p_tl_coins, 0));
    IF (v_host_earned + v_tl_earned) > p_coins THEN
        IF v_tl_earned > p_coins THEN
            v_tl_earned := p_coins;
            v_host_earned := 0;
        ELSE
            v_host_earned := p_coins - v_tl_earned;
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.wallet_ledger WHERE idempotency_key = v_key
    ) THEN
        SELECT coin_balance INTO v_sender_balance FROM public.profiles WHERE id = p_sender_id;
        SELECT earnings_coins INTO v_host_earnings FROM public.profiles WHERE id = p_receiver_id;
        IF p_tl_id IS NOT NULL AND p_tl_id <> '' THEN
            SELECT earnings_coins INTO v_tl_earnings FROM public.profiles WHERE id = p_tl_id;
        END IF;
        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'new_sender_balance', COALESCE(v_sender_balance, 0),
            'new_host_earnings', COALESCE(v_host_earnings, 0),
            'new_tl_earnings', COALESCE(v_tl_earnings, 0),
            'coins_spent', p_coins,
            'host_coins_earned', v_host_earned,
            'tl_coins_earned', v_tl_earned
        );
    END IF;

    SELECT coin_balance INTO v_sender_balance
    FROM public.profiles
    WHERE id = p_sender_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'Sender not found',
            'error_code', 'SENDER_NOT_FOUND'
        );
    END IF;

    IF v_sender_balance < p_coins THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'INSUFFICIENT_BALANCE',
            'error_code', 'INSUFFICIENT_BALANCE',
            'new_sender_balance', v_sender_balance
        );
    END IF;

    UPDATE public.profiles
    SET coin_balance = coin_balance - p_coins,
        updated_at = now()
    WHERE id = p_sender_id
    RETURNING coin_balance INTO v_sender_balance;

    INSERT INTO public.wallet_ledger (
        user_id, call_id, transaction_type, amount, balance_after, billing_minute, metadata, idempotency_key
    ) VALUES (
        p_sender_id, v_key, 'GIFT_DEBIT', -p_coins, v_sender_balance, 0,
        COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('kind', 'gift', 'side', 'sender'),
        v_key
    );

    IF v_host_earned > 0 THEN
        UPDATE public.profiles
        SET earnings_coins = COALESCE(earnings_coins, 0) + v_host_earned,
            updated_at = now()
        WHERE id = p_receiver_id
        RETURNING earnings_coins INTO v_host_earnings;

        IF FOUND THEN
            INSERT INTO public.wallet_ledger (
                user_id, call_id, transaction_type, amount, balance_after, billing_minute, metadata
            ) VALUES (
                p_receiver_id, v_key, 'HOST_EARN', v_host_earned, v_host_earnings, 0,
                COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('kind', 'gift', 'side', 'host')
            );
        ELSE
            v_host_earned := 0;
        END IF;
    END IF;

    IF v_tl_earned > 0 AND p_tl_id IS NOT NULL AND p_tl_id <> '' THEN
        UPDATE public.profiles
        SET earnings_coins = COALESCE(earnings_coins, 0) + v_tl_earned,
            updated_at = now()
        WHERE id = p_tl_id
        RETURNING earnings_coins INTO v_tl_earnings;

        IF FOUND THEN
            INSERT INTO public.wallet_ledger (
                user_id, call_id, transaction_type, amount, balance_after, billing_minute, metadata
            ) VALUES (
                p_tl_id, v_key, 'TL_EARN', v_tl_earned, v_tl_earnings, 0,
                COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('kind', 'gift', 'side', 'team_leader')
            );
        ELSE
            v_tl_earned := 0;
            v_tl_earnings := 0;
        END IF;
    ELSE
        v_tl_earned := 0;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'new_sender_balance', v_sender_balance,
        'new_host_earnings', COALESCE(v_host_earnings, 0),
        'new_tl_earnings', COALESCE(v_tl_earnings, 0),
        'coins_spent', p_coins,
        'host_coins_earned', v_host_earned,
        'tl_coins_earned', v_tl_earned
    );
EXCEPTION WHEN unique_violation THEN
    SELECT coin_balance INTO v_sender_balance FROM public.profiles WHERE id = p_sender_id;
    SELECT earnings_coins INTO v_host_earnings FROM public.profiles WHERE id = p_receiver_id;
    IF p_tl_id IS NOT NULL AND p_tl_id <> '' THEN
        SELECT earnings_coins INTO v_tl_earnings FROM public.profiles WHERE id = p_tl_id;
    END IF;
    RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'new_sender_balance', COALESCE(v_sender_balance, 0),
        'new_host_earnings', COALESCE(v_host_earnings, 0),
        'new_tl_earnings', COALESCE(v_tl_earnings, 0),
        'coins_spent', p_coins,
        'host_coins_earned', GREATEST(0, COALESCE(p_host_coins, 0)),
        'tl_coins_earned', GREATEST(0, COALESCE(p_tl_coins, 0))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic coin purchase credit
CREATE OR REPLACE FUNCTION public.complete_coin_purchase_atomic(
    p_user_id TEXT,
    p_amount_coins INT,
    p_idempotency_key TEXT,
    p_purchase_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_balance BIGINT;
    v_key TEXT;
    v_ledger_id UUID;
    v_coins INT;
BEGIN
    v_key := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
    IF p_user_id IS NULL OR v_key IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'user_id and idempotency_key required',
            'error_code', 'INVALID_INPUT'
        );
    END IF;

    v_coins := GREATEST(0, COALESCE(p_amount_coins, 0));
    IF v_coins <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'amount_coins must be positive',
            'error_code', 'INVALID_AMOUNT'
        );
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.wallet_ledger
        WHERE idempotency_key = v_key AND transaction_type = 'PURCHASE'
    ) THEN
        SELECT id, balance_after INTO v_ledger_id, v_balance
        FROM public.wallet_ledger
        WHERE idempotency_key = v_key AND transaction_type = 'PURCHASE'
        LIMIT 1;
        SELECT coin_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'coin_balance', COALESCE(v_balance, 0),
            'wallet_ledger_id', v_ledger_id
        );
    END IF;

    SELECT coin_balance INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'Profile not found',
            'error_code', 'NOT_FOUND'
        );
    END IF;

    UPDATE public.profiles
    SET coin_balance = COALESCE(coin_balance, 0) + v_coins,
        updated_at = now()
    WHERE id = p_user_id
    RETURNING coin_balance INTO v_balance;

    INSERT INTO public.wallet_ledger (
        user_id, call_id, transaction_type, amount, balance_after, billing_minute, metadata, idempotency_key
    ) VALUES (
        p_user_id, v_key, 'PURCHASE', v_coins, v_balance, 0,
        COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('kind', 'purchase'),
        v_key
    )
    RETURNING id INTO v_ledger_id;

    IF p_purchase_id IS NOT NULL THEN
        UPDATE public.coin_purchases
        SET status = 'completed',
            wallet_ledger_id = v_ledger_id,
            completed_at = now()
        WHERE id = p_purchase_id
          AND status = 'pending';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'coin_balance', v_balance,
        'wallet_ledger_id', v_ledger_id
    );
EXCEPTION WHEN unique_violation THEN
    SELECT coin_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    SELECT id INTO v_ledger_id FROM public.wallet_ledger
    WHERE idempotency_key = v_key AND transaction_type = 'PURCHASE' LIMIT 1;
    RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'coin_balance', COALESCE(v_balance, 0),
        'wallet_ledger_id', v_ledger_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.gift_spend_atomic(TEXT, TEXT, TEXT, INT, INT, INT, TEXT, JSONB) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.complete_coin_purchase_atomic(TEXT, INT, TEXT, UUID, JSONB) TO postgres, service_role;
