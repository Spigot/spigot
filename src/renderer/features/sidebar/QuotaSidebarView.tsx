import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertCircle, LogIn } from 'lucide-react';
import { useAIStore } from '../../store/aiStore';

export interface QuotaItem {
  name: string;
  remainingFraction: number;
  remainingPercent: number;
  resetTime?: string;
  resetText?: string;
  unavailable?: boolean;
}

export interface GoogleAccountQuota {
  accountId: string;
  email: string;
  projectId: string;
  disabled?: boolean;
  status: 'ok' | 'error' | 'no_token';
  error?: string;
  items: QuotaItem[];
}

export interface OpenAIWindow {
  name: string;
  remainingPercent: number;
  resetTimeText?: string;
}

export interface OpenAIQuota {
  planType: string;
  email?: string;
  status: 'ok' | 'error';
  error?: string;
  windows: OpenAIWindow[];
}

export interface FullQuotaData {
  googleAccounts: GoogleAccountQuota[];
  openai?: OpenAIQuota | null;
  checkedAt: number;
}

function renderBlockBar(percent: number, totalBlocks = 16, colorClass = 'text-[#10b981]'): React.ReactNode {
  const safePercent = Math.max(0, Math.min(100, percent));
  const filled = Math.round((safePercent / 100) * totalBlocks);
  const empty = totalBlocks - filled;

  return (
    <span className="font-mono tracking-tighter text-[13px] leading-none select-none">
      <span className={colorClass}>{'█'.repeat(filled)}</span>
      <span className="text-[#262626]">{'█'.repeat(empty)}</span>
    </span>
  );
}

export const QuotaSidebarView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FullQuotaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { loginWithOAuth } = useAIStore();

  const fetchQuotas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await (window as any).api?.oauth?.checkGoogleQuota?.();
      if (response) {
        setData(response);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al consultar cuotas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotas();
  }, [fetchQuotas]);

  return (
    <div className="flex-1 flex flex-col h-full bg-editor-sidebar select-text font-mono overflow-hidden">
      {/* Action Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-editor-border bg-editor-sidebar text-[11px] text-[#858585]">
        <div className="flex items-center gap-2">
          <span className="text-[#10b981]">●</span>
          <span className="truncate">
            {data?.checkedAt
              ? `Actualizado ${new Date(data.checkedAt).toLocaleTimeString()}`
              : 'Consultando...'}
          </span>
        </div>
        <button
          onClick={fetchQuotas}
          disabled={loading}
          className="p-1 rounded hover:bg-editor-hover hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
          title="Refrescar cuotas"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5 text-xs text-[#cccccc]">
        {loading && !data && (
          <div className="flex items-center gap-2 text-[#858585] py-8 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin text-editor-accent" />
            <span className="text-[11px]">Cargando cuota de Antigravity...</span>
          </div>
        )}

        {!loading && error && (
          <div className="p-2.5 rounded bg-rose-950/20 border border-rose-900/40 text-rose-300 text-[11px] flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {data && (
          <>
            {/* Google Accounts */}
            {data.googleAccounts.length > 0 ? (
              <div className="space-y-5">
                {data.googleAccounts.map((acc) => (
                  <div key={acc.accountId || acc.email} className="space-y-2">
                    {/* Account header */}
                    <div className="flex items-center justify-between border-b border-[#262626] pb-1">
                      <span className="text-[#e4e4e7] font-semibold text-[11px] truncate">
                        {acc.email}
                      </span>
                      {acc.disabled && (
                        <span className="text-rose-400 text-[10px] font-bold">[disabled]</span>
                      )}
                    </div>

                    <div className="text-[10.5px] text-[#71717a]">Antigravity Quota:</div>

                    {/* Quota lines */}
                    <div className="space-y-2 pl-0.5">
                      {acc.items.map((item) => {
                        const isUnavailable = acc.disabled || item.unavailable || item.remainingPercent === 0;
                        const barColor = isUnavailable ? 'text-[#065f46]' : 'text-[#10b981]';

                        return (
                          <div key={item.name} className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="flex items-center gap-1.5 text-[#d4d4d8]">
                                <span className="text-[#52525b] text-[9px]">○</span>
                                <span>{item.name}</span>
                              </span>
                              <span className="text-[#10b981] font-bold text-[11px]">
                                {item.remainingPercent}%
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              {renderBlockBar(item.remainingPercent, 14, barColor)}
                              <span className="text-[#71717a] text-[10px] shrink-0 text-right">
                                {isUnavailable ? (
                                  <span className="text-rose-400">(unavailable)</span>
                                ) : item.resetText ? (
                                  `(${item.resetText})`
                                ) : null}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-[#71717a] text-[11px] space-y-3">
                <p>No hay cuentas de Google Antigravity conectadas.</p>
                <button
                  type="button"
                  onClick={async () => {
                    await loginWithOAuth('gemini');
                    await fetchQuotas();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-editor-accent text-editor-bg text-xs font-semibold hover:brightness-110 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Conectar Google</span>
                </button>
              </div>
            )}

            {/* OpenAI Section (if connected) */}
            {data.openai && data.openai.status === 'ok' && data.openai.windows.length > 0 && (
              <div className="pt-3 border-t border-[#262626] space-y-2">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-[#e2e8f0] font-semibold">
                    [OpenAI] ({data.openai.planType})
                  </span>
                  {data.openai.email && (
                    <span className="text-[#71717a] text-[10px] truncate max-w-[120px]">
                      {data.openai.email}
                    </span>
                  )}
                </div>

                <div className="space-y-2.5 pl-0.5">
                  {data.openai.windows.map((win) => (
                    <div key={win.name} className="space-y-1">
                      <div className="flex justify-between text-[10.5px] text-[#a1a1aa]">
                        <span>{win.name}</span>
                        <span className="text-[#71717a]">{win.resetTimeText || ''}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        {renderBlockBar(win.remainingPercent, 14, 'text-[#a1a1aa]')}
                        <span className="text-[10.5px] text-[#e4e4e7] shrink-0">
                          {win.remainingPercent}% left
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default QuotaSidebarView;
