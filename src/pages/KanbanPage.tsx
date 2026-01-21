import { useEffect, useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { searchKanban, semanticSearchKanban } from '@/lib/api/kanban.api';
import { getKanbanColumns } from '@/lib/api/kanban-config.api';
import { SearchResults } from '@/components/kanban/SearchResults';
import { KanbanInboxView } from '@/components/kanban/KanbanInboxView';
import { KanbanHeader } from '@/components/kanban/KanbanHeader';
import { getGmailUrl } from '@/utils/emailUtils';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import {
  useGmailPush,
  startGmailWatch,
  type GmailNotification,
} from '@/hooks/email/useGmailPush';
import {
  invalidateAllEmailListsForMailbox,
  invalidateMailboxes,
} from '@/lib/db/emailCache';

/**
 * KanbanPage - Kanban board view for emails
 *
 * Features:
 * - Kanban board with drag-drop columns (To Do, In Progress, Done)
 * - Smart search (fuzzy and semantic search)
 * - Real-time updates via Gmail Push (WebSocket)
 * - Offline caching with IndexedDB
 */
export default function KanbanPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  // Kanban always uses INBOX
  const selectedMailbox = 'INBOX';

  // Search state (for kanban mode)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<'fuzzy' | 'semantic'>('fuzzy');

  /**
   * Handle Gmail push notification - invalidate caches and trigger refresh
   * IMPORTANT: Must invalidate IndexedDB cache BEFORE React Query
   * to ensure fresh data is fetched from server
   */
  const handleGmailNotification = useCallback(
    async (notification: GmailNotification) => {
      console.log('🔔 Gmail notification received:', notification);

      // STEP 1: Invalidate IndexedDB cache FIRST
      await Promise.all([
        invalidateAllEmailListsForMailbox(),
        invalidateMailboxes(),
      ]);
      console.log('✅ IndexedDB cache invalidated for real-time update');

      // STEP 2: Now invalidate React Query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-emails'] });

      console.log('✅ React Query invalidated, UI will refresh');
    },
    [queryClient]
  );

  // Gmail Push Notifications via WebSocket
  useGmailPush({
    onNotification: handleGmailNotification,
    onConnect: () => {
      console.log('Gmail Push connected');
    },
    onError: (error) => {
      console.error('Gmail Push error:', error);
    },
  });

  // Start Gmail watch on initial load (only once per session)
  useEffect(() => {
    const watchStarted = sessionStorage.getItem('gmailWatchStarted');
    if (!watchStarted && user) {
      startGmailWatch()
        .then(() => {
          sessionStorage.setItem('gmailWatchStarted', 'true');
          console.log('Gmail watch started successfully');
        })
        .catch((err) => {
          console.error('Failed to start Gmail watch:', err);
        });
    }
  }, [user]);
