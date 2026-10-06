import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { toLocalDateString } from '../../lib/dates';

interface SelectedDate {
  /** The day the Log and Food tabs are showing, YYYY-MM-DD. */
  date: string;
  setDate: (date: string) => void;
}

const SelectedDateContext = createContext<SelectedDate | null>(null);

/**
 * Holds the day being viewed so the Log and Food tabs stay on the same one. It only changes when
 * the player steps to another day, so a save just after midnight still lands on the day shown.
 */
export function SelectedDateProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const value = useMemo(() => ({ date, setDate }), [date]);
  return <SelectedDateContext.Provider value={value}>{children}</SelectedDateContext.Provider>;
}

export function useSelectedDate(): SelectedDate {
  const value = useContext(SelectedDateContext);
  if (!value) throw new Error('useSelectedDate must be used inside SelectedDateProvider');
  return value;
}
