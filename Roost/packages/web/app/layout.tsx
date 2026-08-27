import type { Metadata } from "next";
import "./globals.css";
import HeaderNav from "./HeaderNav";
import EmailAgentButton from "./EmailAgentButton";
import { getSessionUser } from "../lib/session";

export const metadata: Metadata = {
  title: "Roost",
  description: "AI agent that finds and negotiates office space.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // Read server-side so the floating button always shows whichever Gmail
  // address the agent is actually live on — no separate value to keep in
  // sync if that address ever changes.
  const agentEmail = process.env.GMAIL_AGENT_EMAIL;

  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
        <HeaderNav user={user} />
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
        {agentEmail && <EmailAgentButton agentEmail={agentEmail} />}
      </body>
    </html>
  );
}
