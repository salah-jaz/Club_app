import type { TouchEvent, WheelEvent } from "react";
import { toGoogleDocsEmbedUrl } from "@/lib/googleDocs";

type Props = {
  title: string;
  url: string;
  /** Only mount the iframe while the parent dialog is open. */
  active?: boolean;
};

/** Keep wheel/touch scroll on this pane (dialog / remove-scroll traps). */
function keepScrollLocal(e: WheelEvent | TouchEvent) {
  e.stopPropagation();
}

/**
 * Live Google Doc embed — HTML document view (not PDF, not /preview canvas).
 *
 * On mobile, Radix Dialog's remove-scroll blocks touch scrolling inside
 * cross-origin iframes. Gestures are handed to this outer pane instead
 * (tall iframe + pointer-events-none). Desktop keeps normal iframe scroll.
 */
export function GoogleDocsEmbed({ title, url, active = true }: Props) {
  const src = toGoogleDocsEmbedUrl(url);

  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y bg-white [-webkit-overflow-scrolling:touch] sm:overflow-hidden"
      onWheel={keepScrollLocal}
      onTouchMove={keepScrollLocal}
    >
      {active && (
        <iframe
          title={title}
          src={src}
          className="block w-full border-0 bg-white h-[max(100%,3200px)] pointer-events-none sm:h-full sm:min-h-full sm:pointer-events-auto"
          referrerPolicy="no-referrer-when-downgrade"
          allow="fullscreen"
          tabIndex={-1}
        />
      )}
    </div>
  );
}
