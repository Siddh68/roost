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
          <div className="email-agent-card-header">
            <span className="email-agent-icon" aria-hidden="true">
              🪺
            </span>
            <div>
              <p className="email-agent-card-title">AI Agent</p>
              <p className="email-agent-card-sub">Email our AI agent</p>
            </div>
          </div>
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

      <div className="email-agent-trigger">
        {!open && <span className="email-agent-label">AI Agent</span>}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="email-agent-fab"
          aria-label="Email our AI agent"
          title="Chat with our agent by email"
        >
          <span className="email-agent-dot" aria-hidden="true" />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z"
              stroke="#06210f"
              strokeWidth="1.7"
            />
            <path d="M4 6.5 12 13l8-6.5" stroke="#06210f" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <style>{`
        .email-agent-root {
          position: fixed;
          bottom: 1.25rem;
          right: 1.25rem;
          z-index: 50;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.875rem;
          max-width: calc(100vw - 2.5rem);
        }
        @media (min-width: 640px) {
          .email-agent-root {
            bottom: 1.75rem;
            right: 1.75rem;
          }
        }
        .email-agent-trigger {
          display: flex;
          align-items: center;
          gap: 0.625rem;
        }
        .email-agent-label {
          border-radius: 9999px;
          border: 1px solid var(--border);
          background: var(--surface-raised);
          color: var(--text-primary);
          padding: 0.5rem 0.9rem;
          font-size: 0.78rem;
          font-weight: 500;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
          white-space: nowrap;
        }
        .email-agent-fab {
          position: relative;
          width: 3.5rem;
          height: 3.5rem;
          border-radius: 9999px;
          background: var(--accent);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), 0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent);
          transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
        }
        .email-agent-fab:hover {
          transform: scale(1.06);
          opacity: 0.92;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5), 0 0 0 5px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .email-agent-dot {
          position: absolute;
          top: -1px;
          right: -1px;
          width: 0.7rem;
          height: 0.7rem;
          border-radius: 9999px;
          background: var(--info);
          border: 2px solid var(--background);
        }
        .email-agent-card {
          width: min(18.5rem, calc(100vw - 2.5rem));
          border-radius: 1rem;
          border: 1px solid var(--border);
          border-left: 3px solid var(--accent);
          background: var(--surface-raised);
          padding: 1.1rem;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
        }
        .email-agent-card-header {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          margin-bottom: 0.7rem;
        }
        .email-agent-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2.1rem;
          height: 2.1rem;
          border-radius: 9999px;
          background: var(--accent-dim);
          font-size: 1rem;
          flex-shrink: 0;
        }
        .email-agent-card-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }
        .email-agent-card-sub {
          font-size: 0.72rem;
          color: var(--text-secondary);
          margin: 0.1rem 0 0;
        }
        .email-agent-card-body {
          font-size: 0.78rem;
          line-height: 1.4;
          color: var(--text-secondary);
          margin: 0 0 0.85rem;
        }
        .email-agent-address-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border-radius: 0.6rem;
          border: 1px solid var(--border);
          background: var(--background);
          padding: 0.45rem 0.5rem 0.45rem 0.7rem;
        }
        .email-agent-address {
          flex: 1;
          font-size: 0.76rem;
          color: var(--text-primary);
          text-decoration: none;
          word-break: break-all;
        }
        .email-agent-address:hover {
          color: var(--accent);
        }
        .email-agent-copy {
          flex-shrink: 0;
          font-size: 0.72rem;
          font-weight: 500;
          padding: 0.35rem 0.6rem;
          border-radius: 0.4rem;
          border: none;
          background: var(--accent);
          color: #06210f;
          cursor: pointer;
          transition: opacity 0.15s ease;
        }
        .email-agent-copy:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
