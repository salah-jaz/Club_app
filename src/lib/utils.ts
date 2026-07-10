import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hexToRgb(hex: string): [number, number, number] {
  const c = hex.substring(1);
  const num = parseInt(c.length === 3 ? c[0]+c[0]+c[1]+c[1]+c[2]+c[2] : c, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function applyCustomTheme(hex: string, secHex: string, isLight: boolean) {
  try {
    const root = document.documentElement;
    const rgb = hexToRgb(hex);
    const hsl = hexToHsl(hex);
    
    let primaryColor = hex;
    if (isLight) {
      const darkL = Math.max(20, hsl[2] - 10);
      primaryColor = `hsl(${hsl[0]}, ${hsl[1]}%, ${darkL}%)`;
    }

    root.style.setProperty('--primary', primaryColor);
    root.style.setProperty('--ring', primaryColor);
    root.style.setProperty('--sidebar-primary', primaryColor);
    root.style.setProperty('--sidebar-ring', primaryColor);
    root.style.setProperty('--violet', primaryColor);
    root.style.setProperty('--input-border-focus', primaryColor);
    root.style.setProperty('--accent-foreground', primaryColor);
    root.style.setProperty('--success-text', primaryColor);
    root.style.setProperty('--success-color', primaryColor);

    const [r, g, b] = rgb;
    root.style.setProperty('--border-accent', `rgba(${r}, ${g}, ${b}, ${isLight ? 0.25 : 0.35})`);
    root.style.setProperty('--violet-dim', `rgba(${r}, ${g}, ${b}, ${isLight ? 0.08 : 0.12})`);
    root.style.setProperty('--bg-glass', `rgba(${r}, ${g}, ${b}, ${isLight ? 0.02 : 0.03})`);

    // Gold / Secondary Color (Custom-defined by secHex)
    const secRgb = hexToRgb(secHex);
    const secHsl = hexToHsl(secHex);
    let goldColor = secHex;
    if (isLight) {
      const darkSecL = Math.max(25, secHsl[2] - 5);
      goldColor = `hsl(${secHsl[0]}, ${secHsl[1]}%, ${darkSecL}%)`;
    }
    
    root.style.setProperty('--gold', goldColor);
    root.style.setProperty('--gold-dim', `rgba(${secRgb[0]}, ${secRgb[1]}, ${secRgb[2]}, ${isLight ? 0.08 : 0.12})`);
    
    root.style.setProperty('--success-bg', `rgba(${r}, ${g}, ${b}, ${isLight ? 0.08 : 0.1})`);
    root.style.setProperty('--success-border', `rgba(${r}, ${g}, ${b}, ${isLight ? 0.15 : 0.2})`);
  } catch (e) {
    console.error(e);
  }
}
