import { useCallback } from "react";
import { CartItem } from "@/pages/PublicMenu";

declare global {
  interface Window {
    fbq?: (action: string, event: string, params?: any) => void;
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

export const useMarketingTracking = () => {
  const trackEvent = useCallback((fbEvent: string, gaEvent: string, params?: any) => {
    // Meta Pixel
    if (window.fbq) {
      window.fbq('track', fbEvent, params);
    }

    // Google Analytics / Tag Manager
    if (window.gtag) {
      window.gtag('event', gaEvent, params);
    } else if (window.dataLayer) {
      window.dataLayer.push({
        event: gaEvent,
        ...params,
      });
    }
  }, []);

  const trackPageView = useCallback(() => {
    trackEvent('PageView', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
    });
  }, [trackEvent]);

  const trackViewItem = useCallback((product: {
    id: string;
    name: string;
    price: number;
    category?: string;
  }) => {
    trackEvent('ViewContent', 'view_item', {
      content_ids: [product.id],
      content_name: product.name,
      content_type: 'product',
      value: product.price,
      currency: 'BRL',
      items: [{
        item_id: product.id,
        item_name: product.name,
        price: product.price,
        item_category: product.category || 'Sem Categoria',
      }],
    });
  }, [trackEvent]);

  const trackAddToCart = useCallback((item: CartItem) => {
    const itemTotal = item.unitPrice + item.selectedOptions.reduce((s, opt) => s + opt.priceAdjustment * (opt.quantity ?? 1), 0);
    const totalValue = itemTotal * item.quantity;

    trackEvent('AddToCart', 'add_to_cart', {
      content_ids: [item.productId],
      content_name: item.name,
      content_type: 'product',
      value: totalValue,
      currency: 'BRL',
      items: [{
        item_id: item.productId,
        item_name: item.name,
        price: itemTotal,
        quantity: item.quantity,
      }],
    });
  }, [trackEvent]);

  const trackBeginCheckout = useCallback((cart: CartItem[], total: number) => {
    const items = cart.map(item => {
      const itemTotal = item.unitPrice + item.selectedOptions.reduce((s, opt) => s + opt.priceAdjustment * (opt.quantity ?? 1), 0);
      return {
        item_id: item.productId,
        item_name: item.name,
        price: itemTotal,
        quantity: item.quantity,
      };
    });

    trackEvent('InitiateCheckout', 'begin_checkout', {
      value: total,
      currency: 'BRL',
      num_items: cart.reduce((sum, item) => sum + item.quantity, 0),
      items,
    });
  }, [trackEvent]);

  const trackPurchase = useCallback((order: {
    orderId: string;
    total: number;
    subtotal: number;
    deliveryFee: number;
    discount: number;
    cart: CartItem[];
  }) => {
    const items = order.cart.map(item => {
      const itemTotal = item.unitPrice + item.selectedOptions.reduce((s, opt) => s + opt.priceAdjustment * (opt.quantity ?? 1), 0);
      return {
        item_id: item.productId,
        item_name: item.name,
        price: itemTotal,
        quantity: item.quantity,
      };
    });

    trackEvent('Purchase', 'purchase', {
      transaction_id: order.orderId,
      value: order.total,
      currency: 'BRL',
      tax: 0,
      shipping: order.deliveryFee,
      discount: order.discount,
      items,
    });
  }, [trackEvent]);

  return {
    trackPageView,
    trackViewItem,
    trackAddToCart,
    trackBeginCheckout,
    trackPurchase,
  };
};