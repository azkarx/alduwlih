import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ChatMessage, WarehouseSettings } from '../types/warehouse';
import { normalizeChatMessageBody } from '../utils/chat';
import { getSupabaseClient } from './storageService';

const CHAT_MESSAGE_COLUMNS = 'id, sender_id, recipient_id, body, created_at, read_at';
export const CHAT_PAGE_SIZE = 50;

export interface ChatPeer {
  id: string;
  name: string;
}

export interface ChatMessagePage {
  messages: ChatMessage[];
  hasMore: boolean;
}

function isChatMessageRow(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.sender_id === 'string' &&
    typeof row.recipient_id === 'string' &&
    typeof row.body === 'string' &&
    typeof row.created_at === 'string'
  );
}

function mapChatMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    senderId: String(row.sender_id),
    recipientId: String(row.recipient_id),
    body: String(row.body),
    createdAt: String(row.created_at),
    readAt: typeof row.read_at === 'string' ? row.read_at : null,
  };
}

function requireSupabaseClient(settings: WarehouseSettings) {
  const client = getSupabaseClient(settings);
  if (!client) throw new Error('إعدادات Supabase غير مكتملة.');
  return client;
}

export async function getChatPeer(settings: WarehouseSettings): Promise<ChatPeer> {
  const client = requireSupabaseClient(settings);
  const { data, error } = await client.rpc('get_chat_peer');
  if (error) throw new Error(`تعذر التحقق من حساب المحادثة: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  if (
    typeof row !== 'object' ||
    row === null ||
    typeof row.id !== 'string' ||
    typeof row.name !== 'string'
  ) {
    throw new Error('هذا الحساب غير مضاف إلى المحادثة الخاصة بين محمد وداليا.');
  }
  return { id: row.id, name: row.name };
}

export async function loadChatMessages(
  settings: WarehouseSettings,
  before?: string
): Promise<ChatMessagePage> {
  const client = requireSupabaseClient(settings);
  let query = client
    .from('chat_messages')
    .select(CHAT_MESSAGE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(CHAT_PAGE_SIZE);
  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) throw new Error(`تعذر تحميل رسائل المحادثة: ${error.message}`);

  const rows = (data || []).filter(isChatMessageRow);
  return {
    messages: rows.map(mapChatMessage).reverse(),
    hasMore: rows.length === CHAT_PAGE_SIZE,
  };
}

export async function loadUnreadChatCount(
  settings: WarehouseSettings,
  userId: string
): Promise<number> {
  const client = requireSupabaseClient(settings);
  const { count, error } = await client
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .is('read_at', null);
  if (error) throw new Error(`تعذر تحميل عدد الرسائل غير المقروءة: ${error.message}`);
  return count || 0;
}

export async function sendChatMessage(
  settings: WarehouseSettings,
  senderId: string,
  recipientId: string,
  value: string
): Promise<ChatMessage> {
  const body = normalizeChatMessageBody(value);
  const client = requireSupabaseClient(settings);
  const { data, error } = await client
    .from('chat_messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, body })
    .select(CHAT_MESSAGE_COLUMNS)
    .single();
  if (error) throw new Error(`تعذر إرسال الرسالة: ${error.message}`);
  if (!isChatMessageRow(data)) throw new Error('لم يتم تأكيد حفظ الرسالة من الخادم.');
  return mapChatMessage(data);
}

export async function markIncomingChatMessagesRead(
  settings: WarehouseSettings,
  userId: string
): Promise<void> {
  const client = requireSupabaseClient(settings);
  const { error } = await client
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .is('read_at', null);
  if (error) throw new Error(`تعذر تحديث حالة قراءة الرسائل: ${error.message}`);
}

export function subscribeToChat(
  settings: WarehouseSettings,
  userId: string,
  onMessage: (message: ChatMessage) => void,
  onConnectionChange: (connected: boolean) => void,
  onPresenceChange: (onlineUserIds: string[]) => void,
  onPresenceError: (error: Error | null) => void
): () => void {
  const client = requireSupabaseClient(settings);
  const channel: RealtimeChannel = client
    .channel('warehouse-chat-presence', {
      config: { private: true, presence: { key: userId } },
    })
    .on('presence', { event: 'sync' }, () => {
      const onlineUserIds = Object.entries(channel.presenceState())
        .filter(([, presences]) => presences.length > 0)
        .map(([presenceKey]) => presenceKey);
      onPresenceChange(onlineUserIds);
    })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_messages',
        filter: `sender_id=eq.${userId}`,
      },
      (payload) => {
        if (isChatMessageRow(payload.new)) onMessage(mapChatMessage(payload.new));
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_messages',
        filter: `recipient_id=eq.${userId}`,
      },
      (payload) => {
        if (isChatMessageRow(payload.new)) onMessage(mapChatMessage(payload.new));
      }
    )
    .subscribe((status) => {
      const subscribed = status === 'SUBSCRIBED';
      onConnectionChange(subscribed);
      if (!subscribed) {
        onPresenceChange([]);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onPresenceError(
            new Error('تعذر الاتصال الآمن بحالة الطرف الآخر. أعد تشغيل مخطط Supabase المحدّث.')
          );
        }
        return;
      }

      void channel
        .track({})
        .then((result) => {
          if (result !== 'ok') {
            onPresenceChange([]);
            onPresenceError(
              new Error('تعذر تحديث حالة اتصال الحساب. أعد تشغيل مخطط Supabase المحدّث.')
            );
            return;
          }
          onPresenceError(null);
        })
        .catch((error: unknown) => {
          onPresenceChange([]);
          onPresenceError(
            error instanceof Error
              ? error
              : new Error('تعذر تحديث حالة اتصال الحساب. أعد تشغيل مخطط Supabase المحدّث.')
          );
        });
    });

  return () => {
    void client.removeChannel(channel);
  };
}
