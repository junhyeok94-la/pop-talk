"use client";

import Link from "next/link";
import { Children, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** 유튜브 링크(watch/youtu.be/embed/shorts)에서 11자리 video id 추출 */
const YOUTUBE_RE =
  /(?:youtube\.com\/(?:watch\?(?:[^\s"'<>]*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/gi;

function extractYouTubeIds(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(YOUTUBE_RE)) {
    if (match[1]) ids.add(match[1]);
  }
  return [...ids];
}

function extractMovieTitles(content: string) {
  const titles = new Map<string, string>();
  const recommendationTitle = /^\s*(?:#{1,6}\s*)?\d+[.)]\s+\*\*(.+?)\*\*/gm;
  for (const match of content.matchAll(recommendationTitle)) {
    const label = match[1]?.trim();
    if (!label) continue;
    const query = label.replace(/\s*\([^)]*\)\s*$/, "").trim();
    titles.set(label, query || label);
  }
  return titles;
}

function nodeText(children: ReactNode) {
  return Children.toArray(children)
    .filter((child): child is string | number => typeof child === "string" || typeof child === "number")
    .join("")
    .trim();
}

export function MarkdownViewer({ content }: { content: string }) {
  const videoIds = extractYouTubeIds(content);
  const movieTitles = extractMovieTitles(content);

  return (
    <div className="break-words text-[15px] leading-7 text-zinc-700 md:text-base md:leading-8 dark:text-zinc-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-3 mt-6 text-2xl font-extrabold first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-6 text-xl font-extrabold first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-5 text-lg font-bold first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-6">{children}</ol>,
          li: ({ children }) => <li className="pl-1 marker:font-bold marker:text-amber-600">{children}</li>,
          strong: ({ children }) => {
            const label = nodeText(children);
            const movieTitle = movieTitles.get(label);
            return movieTitle ? (
              <Link
                href={`/?movieQuery=${encodeURIComponent(movieTitle)}#all-movies`}
                title={`전체 영화에서 ${movieTitle} 검색`}
                className="font-extrabold text-amber-700 underline decoration-amber-400/60 underline-offset-4 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
              >
                {children}
              </Link>
            ) : (
              <strong className="font-extrabold text-zinc-900 dark:text-zinc-50">{children}</strong>
            );
          },
          blockquote: ({ children }) => <blockquote className="my-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-2 text-zinc-600 dark:bg-amber-950/30 dark:text-zinc-300">{children}</blockquote>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-400">{children}</a>,
          hr: () => <hr className="my-6 border-zinc-200 dark:border-zinc-800" />,
          code: ({ children }) => <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-sm dark:bg-zinc-800">{children}</code>,
        }}
      >
        {content}
      </ReactMarkdown>

      {videoIds.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {videoIds.map((id) => (
            <a
              key={id}
              href={`https://www.youtube.com/watch?v=${id}`}
              target="_blank"
              rel="noreferrer"
              aria-label="유튜브에서 영상 보기"
              className="group relative block overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
                alt="YouTube 썸네일"
                loading="lazy"
                className="aspect-video w-full bg-zinc-200 object-cover transition-transform group-hover:scale-[1.02] dark:bg-zinc-800"
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-10 w-14 items-center justify-center rounded-xl bg-red-600/90 shadow-lg transition-transform group-hover:scale-105">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
