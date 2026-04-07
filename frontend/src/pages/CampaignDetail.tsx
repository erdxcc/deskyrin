import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { CampaignDetail as CampaignDetailData } from "../api/types";
import { useAuth } from "../context/AuthContext";

export function CampaignDetailPage() {
  const { campaignId = "" } = useParams<{ campaignId: string }>();
  const { token, user, refreshUser } = useAuth();
  const [campaign, setCampaign] = useState<CampaignDetailData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId.trim()) return;
    setLoadErr(null);
    void api
      .getCampaign(campaignId, token)
      .then(setCampaign)
      .catch(() => {
        setCampaign(null);
        setLoadErr("Campaign not found.");
      });
  }, [campaignId, token]);

  async function onRecordStep(taskId: string) {
    if (!token) return;
    setActionErr(null);
    setToast(null);
    setBusyTaskId(taskId);
    try {
      const r = await api.recordTaskStep(token, taskId);
      setCampaign(r.campaign);
      await refreshUser();
      if (r.awardedAc > 0) {
        setToast(`Earned ${r.awardedAc} AC.`);
      } else {
        setToast("Saved.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not record.";
      if (msg.includes("TASK_ALREADY_COMPLETED")) {
        setActionErr("Task already completed.");
      } else {
        setActionErr(msg);
      }
    } finally {
      setBusyTaskId(null);
    }
  }

  if (loadErr && !campaign) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 sm:py-24">
        <p className="text-body text-secondary font-light">{loadErr}</p>
        <Link
          to="/campaigns"
          className="mt-8 inline-block text-sm text-violet-300/90 underline-offset-4 hover:underline"
        >
          ← All campaigns
        </Link>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 sm:py-24">
        <p className="text-body text-secondary font-light">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-20 sm:py-24">
      <div className="opacity-0-start animate-fade-up">
        <p className="text-xs font-medium uppercase tracking-wider text-secondary">
          {campaign.partnerName} · {campaign.influencerName}
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-primary">
          {campaign.title}
        </h1>
        {campaign.description && (
          <p className="mt-4 text-body text-secondary font-light leading-relaxed">
            {campaign.description}
          </p>
        )}
        {campaign.partnerAdNote && (
          <p className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-secondary">
            {campaign.partnerAdNote}
          </p>
        )}
        {user && (
          <p className="mt-6 text-sm text-secondary">
            Balance:{" "}
            <span className="font-medium text-primary">
              {user.acBalance ?? 0} AC
            </span>
            <span className="text-secondary"> · </span>
            <span className="font-medium text-primary">
              {user.ptBalance ?? 0} PT
            </span>
          </p>
        )}
      </div>

      <div className="mt-12 space-y-6">
        <h2 className="sr-only">Tasks</h2>
        {campaign.tasks.map((t) => (
          <div
            key={t.id}
            className="glass-panel p-6 opacity-0-start animate-fade-up delay-1"
          >
            <h3 className="font-display text-lg font-semibold text-primary">
              {t.title}
            </h3>
            {t.description && (
              <p className="mt-2 text-body text-secondary font-light">{t.description}</p>
            )}
            <p className="mt-4 text-sm text-secondary">
              Progress:{" "}
              <span className="font-mono text-xs text-primary">
                {t.progressCount}/{t.targetCount}
              </span>
              {t.completed ? (
                <span className="ml-2 text-emerald-200/90">· Completed</span>
              ) : null}
            </p>
            {!t.completed && (
              <p className="mt-1 text-sm text-secondary">
                Reward on completion:{" "}
                <span className="font-medium text-primary">{t.acReward}</span>{" "}
                AC
              </p>
            )}
            {!token ? (
              <p className="mt-4 text-sm text-secondary">
                <Link
                  to="/login"
                  className="text-violet-300/90 underline-offset-4 hover:underline"
                >
                  Log in
                </Link>{" "}
                to save progress.
              </p>
            ) : (
              <button
                type="button"
                disabled={t.completed || busyTaskId === t.id}
                onClick={() => void onRecordStep(t.id)}
                className="btn-gradient mt-5 w-full py-3 disabled:opacity-40"
              >
                {busyTaskId === t.id
                  ? "Saving…"
                  : t.completed
                    ? "Completed"
                    : "Record step"}
              </button>
            )}
          </div>
        ))}
      </div>

      {actionErr && (
        <p className="mt-6 text-sm text-red-300/90">{actionErr}</p>
      )}
      {toast && (
        <p className="mt-4 text-sm text-emerald-200/90">{toast}</p>
      )}

      <Link
        to="/campaigns"
        className="mt-10 inline-block text-sm text-violet-300/90 underline-offset-4 hover:underline"
      >
        ← All campaigns
      </Link>
    </div>
  );
}
