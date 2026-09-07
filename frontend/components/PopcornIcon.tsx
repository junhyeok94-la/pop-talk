import { useId, type SVGProps } from "react";

export type PopcornFill = "empty" | "half" | "full";

const THEME = {
  full: { bucket: "#E23B36", bucketEdge: "#B02D29", stripe: "#FFF6F2", rim: "#FCEBE6", kernel: "#F6E4A8", kernelEdge: "#E1C57C", kernelHi: "#FFFDF3" },
  empty: { bucket: "#A6ABB3", bucketEdge: "#7C828B", stripe: "#F3F4F6", rim: "#E7E9EC", kernel: "#E6E8EB", kernelEdge: "#C7CCD2", kernelHi: "#FFFFFF" },
} as const;

export function PopcornIcon({
  fill = "full",
  ...props
}: { fill?: PopcornFill } & SVGProps<SVGSVGElement>) {
  const halfClipId = useId();
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <PopcornArtwork theme={THEME.empty} />
      {fill !== "empty" ? (
        <>
          <defs>
            <clipPath id={halfClipId}>
              <rect x="0" y="0" width={fill === "half" ? 12 : 24} height="24" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${halfClipId})`}><PopcornArtwork theme={THEME.full} /></g>
        </>
      ) : null}
    </svg>
  );
}

function PopcornArtwork({ theme: t }: { theme: (typeof THEME)[keyof typeof THEME] }) {
  const bucketClipId = useId();
  const bucketPath = "M5.2 12.2 H18.8 L17 21.8 H7 Z";
  return (
    <>
      <g fill={t.kernel} stroke={t.kernelEdge} strokeWidth="0.4">
        <circle cx="8.5" cy="7" r="2.7" /><circle cx="14" cy="6" r="2.9" /><circle cx="11.4" cy="8.6" r="3.1" /><circle cx="6.6" cy="9.6" r="2.4" /><circle cx="17.4" cy="9.4" r="2.5" /><circle cx="9.6" cy="10.6" r="2.5" /><circle cx="14.6" cy="10.6" r="2.5" /><circle cx="12" cy="11.4" r="2.7" />
      </g>
      <g fill={t.kernelHi} opacity="0.9"><circle cx="13.1" cy="5.1" r="0.7" /><circle cx="10.5" cy="7.8" r="0.6" /></g>
      <clipPath id={bucketClipId}><path d={bucketPath} /></clipPath>
      <path d={bucketPath} fill={t.bucket} />
      <g clipPath={`url(#${bucketClipId})`}><rect x="3.7" y="12" width="2.3" height="10" fill={t.stripe} /><rect x="8" y="12" width="2.3" height="10" fill={t.stripe} /><rect x="12.3" y="12" width="2.3" height="10" fill={t.stripe} /><rect x="16.6" y="12" width="2.3" height="10" fill={t.stripe} /></g>
      <path d={bucketPath} fill="none" stroke={t.bucketEdge} strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M4.7 12.2 Q12 10.3 19.3 12.2 Q12 13.7 4.7 12.2 Z" fill={t.rim} stroke={t.bucketEdge} strokeWidth="0.5" strokeLinejoin="round" />
    </>
  );
}
