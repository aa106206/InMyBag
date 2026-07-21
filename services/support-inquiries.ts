import type { User } from '@supabase/supabase-js';

import { supabase } from '@/services/supabase';

export const SUPPORT_INQUIRY_MAX_LENGTH = 120;

export async function sendSupportInquiry(user: User | null, message: string) {
  const trimmedMessage = message.trim();

  if (!user) {
    throw new Error('AUTH_REQUIRED');
  }

  if (!trimmedMessage) {
    throw new Error('EMPTY_MESSAGE');
  }

  if (trimmedMessage.length > SUPPORT_INQUIRY_MAX_LENGTH) {
    throw new Error('MESSAGE_TOO_LONG');
  }

  const { error } = await supabase.from('support_inquiries').insert({
    user_id: user.id,
    email: user.email ?? null,
    message: trimmedMessage,
  });

  if (error) {
    throw error;
  }
}

export function getSupportInquiryErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('auth_required')) {
    return '문의하려면 먼저 로그인해 주세요.';
  }

  if (message.includes('empty_message')) {
    return '문의 내용을 입력해 주세요.';
  }

  if (message.includes('message_too_long')) {
    return `문의 내용은 ${SUPPORT_INQUIRY_MAX_LENGTH}자 이내로 입력해 주세요.`;
  }

  if (message.includes('support_inquiries') || message.includes('schema cache')) {
    return '문의 저장 테이블이 아직 준비되지 않았어요. Supabase 마이그레이션을 적용해 주세요.';
  }

  if (message.includes('row-level security') || message.includes('permission')) {
    return '문의 전송 권한을 확인하지 못했어요. 다시 로그인한 뒤 시도해 주세요.';
  }

  if (message.includes('network')) {
    return '네트워크 연결 때문에 문의를 보내지 못했어요.';
  }

  return '문의를 보내지 못했어요. 잠시 후 다시 시도해 주세요.';
}
