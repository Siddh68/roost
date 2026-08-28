"use client";

import { useRef, useState } from "react";

export default function PromoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  function handlePlay() {
    const video = videoRef.current;
    if (!video) return;
    video.play();
    setPlaying(true);
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--border)", background: "var(--surface)", aspectRatio: "16 / 9" }}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        poster="/videos/roost-promo-poster.jpg"
        controls={playing}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        playsInline
        preload="metadata"
      >
        <source src="/videos/roost-promo.webm" type="video/webm" />
        <source src="/videos/roost-promo.mp4" type="video/mp4" />
      </video>

      {!playing && (
        <button
          type="button"
          onClick={handlePlay}
          aria-label="Play the Roost product tour"
          className="absolute inset-0 flex items-center justify-center transition hover:bg-black/10"
        >
          <span
            className="flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition group-hover:scale-105"
            style={{ background: "var(--accent)" }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="#06210f" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
