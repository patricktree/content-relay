# Use opaque cursor pagination for Deliveries

Delivery history uses opaque cursor pagination instead of offset pagination or timestamp-only cursors. The Relay Hub owns the cursor internals so it can page stably across Deliveries that share the same creation time, while clients only depend on a `cursor` request value and `nextCursor` response value.
