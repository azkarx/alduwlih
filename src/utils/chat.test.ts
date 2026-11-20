import assert from 'node:assert/strict';
import test from 'node:test';
import { isChatPeerOnline, MAX_CHAT_MESSAGE_LENGTH, normalizeChatMessageBody } from './chat';

test('reports peer presence only for the peer account ID', () => {
  const onlineUserIds = ['user-admin', 'user-manager'];
  assert.equal(isChatPeerOnline(onlineUserIds, 'user-manager'), true);
  assert.equal(isChatPeerOnline(onlineUserIds, 'unknown-user'), false);
  assert.equal(isChatPeerOnline(onlineUserIds, null), false);
});

test('normalizes chat message whitespace before sending', () => {
  assert.equal(normalizeChatMessageBody('  أهلاً داليا  '), 'أهلاً داليا');
});

test('rejects empty and overlong chat messages', () => {
  assert.throws(() => normalizeChatMessageBody('   '), /اكتب رسالة/);
  assert.throws(
    () => normalizeChatMessageBody('😀'.repeat(MAX_CHAT_MESSAGE_LENGTH + 1)),
    /الحد الأقصى/
  );
});
