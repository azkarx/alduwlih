import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, WarehouseSettings, WarehouseUser } from '../types/warehouse';
import {
  getChatPeer,
  loadChatMessages,
  loadUnreadChatCount,
  markIncomingChatMessagesRead,
  sendChatMessage,
  subscribeToChat,
} from '../services/chatService';
import { isChatPeerOnline, MAX_CHAT_MESSAGE_LENGTH } from '../utils/chat';
import { USER_AVATARS } from '../utils/userAvatars';

interface ChatWidgetProps {
  user: WarehouseUser;
  settings: WarehouseSettings;
  onIncoming?: (peerName: string) => void;
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const previous = messagesById.get(message.id);
    messagesById.set(message.id, previous ? { ...previous, ...message } : message);
  }
  return [...messagesById.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ user, settings, onIncoming }) => {
  const [open, setOpen] = useState(false);
  const [peer, setPeer] = useState<{ id: string; name: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [error, setError] = useState('');
  const [presenceError, setPresenceError] = useState('');
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const peerDisplayName = user.role === 'admin' ? 'داليا محمد' : 'محمد رضا';
  const peerAvatar = user.role === 'admin' ? USER_AVATARS.dalia : USER_AVATARS.mohamed;

  const openRef = useRef(open);
  const connectedRef = useRef(false);
  const peerRef = useRef(peer);
  const seenMessageIds = useRef(new Set<string>());
  const unreadRevision = useRef(0);
  const markingRead = useRef(false);
  const mounted = useRef(true);
  const incomingCallback = useRef(onIncoming);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    peerRef.current = peer;
  }, [peer]);
  useEffect(() => {
    incomingCallback.current = onIncoming;
  }, [onIncoming]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadStableUnreadCount = useCallback(async () => {
    let revision = unreadRevision.current;
    let count = await loadUnreadChatCount(settings, user.id);
    while (revision !== unreadRevision.current) {
      revision = unreadRevision.current;
      count = await loadUnreadChatCount(settings, user.id);
    }
    return count;
  }, [settings.supabaseUrl, settings.supabaseAnonKey, user.id]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    let unreadRefreshTimer: number | undefined;
    let onlineUserIds: string[] = [];
    connectedRef.current = false;
    setPeerOnline(false);
    setPresenceError('');
    setLoading(true);
    setError('');
    setPeer(null);
    peerRef.current = null;
    setMessages([]);
    setUnreadCount(0);
    setHasMore(false);
    seenMessageIds.current.clear();
    unreadRevision.current = 0;

    const scheduleUnreadCountRefresh = () => {
      if (unreadRefreshTimer !== undefined) window.clearTimeout(unreadRefreshTimer);
      unreadRefreshTimer = window.setTimeout(() => {
        void loadStableUnreadCount()
          .then((count) => {
            if (active) setUnreadCount(count);
          })
          .catch((countError: unknown) => {
            if (active) {
              setError(getErrorMessage(countError, 'تعذر تحديث عدد الرسائل غير المقروءة.'));
            }
          });
      }, 150);
    };

    const receiveMessage = (message: ChatMessage) => {
      if (!active) return;
      const isNew = !seenMessageIds.current.has(message.id);
      seenMessageIds.current.add(message.id);
      setMessages((current) => mergeMessages(current, [message]));
      if (message.recipientId === user.id) {
        unreadRevision.current += 1;
        if (isNew && !message.readAt) {
          setUnreadCount((count) => count + 1);
          if (!openRef.current) {
            const senderName = peerRef.current?.name || 'جهة الاتصال';
            incomingCallback.current?.(senderName);
            if (
              typeof Notification !== 'undefined' &&
              Notification.permission === 'granted' &&
              document.visibilityState === 'hidden'
            ) {
              const notification = new Notification(`رسالة جديدة من ${senderName}`, {
                body: message.body,
                tag: 'warehouse-private-chat',
              });
              notification.onclick = () => {
                window.focus();
                setOpen(true);
                notification.close();
              };
            }
          }
        }
        if (message.readAt) {
          scheduleUnreadCountRefresh();
        }
      }
    };

    try {
      unsubscribe = subscribeToChat(
        settings,
        user.id,
        receiveMessage,
        (isConnected) => {
          if (!active) return;
          connectedRef.current = isConnected;
        },
        (onlineIds) => {
          onlineUserIds = onlineIds;
          if (active) {
            setPeerOnline(isChatPeerOnline(onlineUserIds, peerRef.current?.id ?? null));
          }
        },
        (presenceError) => {
          if (active) {
            setPresenceError(
              presenceError
                ? getErrorMessage(presenceError, 'تعذر تحديث حالة اتصال الطرف الآخر.')
                : ''
            );
          }
        }
      );
    } catch (subscriptionError) {
      setError(getErrorMessage(subscriptionError, 'تعذر الاتصال الفوري بالمحادثة.'));
    }

    const refresh = async (includePeer: boolean) => {
      try {
        const [peerResult, page] = await Promise.all([
          includePeer ? getChatPeer(settings) : Promise.resolve(null),
          loadChatMessages(settings),
        ]);
        const unread = await loadStableUnreadCount();
        if (!active) return;
        if (peerResult) {
          const displayPeer = { ...peerResult, name: peerDisplayName };
          peerRef.current = displayPeer;
          setPeer(displayPeer);
          setPeerOnline(isChatPeerOnline(onlineUserIds, displayPeer.id));
        }
        for (const message of page.messages) seenMessageIds.current.add(message.id);
        setMessages((current) => mergeMessages(current, page.messages));
        setUnreadCount(unread);
        setHasMore(page.hasMore);
        setError('');
      } catch (refreshError) {
        if (active) setError(getErrorMessage(refreshError, 'تعذر تحديث المحادثة.'));
      } finally {
        if (includePeer && active) setLoading(false);
      }
    };

    void refresh(true);
    const fallbackInterval = window.setInterval(() => {
      if (!connectedRef.current) void refresh(false);
    }, 15_000);

    return () => {
      active = false;
      window.clearInterval(fallbackInterval);
      if (unreadRefreshTimer !== undefined) window.clearTimeout(unreadRefreshTimer);
      unsubscribe();
    };
  }, [settings.supabaseUrl, settings.supabaseAnonKey, user.id, peerDisplayName, loadStableUnreadCount]);

  useEffect(() => {
    if (!open || unreadCount === 0 || markingRead.current) return;
    markingRead.current = true;
    void markIncomingChatMessagesRead(settings, user.id)
      .then(async () => {
        if (!mounted.current) return;
        const now = new Date().toISOString();
        setMessages((current) =>
          current.map((message) =>
            message.recipientId === user.id && !message.readAt
              ? { ...message, readAt: now }
              : message
          )
        );
        const remainingUnread = await loadStableUnreadCount();
        if (mounted.current) setUnreadCount(remainingUnread);
      })
      .catch((readError: unknown) => {
        if (mounted.current) {
          setError(getErrorMessage(readError, 'تعذر تحديث حالة قراءة الرسائل.'));
        }
      })
      .finally(() => {
        markingRead.current = false;
      });
  }, [open, unreadCount, settings.supabaseUrl, settings.supabaseAnonKey, user.id, loadStableUnreadCount]);

  const latestMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, latestMessageId]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!peer || !draft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const message = await sendChatMessage(settings, user.id, peer.id, draft);
      seenMessageIds.current.add(message.id);
      setMessages((current) => mergeMessages(current, [message]));
      setDraft('');
    } catch (sendError) {
      setError(getErrorMessage(sendError, 'تعذر إرسال الرسالة.'));
    } finally {
      setSending(false);
    }
  };

  const loadOlderMessages = async () => {
    const before = messages[0]?.createdAt;
    if (!before || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    setError('');
    try {
      const page = await loadChatMessages(settings, before);
      for (const message of page.messages) seenMessageIds.current.add(message.id);
      setMessages((current) => mergeMessages(current, page.messages));
      setHasMore(page.hasMore);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'تعذر تحميل الرسائل الأقدم.'));
    } finally {
      setLoadingOlder(false);
    }
  };

  const enableDesktopNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      setError('إشعارات الجهاز غير مدعومة في هذا المتصفح.');
      return;
    }
    try {
      setNotificationPermission(await Notification.requestPermission());
    } catch {
      setError('تعذر تفعيل إشعارات الجهاز من المتصفح.');
    }
  };

  return (
    <div className="fixed bottom-5 left-5 z-[60]" dir="rtl">
      {open && (
        <section
          aria-label={`محادثة خاصة مع ${peer?.name || peerDisplayName}`}
          className="chat-glass-panel absolute bottom-16 left-0 flex h-[min(620px,calc(100vh-7rem))] w-[calc(100vw-2.5rem)] max-w-[420px] flex-col overflow-hidden rounded-2xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.05] px-4 py-3 backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-2.5">
              <img
                src={peerAvatar}
                alt={`صورة ${peer?.name || peerDisplayName}`}
                referrerPolicy="no-referrer"
                className="h-10 w-10 shrink-0 rounded-full border border-white/15 object-cover object-[50%_20%]"
              />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-white">
                  {peer?.name || peerDisplayName}
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#9db0ca]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      peerOnline ? 'bg-emerald-400' : 'bg-slate-400'
                    }`}
                  />
                  {peerOnline ? 'متصل' : 'غير متصل'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => void enableDesktopNotifications()}
                title={
                  notificationPermission === 'granted'
                    ? 'إشعارات الجهاز مفعلة'
                    : 'تفعيل إشعارات الجهاز'
                }
                aria-label="تفعيل إشعارات الجهاز"
                className="rounded-lg p-2 text-[#b8c6dc] hover:bg-white/10 hover:text-white"
              >
                <span className="material-symbols-outlined text-[19px]">
                  {notificationPermission === 'granted' ? 'notifications_active' : 'notifications'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق المحادثة"
                className="rounded-lg p-2 text-[#b8c6dc] hover:bg-white/10 hover:text-white"
              >
                <span className="material-symbols-outlined text-[19px]">close</span>
              </button>
            </div>
          </header>

          {(error || presenceError) && (
            <p role="alert" className="border-b border-rose-400/20 bg-rose-400/10 px-4 py-2 text-xs text-rose-200">
              {error || presenceError}
            </p>
          )}

          <div
            className="flex-1 space-y-3 overflow-y-auto px-3 py-4"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {hasMore && (
              <button
                type="button"
                onClick={() => void loadOlderMessages()}
                disabled={loadingOlder}
                className="mx-auto block rounded-lg px-3 py-1.5 text-xs text-[#8be6f5] hover:bg-white/5 disabled:opacity-50"
              >
                {loadingOlder ? 'جارٍ تحميل الرسائل...' : 'تحميل رسائل أقدم'}
              </button>
            )}
            {loading ? (
              <p className="py-8 text-center text-xs text-[#9db0ca]">جارٍ تحميل المحادثة...</p>
            ) : messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#9db0ca]">
                لا توجد رسائل بعد. ابدأ المحادثة الآن.
              </p>
            ) : (
              messages.map((message) => {
                const isMine = message.senderId === user.id;
                return (
                  <div
                    key={message.id}
                    className={`flex ${isMine ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-3 py-2 ${
                        isMine
                          ? 'rounded-br-md bg-[#1269d3] text-white'
                          : 'rounded-bl-md border border-white/10 bg-white/[0.08] text-[#edf5ff]'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-[13px] leading-6">
                        {message.body}
                      </p>
                      <div
                        className={`mt-1 flex items-center gap-1 text-[10px] ${
                          isMine ? 'text-blue-100/80' : 'text-[#9db0ca]'
                        }`}
                      >
                        <time dir="ltr">
                          {new Date(message.createdAt).toLocaleTimeString('ar-EG', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                        {isMine && (
                          <span
                            title={message.readAt ? 'تمت القراءة' : 'تم الإرسال'}
                            className="material-symbols-outlined text-[14px]"
                          >
                            {message.readAt ? 'done_all' : 'done'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(event) => void sendMessage(event)}
            className="border-t border-white/10 bg-white/[0.03] p-3 backdrop-blur-xl"
          >
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                maxLength={MAX_CHAT_MESSAGE_LENGTH}
                rows={2}
                placeholder="اكتب رسالتك..."
                aria-label="نص الرسالة"
                className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-white/15 bg-[#071426]/45 px-3 py-2.5 text-sm text-white outline-none backdrop-blur-xl placeholder:text-[#7789a3] focus:border-[#46dafd]/60"
              />
              <button
                type="submit"
                disabled={!peer || !draft.trim() || sending}
                aria-label="إرسال الرسالة"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1677FF] text-white shadow-lg transition hover:bg-[#2587ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {sending ? 'hourglass_top' : 'send'}
                </span>
              </button>
            </div>
            <div className="mt-1 text-left text-[10px] text-[#71839d]" dir="ltr">
              {Array.from(draft).length}/{MAX_CHAT_MESSAGE_LENGTH}
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-label={open ? 'إغلاق المحادثة' : 'فتح المحادثة'}
        aria-expanded={open}
        className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-[#1677FF] to-[#0ea5e9] text-white shadow-[0_8px_28px_rgba(14,165,233,0.4)] transition hover:scale-105 active:scale-95"
      >
        <span className="material-symbols-outlined text-[25px]">
          {open ? 'close' : 'chat'}
        </span>
        {unreadCount > 0 && !open && (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#071426] bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};
