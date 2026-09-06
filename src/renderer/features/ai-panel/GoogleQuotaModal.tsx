import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, X, AlertCircle } from 'lucide-react';

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

export interface GoogleQuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function renderBar(percent: number, totalBlocks = 18, colorClass = 'text-[#10b981]'): React.ReactNode {
  const safePercent = Math.max(0, Math.min(100, percent));
  const filled = Math.round((safePercent / 100) * totalBlocks);
  const empty = totalBlocks - filled;

  return (
    <span className="font-mono tracking-tighter select-none">
      <span className={colorClass}>{'█'.repeat(filled)}</span>
      <span className="text-[#262626]">{'█'.repeat(empty)}</span>
    </span>
  );
}

export const GoogleQuotaModal: React.FC<GoogleQuotaModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FullQuotaData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (isOpen) {
      fetchQuotas();
    }
  }, [isOpen, fetchQuotas]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        fetchQuotas();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, fetchQuotas]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in font-mono select-text">
      <div className="relative w-full max-w-xl bg-[#0f0f10] border border-[#262626] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#141416] border-b border-[#262626] text-[11px] text-[#858585]">
          <div className="flex items-center gap-2">
            <span className="text-[#38bdf8]">◆</span>
            <span className="text-[#cccccc] font-medium">Quota & Usage Monitor</span>
            <span className="text-[#555555]">|</span>
            <span>Enter: refresh</span>
            <span>·</span>
            <span>Esc: close</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#858585] hover:text-white hover:bg-white/10 transition-colors"
            title="Cerrar (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-6 text-[12px] leading-relaxed text-[#cccccc]">
          {loading && (
            <div className="flex items-center gap-2.5 text-[#858585] py-8 justify-center">
              <RefreshCw className="w-4 h-4 animate-spin text-[#38bdf8]" />
              <span>Consultando límites de cuota...</span>
            </div>
          )}

          {!loading && error && (
            <div className="p-3 rounded bg-rose-950/20 border border-rose-900/40 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && data && (
            <>
              {/* OpenAI Section (Image 1 Style) */}
              {data.openai && data.openai.status === 'ok' && data.openai.windows.length > 0 && (
                <div className="space-y-2.5 pb-2 border-b border-[#222224]">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#e2e8f0] font-semibold">
                      [OpenAI] ({data.openai.planType})
                    </span>
                    {data.openai.email && (
                      <span className="text-[#71717a] text-[11px]">{data.openai.email}</span>
                    )}
                  </div>

                  <div className="space-y-3 pl-1">
                    {data.openai.windows.map((win) => (
                      <div key={win.name} className="space-y-1">
                        <div className="flex justify-between text-[11px] text-[#a1a1aa]">
                          <span>{win.name}</span>
                          <span className="text-[#71717a]">{win.resetTimeText || ''}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {renderBar(win.remainingPercent, 20, 'text-[#a1a1aa]')}
                          <span className="text-[11px] text-[#e4e4e7] min-w-[55px]">
                            {win.remainingPercent}% left
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Google Antigravity Section (Image 2 Style) */}
              {data.googleAccounts.length > 0 ? (
                <div className="space-y-5">
                  {data.googleAccounts.map((acc) => (
                    <div key={acc.accountId || acc.email} className="space-y-1.5">
                      {/* Account header */}
                      <div className="flex items-center gap-2">
                        <span className="text-[#e4e4e7] font-medium">{acc.email}</span>
                        {acc.disabled && (
                          <span className="text-rose-400 text-[11px]">[disabled]</span>
                        )}
                      </div>

                      <div className="text-[11px] text-[#71717a]">Antigravity Quota:</div>

                      {/* Quota lines */}
                      <div className="space-y-1 pl-1">
                        {acc.items.map((item) => {
                          const isUnavailable = acc.disabled || item.unavailable || item.remainingPercent === 0;
                          const barColor = isUnavailable ? 'text-[#065f46]' : 'text-[#10b981]';

                          return (
                            <div key={item.name} className="flex items-center gap-2 text-[12px]">
                              <span className="text-[#52525b] text-[10px]">○</span>
                              <span className="w-28 text-[#d4d4d8] shrink-0">{item.name}</span>
                              <div className="flex items-center gap-2">
                                {renderBar(item.remainingPercent, 18, barColor)}
                                <span className="text-[#10b981] font-medium min-w-[38px] text-right">
                                  {item.remainingPercent}%
                                </span>
                                {item.resetText && (
                                  <span className="text-[#71717a] text-[11px]">
                                    ({item.resetText})
                                  </span>
                                )}
                                {isUnavailable && (
                                  <span className="text-rose-400 text-[11px]">(unavailable)</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !data.openai && (
                  <div className="text-center py-6 text-[#71717a] text-xs space-y-2">
                    <p>No se encontraron cuentas configuradas de Google ni OpenAI.</p>
                    <p className="text-[11px] text-[#52525b]">
                      Iniciá sesión con Google o OpenAI mediante OAuth en Spigot para ver tus cuotas.
                    </p>
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#141416] border-t border-[#262626] text-[11px] text-[#71717a]">
          <div className="flex items-center gap-2">
            <span className="text-[#10b981]">●</span>
            <span>
              {data?.checkedAt
                ? `Updated ${new Date(data.checkedAt).toLocaleTimeString()}`
                : 'Ready'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchQuotas}
              disabled={loading}
              className="hover:text-[#cccccc] transition-colors disabled:opacity-50 cursor-pointer"
            >
              [Refresh]
            </button>
            <button
              type="button"
              onClick={onClose}
              className="hover:text-[#cccccc] transition-colors cursor-pointer"
            >
              [Close]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
