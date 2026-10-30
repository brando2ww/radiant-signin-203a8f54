export interface MarketplaceReceiptOrder {
  source?: string | null;
  external_code?: string | null;
  external_collection_code?: string | null;
  external_payload?: { customer?: { phone?: { localizer?: string | number; localizerExpiration?: string } } } | null;
}

export function ifoodReceiptContact(order: MarketplaceReceiptOrder) {
  if (order.source !== "ifood") return null;
  const phone = order.external_payload?.customer?.phone;
  return {
    orderCode: order.external_code || null,
    localizer: phone?.localizer != null ? String(phone.localizer) : null,
    expiresAt: phone?.localizerExpiration || null,
    collectionCode: order.external_collection_code || null,
  };
}
