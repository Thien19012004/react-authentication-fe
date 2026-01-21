/**
 * EmailListColumn Component
 *
 * Displays a scrollable list of emails with:
 * - Infinite scroll loading
 * - Multi-select for bulk actions
 * - Individual email actions (star/unstar)
 * - Search highlighting
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import type { EmailListItem } from '@/lib/api';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  CheckSquare,
  Trash2,
  Star,
  StarOff,
  Loader2,
  Plus,
} from 'lucide-react';
import { SCROLL_LOAD_THRESHOLD } from '../../constants/constants.email';
import { MailIcon } from './MailIcon';

export function EmailListColumn({
  emails,
  isLoading,
  isFetching,
  hasMore,
  onLoadMore,
  selectedEmails,
  onSelectEmail,
  onToggleSelect,
  onSelectAll,
  onMarkRead,
  onMarkUnread,
  onDeleteSelected,
  onStarToggle,
  actionsDisabled,
  activeEmailId,
  compact,
  onCompose,
}: {
  emails: EmailListItem[];
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  selectedEmails: string[];
  onSelectEmail: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onDeleteSelected: () => void;
  onStarToggle: (emailId: string, starred: boolean) => void;
  actionsDisabled: boolean;
  activeEmailId: string | null;
  compact?: boolean;
  onCompose?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const emailRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const lastAutoScrolledEmailIdRef = useRef<string | null>(null);
  const lastAlignedActiveEmailIdRef = useRef<string | null>(null);
  const wasNearBottomRef = useRef(false);
  const lastLoadMoreAtRef = useRef<number>(0);

  /**
   * Keyboard navigation handlers
   */
  useKeyboardNavigation({
    enabled: !isLoading && emails.length > 0,
    handlers: {
      NEXT_EMAIL: () => {
        setFocusedIndex((prev) => Math.min(prev + 1, emails.length - 1));
      },
      PREV_EMAIL: () => {
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      },
      OPEN_EMAIL: () => {
        if (emails[focusedIndex]) {
          onSelectEmail(emails[focusedIndex].id);
        }
      },
    },
  });

  /**
   * Auto-scroll focused email into view
   */
  useEffect(() => {
    const focusedEmail = emails[focusedIndex];
    if (!focusedEmail) return;

    // IMPORTANT: avoid re-scrolling on every email page append.
    // When `emails` changes (infinite load), re-running scrollIntoView can create
    // a feedback loop: scroll -> load more -> emails change -> scrollIntoView -> scroll...
    if (lastAutoScrolledEmailIdRef.current === focusedEmail.id) return;
    lastAutoScrolledEmailIdRef.current = focusedEmail.id;

    const element = emailRefs.current.get(focusedEmail.id);
    element?.scrollIntoView({
      block: 'nearest',
      // Use non-animated scrolling to prevent continuous smooth scrolling
      // during pagination updates.
      behavior: 'auto',
    });
  }, [focusedIndex]);

  // NOTE: we intentionally do NOT reset `wasNearBottomRef` when fetching completes.
  // If the user remains at the bottom, resetting would allow another immediate
  // load without the user scrolling again (feels like "auto loading forever").

  /**
   * Reset focus when emails change
   */
  useEffect(() => {
    if (focusedIndex >= emails.length) {
      setFocusedIndex(Math.max(0, emails.length - 1));
    }
  }, [emails.length, focusedIndex]);

  /**
   * Keep focus aligned with the selected/active email
   */
  useEffect(() => {
    if (!activeEmailId) {
      lastAlignedActiveEmailIdRef.current = null;
      return;
    }

    // Avoid forcing focus (and triggering scrollIntoView) when emails append.
    // We only align focus when the active selection actually changes.
    if (lastAlignedActiveEmailIdRef.current === activeEmailId) return;
    lastAlignedActiveEmailIdRef.current = activeEmailId;

    const idx = emails.findIndex((e) => e.id === activeEmailId);
    if (idx >= 0) setFocusedIndex(idx);
  }, [activeEmailId, emails]);

  /**
   * Detect when user scrolls near bottom to trigger auto-load
   * Triggers when within SCROLL_LOAD_THRESHOLD pixels of bottom
   */
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !hasMore || isFetching) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    // If content doesn't overflow, we're always at "bottom", but we should still
    // try to load more (until content fills the viewport).
    const contentOverflows = scrollHeight > clientHeight + 4;

    const isNearBottom = contentOverflows
      ? scrollHeight - scrollTop - clientHeight < SCROLL_LOAD_THRESHOLD
      : true; // If no overflow, consider us "near bottom" to trigger initial loads

    // Only trigger when we CROSS into the near-bottom zone.
    // This prevents repeated calls while the scroll position remains near bottom.
    if (isNearBottom && !wasNearBottomRef.current) {
      const now = Date.now();
      // Throttle to prevent rapid-fire calls from layout/scroll events.
      // This is the main protection against infinite loops.
      if (now - lastLoadMoreAtRef.current < 800) return;

      wasNearBottomRef.current = true;
      lastLoadMoreAtRef.current = now;
      onLoadMore();
      return;
    }

    wasNearBottomRef.current = isNearBottom;
  }, [hasMore, isFetching, onLoadMore]);

  return (
    <div className='flex h-full flex-col rounded-xl border bg-card shadow-sm min-h-0 min-w-0 overflow-hidden'>
      <div className='border-b px-4 py-3 shrink-0'>
        <div className='flex items-center gap-2'>
          {onCompose && (
            <Button
              variant='outline'
              size='sm'
              className='gap-2'
              onClick={onCompose}
            >
              <Plus className='h-4 w-4' />
              Compose
            </Button>
          )}

          <Button
            variant='outline'
            size='sm'
            className='gap-2'
            onClick={onSelectAll}
          >
            <CheckSquare className='h-4 w-4' />
            Select All
          </Button>

          <Button
            variant='ghost'
            size='sm'
            onClick={onMarkRead}
            disabled={actionsDisabled || !selectedEmails.length}
          >
            Mark Read
          </Button>

          <Button
            variant='ghost'
            size='sm'
            onClick={onMarkUnread}
            disabled={actionsDisabled || !selectedEmails.length}
          >
            Mark Unread
          </Button>

          <Button
            variant='ghost'
            size='sm'
            onClick={onDeleteSelected}
            disabled={actionsDisabled || !selectedEmails.length}
          >
            <Trash2 className='h-4 w-4' />
            Delete
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className='flex-1 overflow-y-auto min-h-0 scrollbar-thin touch-scroll smooth-scroll'
      >
        {isLoading ? (
          <div className='flex h-full items-center justify-center text-sm text-muted-foreground'>
            Loading emails…
          </div>
        ) : emails.length ? (
          <ul>
            {emails.map((email, index) => {
              const isFocused = index === focusedIndex;
              const isActive = email.id === activeEmailId;
              return (
                <li
                  key={email.id}
                  ref={(el) => {
                    if (el) {
                      emailRefs.current.set(email.id, el);
                    } else {
                      emailRefs.current.delete(email.id);
                    }
                  }}
                  tabIndex={0}
                  className={`relative border-b px-4 py-3 outline-none transition hover:bg-muted/50 ${
                    isFocused
                      ? 'ring-2 ring-primary ring-inset bg-primary/10'
                      : ''
                  } ${isActive ? 'bg-primary/5' : ''}`}
                  onClick={() => {
                    setFocusedIndex(index);
                    onSelectEmail(email.id);
                  }}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  {isFocused && (
                    <div className='absolute left-0 top-0 bottom-0 w-1 bg-primary' />
                  )}
                  <div className='flex items-start gap-3'>
                    <input
                      type='checkbox'
                      className='mt-1 accent-primary'
                      checked={selectedEmails.includes(email.id)}
                      onChange={() => onToggleSelect(email.id)}
                      aria-label={`Select email from ${email.senderName}`}
                    />
                    <div
                      className={`flex-1 cursor-pointer rounded-lg px-2 py-1 ${
                        email.id === activeEmailId ? 'bg-primary/10' : ''
                      } ${compact ? 'text-sm' : ''}`}
                      onClick={() => onSelectEmail(email.id)}
                    >
                      <div className='flex items-center justify-between'>
                        <p className='font-semibold'>
                          {email.senderName}{' '}
                          {email.unread && (
                            <span className='text-xs'>• Unread</span>
                          )}
                        </p>
                        <span className='text-xs text-muted-foreground'>
                          {new Date(email.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className='text-sm font-medium line-clamp-1'>
                        {email.subject}
                      </p>
                      <p className='text-sm text-muted-foreground line-clamp-1'>
                        {email.preview}
                      </p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type='button'
                          className='text-muted-foreground hover:text-yellow-500 disabled:opacity-50'
                          onClick={() => onStarToggle(email.id, email.starred)}
                          disabled={actionsDisabled}
                        >
                          {email.starred ? (
                            <Star className='h-4 w-4 fill-current' />
                          ) : (
                            <StarOff className='h-4 w-4' />
                          )}
                        </button>
                      </TooltipTrigger>

                      <TooltipContent
                        side='top'
                        sideOffset={6}
                      >
                        {email.starred ? 'Remove star' : 'Add star'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </li>
              );
            })}

            {/* Loading more indicator */}
            {isFetching && (
              <li className='flex items-center justify-center py-4 text-sm text-muted-foreground'>
                <Loader2 className='h-4 w-4 animate-spin mr-2' />
                Loading more emails...
              </li>
            )}
          </ul>
        ) : (
          <div className='flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground'>
            <MailIcon />
            <p>No emails in this mailbox yet.</p>
          </div>
        )}
      </div>

      <div className='flex items-center justify-center border-t px-4 py-2 text-xs text-muted-foreground shrink-0'>
        {emails.length > 0 && (
          <p>
            Showing {emails.length} email{emails.length !== 1 ? 's' : ''}
            {hasMore && ' • Scroll for more'}
          </p>
        )}
      </div>
    </div>
  );
}
