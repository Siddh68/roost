import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./Sidebar";
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
        {user && <Sidebar user={user} />}
        <main className={user ? "px-4 py-6 sm:px-6 lg:ml-60 lg:px-8 lg:py-8" : ""}>
          <div className={user ? "mx-auto max-w-5xl" : ""}>{children}</div>
        </main>
        {agentEmail && <EmailAgentButton agentEmail={agentEmail} />}
      </body>
    </html>
  );
}
