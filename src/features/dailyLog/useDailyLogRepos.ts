import { useEffect, useState } from 'react';

import { getDatabase } from '../../db/database';
import { createDailyLogRepos, type DailyLogRepos } from './saveDay';

/** Opens the database once and hands back the repositories, or the reason it couldn't open. */
export function useDailyLogRepos(): { repos: DailyLogRepos | null; error: string | null } {
  const [repos, setRepos] = useState<DailyLogRepos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDatabase().then(
      (db) => {
        if (!cancelled) setRepos(createDailyLogRepos(db));
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { repos, error };
}
