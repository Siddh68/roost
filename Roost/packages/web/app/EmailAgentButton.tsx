"use client";

import { useEffect, useRef, useState } from "react";

export default function EmailAgentButton({ agentEmail }: { agentEmail: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(agentEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied — the mailto: link below still works
    }
  }

  return (
    <div ref={rootRef} className="email-agent-root">
      {open && (
        <div className="email-agent-card">
          <p className="email-agent-card-title">Email our AI agent</p>
          <p className="email-agent-card-body">
            Send your requirements — team size, budget, area — straight to this address. No forms needed: the
            agent reads your email, searches and scores listings, and starts negotiating with landlords on your
            behalf automatically.
          </p>
          <div className="email-agent-address-row">
            <a href={`mailto:${agentEmail}`} className="email-agent-address">
              {agentEmail}
            </a>
            <button type="button" onClick={copyEmail} className="email-agent-copy">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="email-agent-fab"
        aria-label="Email our AI agent"
        title="Chat with our agent by email"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z"
            stroke="#06210f"
            strokeWidth="1.7"
          />
          <path d="M4 6.5 12 13l8-6.5" stroke="#06210f" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <style>{`
        .email-agent-root {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          z-index: 50;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.75rem;
        }
        .email-agent-fab {
          width: 3.25rem;
          height: 3.25rem;
          border-radius: 9999px;
          background: var(--accent);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
          transition: transform 0.15s ease, opacity 0.15s ease;
        }
        .email-agent-fab:hover {
          transform: scale(1.06);
          opacity: 0.92;
        }
        .email-agent-card {
          width: 17.5rem;
          border-radius: 0.75rem;
          border: 1px solid var(--border);
          background: var(--surface-raised);
          padding: 1rem;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
        }
        .email-agent-card-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 0.4rem;
        }
        .email-agent-card-body {
          font-size: 0.78rem;
          line-height: 1.35;
          color: var(--text-secondary);
          margin: 0 0 0.75rem;
        }
        .email-agent-address-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .email-agent-address {
          flex: 1;
          font-size: 0.78rem;
          color: var(--accent);
          text-decoration: none;
          word-break: break-all;
        }
        .email-agent-address:hover {
          text-decoration: underline;
        }
        .email-agent-copy {
          flex-shrink: 0;
          font-size: 0.72rem;
          padding: 0.3rem 0.55rem;
          border-radius: 0.4rem;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-primary);
          cursor: pointer;
        }
        .email-agent-copy:hover {
          border-color: var(--accent);
        }
      `}</style>
    </div>
  );
}
