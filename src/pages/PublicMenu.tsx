import { useParams, useSearchParams } from "react-router-dom";
import { PublicMenuHeader } from "@/components/public-menu/PublicMenuHeader";
import { CategoryNav } from "@/components/public-menu/CategoryNav";
import { ProductList } from "@/components/public-menu/ProductList";
import { ShoppingCart } from "@/components/public-menu/ShoppingCart";
import { ActiveOrderChip } from "@/components/public-menu/ActiveOrderChip";
import { PublicMenuRealtime } from "@/components/public-menu/PublicMenuRealtime";
import { useState, useEffect } from "react";
import { usePublicCategories, usePublicProducts, useBusinessSettings } from "@/hooks/use-public-menu";
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMarketingTracking } from "@/hooks/use-marketing-tracking";
import { trackFunnelEvent } from "@/hooks/use-delivery-funnel";

export interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  selectedOptions: {
    optionId: string;
    optionName: string;
    itemId: string;
    itemName: string;
    priceAdjustment: number;
    quantity?: number;
  }[];
  notes?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PublicMenu = () => {
  const { userId: handle } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  const initialCoupon = searchParams.get("cupom") || undefined;
  const [cart, setCart] = useState<CartItem[]>([]);
  const { trackPageView } = useMarketingTracking();

  // Resolve slug → user_id quando o parâmetro não for UUID
  const { data: resolvedUserId, isLoading: resolvingHandle } = useQuery({
    queryKey: ["resolve-menu-handle", handle],
    queryFn: async () => {
      if (!handle) return null;
      if (UUID_RE.test(handle)) return handle;
      const { data, error } = await supabase.rpc("resolve_business_slug", {
        _slug: handle,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    enabled: !!handle,
    staleTime: 1000 * 60 * 5,
  });

  const userId = resolvedUserId || undefined;

  const { data: categories = [] } = usePublicCategories(userId || "");
  const { data: products = [] } = usePublicProducts(userId || "");
  const { data: businessSettings } = useBusinessSettings(userId || "");

  // Dynamic browser tab title + favicon
  const originalTitleRef = useRef<string>(typeof document !== "undefined" ? document.title : "");
  const originalFaviconHrefRef = useRef<string | null>(null);
  const createdFaviconRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (originalFaviconHrefRef.current === null) {
      const existing = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      originalFaviconHrefRef.current = existing?.href ?? "";
    }

    if (resolvingHandle) {
      document.title = "Carregando cardápio...";
      return;
    }
    if (!userId) {
      document.title = "Cardápio não encontrado";
      return;
    }
    if (businessSettings?.business_name) {
      document.title = businessSettings.business_name;
    }
    const logoUrl = businessSettings?.logo_url;
    if (logoUrl) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
        createdFaviconRef.current = true;
      }
      link.href = logoUrl;
    }
  }, [resolvingHandle, userId, businessSettings?.business_name, businessSettings?.logo_url]);

  useEffect(() => {
    return () => {
      if (typeof document === "undefined") return;
      document.title = originalTitleRef.current;
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (link) {
        if (createdFaviconRef.current) {
          link.parentNode?.removeChild(link);
        } else if (originalFaviconHrefRef.current !== null) {
          link.href = originalFaviconHrefRef.current;
        }
      }
    };
  }, []);

  // Fetch marketing settings
  const { data: settings } = useQuery({
    queryKey: ["delivery-settings-public", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("delivery_settings")
        .select("meta_pixel_id, google_tag_id")
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  // Inject Meta Pixel
  useEffect(() => {
    if (!settings?.meta_pixel_id) return;

    const script = document.createElement("script");
    script.innerHTML = `
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${settings.meta_pixel_id}');
    `;
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [settings?.meta_pixel_id]);

  // Inject Google Tag
  useEffect(() => {
    if (!settings?.google_tag_id) return;

    const tagId = settings.google_tag_id;
    
    if (tagId.startsWith('GTM-')) {
      // Google Tag Manager
      const script = document.createElement("script");
      script.innerHTML = `
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','${tagId}');
      `;
      document.head.appendChild(script);
      return () => {
        document.head.removeChild(script);
      };
    } else if (tagId.startsWith('G-')) {
      // Google Analytics 4
      const script1 = document.createElement("script");
      script1.src = `https://www.googletagmanager.com/gtag/js?id=${tagId}`;
      script1.async = true;
      document.head.appendChild(script1);

      const script2 = document.createElement("script");
      script2.innerHTML = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${tagId}');
      `;
      document.head.appendChild(script2);

      return () => {
        document.head.removeChild(script1);
        document.head.removeChild(script2);
      };
    }
  }, [settings?.google_tag_id]);

  // Track page view
  useEffect(() => {
    if (settings?.meta_pixel_id || settings?.google_tag_id) {
      trackPageView();
    }
  }, [settings, trackPageView]);

  // Track funnel page_view
  useEffect(() => {
    if (userId) {
      trackFunnelEvent(userId, "page_view");
    }
  }, [userId]);

  const addToCart = (item: CartItem) => {
    setCart((prev) => [...prev, item]);
    if (userId) {
      trackFunnelEvent(userId, "add_to_cart", { productId: item.productId, name: item.name });
    }
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(index);
      return;
    }
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  if (resolvingHandle) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Carregando cardápio...</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Cardápio não encontrado</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicMenuHeader userId={userId} />
      
      <div className="sticky top-0 z-30 bg-background border-b">
        <CategoryNav categories={categories} />
      </div>

      <div className="container mx-auto px-4 py-6 pb-32">
        <ProductList
          products={products}
          categories={categories}
          onAddToCart={addToCart}
        />
      </div>

      <ShoppingCart
        cart={cart}
        onRemoveItem={removeFromCart}
        onUpdateQuantity={updateQuantity}
        onClearCart={clearCart}
        userId={userId}
        initialCoupon={initialCoupon}
      />

      <ActiveOrderChip userId={userId} />
    </div>
  );
};

export default PublicMenu;
