import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_CHAT_MESSAGE_LENGTH, normalizeChatMessageBody } from './chat';

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
