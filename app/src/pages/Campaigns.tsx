import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { CampaignSummary } from "../api/types";
import { useAuth } from "../context/AuthContext";

export function Campaigns() {
  const { token } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void api
      .listCampaigns(token)
      .then((r) => setCampaigns(r.campaigns))
      .catch(() => {
        setErr("Could not load campaigns.");
        setCampaigns([]);
      });
  }, [token]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-20 sm:py-24">
      <div className="opacity-0-start animate-fade-up">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">
          Campaigns
        </h1>
        <p className="mt-4 text-body text-secondary font-light leading-relaxed">
          Partner-backed tasks from creators you follow. Complete steps to earn
          tokens funded by partner ad spend.
        </p>
      </div>

      {err && <p className="mt-8 text-sm text-red-300/90">{err}</p>}

      {!err && campaigns.length === 0 && (
        <p className="mt-12 text-body text-secondary font-light">
          No campaigns yet. Run the backend seed to load demo data.
        </p>
      )}

      <ul className="mt-12 space-y-6">
        {campaigns.map((c) => (
          <li key={c.id} className="opacity-0-start animate-fade-up">
            <Link
              to={`/campaigns/${encodeURIComponent(c.id)}`}
              className="glass-panel-interactive block rounded-2xl p-7 text-left sm:p-8"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-secondary">
                {c.partnerName} · with {c.influencerName}
              </p>
              <h2 className="mt-3 font-display text-xl font-semibold text-primary">
                {c.title}
              </h2>
              {c.description && (
                <p className="mt-3 text-body text-secondary font-light leading-relaxed">
                  {c.description}
                </p>
              )}
              <p className="mt-4 text-sm text-violet-300/85">
                {c.taskCount} task{c.taskCount === 1 ? "" : "s"} → Open
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
