export const MAX_CHAT_MESSAGE_LENGTH = 4000;

export function isChatPeerOnline(onlineUserIds: readonly string[], peerId: string | null): boolean {
  return peerId !== null && onlineUserIds.includes(peerId);
}

export function normalizeChatMessageBody(value: string): string {
  const body = value.trim();
  if (!body) throw new Error('اكتب رسالة قبل الإرسال.');
  if (Array.from(body).length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new Error(`الحد الأقصى للرسالة ${MAX_CHAT_MESSAGE_LENGTH} حرف.`);
  }
  return body;
}
