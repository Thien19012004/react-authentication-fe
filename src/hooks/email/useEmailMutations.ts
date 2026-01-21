/**
 * Custom hook for managing email mutations (send, reply, modify)
 * Handles optimistic updates and cache invalidation
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gmailCached } from '@/lib/api';
import type { ModifyEmailData, SendEmailData } from '@/lib/api';

interface UseEmailMutationsProps {
  mailboxId: string;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function useEmailMutations({
  mailboxId,
  onSuccess,
  onError,
}: UseEmailMutationsProps) {
  const qc = useQueryClient();

  /**
   * Mutation for sending new emails
   * Invalidates email list and cache after successful send
   */
  const sendMutation = useMutation({
    mutationFn: gmailCached.sendEmail,
    onSuccess: () => {
      onSuccess?.('Email sent successfully');
      qc.invalidateQueries({ queryKey: ['emails-infinite', mailboxId] });
    },
    onError: (err: any) => {
      const errorMsg =
        err.response?.data?.message || err.message || 'Failed to send email';
      onError?.(errorMsg);
    },
  });

  /**
   * Mutation for forwarding emails
   * Invalidates email list and cache after successful forward
   */
  const forwardMutation = useMutation({
    mutationFn: ({
      emailId,
      payload,
    }: {
      emailId: string;
      payload: SendEmailData;
    }) => gmailCached.forwardEmail(emailId, payload),
    onSuccess: () => {
      onSuccess?.('Email forwarded successfully');
      qc.invalidateQueries({ queryKey: ['emails-infinite', mailboxId] });
    },
    onError: (err: any) => {
      const errorMsg =
        err.response?.data?.message || err.message || 'Failed to forward email';
      onError?.(errorMsg);
    },
  });

  /**
   * Mutation for replying to emails
   * Invalidates both email list and specific email detail + cache
   */
  const replyMutation = useMutation({
    mutationFn: ({
      emailId,
      body,
      replyAll,
    }: {
      emailId: string;
      body: string;
      replyAll?: boolean;
    }) => gmailCached.replyEmail(emailId, { body, replyAll }),
    onSuccess: (_data, vars) => {
      onSuccess?.('Reply sent successfully');
      qc.invalidateQueries({ queryKey: ['emails-infinite', mailboxId] });
      qc.invalidateQueries({ queryKey: ['email', vars.emailId] });
    },
    onError: (err: any) => {
      const errorMsg =
        err.response?.data?.message || err.message || 'Failed to send reply';
      onError?.(errorMsg);
    },
  });

  /**
   * Mutation for modifying emails (read/unread, star/unstar, delete)
   * Uses optimistic updates for immediate UI feedback
   * Rolls back on error, refetches on success to ensure consistency
   * Cache is automatically invalidated by gmailCached.modifyEmail
   */
  