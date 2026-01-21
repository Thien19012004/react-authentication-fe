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
  const modifyMutation = useMutation({
    mutationFn: ({
      emailId,
      actions,
    }: {
      emailId: string;
      actions: ModifyEmailData;
    }) => gmailCached.modifyEmail(emailId, actions),

    // Optimistic update: Update UI immediately before API responds
    onMutate: async ({ emailId, actions }) => {
      // Cancel any outgoing refetches to prevent race conditions
      await qc.cancelQueries({ queryKey: ['emails-infinite', mailboxId] });
      await qc.cancelQueries({ queryKey: ['email', emailId] });

      // Snapshot current data for potential rollback
      const previousEmails = qc.getQueryData(['emails-infinite', mailboxId]);
      const previousEmail = qc.getQueryData(['email', emailId]);

      // Update email list cache optimistically
      qc.setQueryData(['emails-infinite', mailboxId], (old: any) => {
        if (!old?.pages) return old;

        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            data: {
              ...page.data,
              data: page.data.data
                .map((email: any) => {
                  if (email.id !== emailId) return email;

                  // Apply state changes based on actions
                  return {
                    ...email,
                    unread: actions.markRead
                      ? false
                      : actions.markUnread
                      ? true
                      : email.unread,
                    starred: actions.star
                      ? true
                      : actions.unstar
                      ? false
                      : email.starred,
                  };
                })
                .filter((email: any) => {
                  // Remove from list if it's a delete action
                  return !(actions.delete && email.id === emailId);
                }),
            },
          })),
        };
      });

      // Update email detail cache optimistically
      qc.setQueryData(['email', emailId], (old: any) => {
        if (!old?.data) return old;

        return {
          ...old,
          data: {
            ...old.data,
            unread: actions.markRead
              ? false
              : actions.markUnread
              ? true
              : old.data.unread,
            starred: actions.star
              ? true
              : actions.unstar
              ? false
              : old.data.starred,
          },
        };
      });

      return { previousEmails, previousEmail };
    },

    // Rollback optimistic updates if API call fails
    onError: (_err, variables, context: any) => {
      if (context?.previousEmails) {
        qc.setQueryData(['emails-infinite', mailboxId], context.previousEmails);
      }
      if (context?.previousEmail) {
        qc.setQueryData(['email', variables.emailId], context.previousEmail);
      }
      onError?.('Failed to modify email');
    },

    // Refetch data after mutation settles to ensure consistency with server
    onSettled: (_data, _error, { emailId }) => {
      qc.invalidateQueries({ queryKey: ['emails-infinite', mailboxId] });
      qc.invalidateQueries({ queryKey: ['email', emailId] });
    },
  });

  return {
    sendMutation,
    forwardMutation,
    replyMutation,
    modifyMutation,
  };
}
