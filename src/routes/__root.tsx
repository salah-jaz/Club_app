import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Connect App — Badminton Club Management" },
      { name: "description", content: "Manage members, credits, play sessions, court rotations, and training." },
      { property: "og:title", content: "Connect App" },
      { property: "og:description", content: "Badminton club management made simple." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <HeadContent />
        <script
          id="theme-initializer"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('clubapp-theme');
                  if (theme === 'light') {
                    document.documentElement.classList.add('light');
                  } else {
                    document.documentElement.classList.remove('light');
                  }
                  var colorTheme = localStorage.getItem('clubapp-color-theme') || 'sapphire';
                  if (colorTheme === 'custom') {
                    document.documentElement.classList.add('theme-custom');
                    var hex = localStorage.getItem('clubapp-custom-hex') || '#10B981';
                    var secHex = localStorage.getItem('clubapp-custom-sec-hex') || '#2DD4BF';
                    var isLight = theme === 'light';
                    
                    var c = hex.substring(1);
                    var num = parseInt(c.length === 3 ? c[0]+c[0]+c[1]+c[1]+c[2]+c[2] : c, 16);
                    var r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
                    
                    var rNorm = r/255, gNorm = g/255, bNorm = b/255;
                    var max = Math.max(rNorm, gNorm, bNorm), min = Math.min(rNorm, gNorm, bNorm);
                    var h = 0, s = 0, l = (max + min) / 2;
                    if (max !== min) {
                      var d = max - min;
                      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                      if (max === rNorm) { h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); }
                      else if (max === gNorm) { h = (bNorm - rNorm) / d + 2; }
                      else { h = (rNorm - gNorm) / d + 4; }
                      h /= 6;
                    }
                    var hslH = Math.round(h * 360), hslS = Math.round(s * 100), hslL = Math.round(l * 100);
                    
                    var primaryColor = hex;
                    if (isLight) {
                      var darkL = Math.max(20, hslL - 10);
                      primaryColor = 'hsl(' + hslH + ', ' + hslS + '%, ' + darkL + '%)';
                    }
                    
                    var root = document.documentElement;
                    root.style.setProperty('--primary', primaryColor);
                    root.style.setProperty('--ring', primaryColor);
                    root.style.setProperty('--sidebar-primary', primaryColor);
                    root.style.setProperty('--sidebar-ring', primaryColor);
                    root.style.setProperty('--violet', primaryColor);
                    root.style.setProperty('--input-border-focus', primaryColor);
                    root.style.setProperty('--accent-foreground', primaryColor);
                    root.style.setProperty('--success-text', primaryColor);
                    root.style.setProperty('--success-color', primaryColor);
                    
                    root.style.setProperty('--border-accent', 'rgba(' + r + ',' + g + ',' + b + ',' + (isLight ? 0.25 : 0.35) + ')');
                    root.style.setProperty('--violet-dim', 'rgba(' + r + ',' + g + ',' + b + ',' + (isLight ? 0.08 : 0.12) + ')');
                    root.style.setProperty('--bg-glass', 'rgba(' + r + ',' + g + ',' + b + ',' + (isLight ? 0.02 : 0.03) + ')');
                    
                    // Parse secHex
                    var secC = secHex.substring(1);
                    var secNum = parseInt(secC.length === 3 ? secC[0]+secC[0]+secC[1]+secC[1]+secC[2]+secC[2] : secC, 16);
                    var secR = (secNum >> 16) & 255, secG = (secNum >> 8) & 255, secB = secNum & 255;
                    
                    var secRNorm = secR/255, secGNorm = secG/255, secBNorm = secB/255;
                    var secMax = Math.max(secRNorm, secGNorm, secBNorm), secMin = Math.min(secRNorm, secGNorm, secBNorm);
                    var secH = 0, secS = 0, secL = (secMax + secMin) / 2;
                    if (secMax !== secMin) {
                      var secD = secMax - secMin;
                      secS = secL > 0.5 ? secD / (2 - secMax - secMin) : secD / (secMax + secMin);
                      if (secMax === secRNorm) { secH = (secGNorm - secBNorm) / secD + (secGNorm < secBNorm ? 6 : 0); }
                      else if (secMax === secGNorm) { secH = (secBNorm - secRNorm) / secD + 2; }
                      else { secH = (secRNorm - secGNorm) / secD + 4; }
                      secH /= 6;
                    }
                    var secHslH = Math.round(secH * 360), secHslS = Math.round(secS * 100), secHslL = Math.round(secL * 100);
                    
                    var goldColor = secHex;
                    if (isLight) {
                      var darkSecL = Math.max(25, secHslL - 5);
                      goldColor = 'hsl(' + secHslH + ', ' + secHslS + '%, ' + darkSecL + '%)';
                    }
                    
                    root.style.setProperty('--gold', goldColor);
                    root.style.setProperty('--gold-dim', 'rgba(' + secR + ',' + secG + ',' + secB + ',' + (isLight ? 0.08 : 0.12) + ')');
                    
                    root.style.setProperty('--success-bg', 'rgba(' + r + ',' + g + ',' + b + ',' + (isLight ? 0.08 : 0.1) + ')');
                    root.style.setProperty('--success-border', 'rgba(' + r + ',' + g + ',' + b + ',' + (isLight ? 0.15 : 0.2) + ')');
                  } else {
                    if (colorTheme !== 'sapphire') {
                      document.documentElement.classList.add('theme-' + colorTheme);
                    }
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
