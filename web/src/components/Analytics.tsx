"use client";
/**
 * The third-party measurement, and the arrival the server counts (docs/SPEC-ADMIN-METRICS.md).
 *
 * Every script here is off unless its env var is set on Vercel, so a fresh deploy, the
 * static demo and every test run load nothing from anyone:
 *
 *   NEXT_PUBLIC_POSTHOG_KEY        PostHog product analytics (NEXT_PUBLIC_POSTHOG_HOST, default US cloud)
 *   NEXT_PUBLIC_META_PIXEL_ID      Meta (Facebook/Instagram) pixel
 *   NEXT_PUBLIC_REDDIT_PIXEL_ID    Reddit pixel
 *   NEXT_PUBLIC_GOOGLE_ADS_ID      Google Ads tag (AW-…); NEXT_PUBLIC_GOOGLE_ADS_SEND_TO for the purchase conversion
 *
 * PostHog runs without autocapture or session recording, and page views are sent with any
 * long number in the path masked, so a league id never leaves for a vendor.
 */
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { logArrival } from "@/lib/api";
import { captureArrival, pixel } from "@/lib/track";

/** An id pasted into an inline script: nothing but the characters ids are made of. */
function safeId(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "");
}

const POSTHOG_KEY = safeId(process.env.NEXT_PUBLIC_POSTHOG_KEY);
const POSTHOG_HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/[^A-Za-z0-9:/._-]/g, "");
const META_ID = safeId(process.env.NEXT_PUBLIC_META_PIXEL_ID);
const REDDIT_ID = safeId(process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID);
const GOOGLE_ID = safeId(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID);

/** A path with every run of five or more digits masked: league and team ids stay home. */
export function maskedPath(path: string): string {
  return path.replace(/\d{5,}/g, ":id");
}

function PageViews() {
  const path = usePathname();
  useEffect(() => {
    if (!POSTHOG_KEY || !path) return;
    const w = window as unknown as { posthog?: { capture?: (e: string, p: object) => void } };
    try {
      w.posthog?.capture?.("$pageview", { $current_url: window.location.origin + maskedPath(path) });
    } catch {
      /* a blocked script is the normal case */
    }
  }, [path]);
  return null;
}

export default function Analytics() {
  useEffect(() => {
    const { arrived, attr } = captureArrival();
    if (!arrived) return;
    logArrival(attr).catch(() => {
      /* the landing count is best-effort; a sign-up is logged by the server regardless */
    });
    pixel("landing");
  }, []);

  return (
    <>
      {POSTHOG_KEY && (
        <>
          <Script id="posthog" strategy="afterInteractive">
            {`!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister identify alias reset opt_out_capturing opt_in_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('${POSTHOG_KEY}',{api_host:'${POSTHOG_HOST}',person_profiles:'identified_only',autocapture:false,capture_pageview:false,disable_session_recording:true});`}
          </Script>
          <PageViews />
        </>
      )}
      {META_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${META_ID}');fbq('track','PageView');`}
        </Script>
      )}
      {REDDIT_ID && (
        <Script id="reddit-pixel" strategy="afterInteractive">
          {`!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);
rdt('init','${REDDIT_ID}');rdt('track','PageVisit');`}
        </Script>
      )}
      {GOOGLE_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ID}`} strategy="afterInteractive" />
          <Script id="google-ads" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GOOGLE_ID}');`}
          </Script>
        </>
      )}
    </>
  );
}
