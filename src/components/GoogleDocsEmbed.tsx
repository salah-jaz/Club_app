import { toGoogleDocsEmbedUrl } from "@/lib/googleDocs";

type Props = {
  title: string;
  url: string;
  /** Only mount the iframe while the parent dialog is open. */
  active?: boolean;
};

/**
 * Live Google Doc embed — HTML document view (not PDF, not /preview canvas).
 */
export function GoogleDocsEmbed({ title, url, active = true }: Props) {
  const src = toGoogleDocsEmbedUrl(url);

  return (
    <div className="flex-1 min-h-0 bg-white">
      {active && (
        <iframe
          title={title}
          src={src}
          className="w-full h-full border-0 bg-white"
          referrerPolicy="no-referrer-when-downgrade"
          allow="fullscreen"
        />
      )}
    </div>
  );
}
