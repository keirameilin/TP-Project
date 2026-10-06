import { addDays, toLocalDateString } from '../../lib/dates';
import { useSelectedDate } from './SelectedDate';
import { PitchLink, Stepper } from './ui';

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return parseDate(date).toLocaleDateString(undefined, { weekday: 'long' });
}

/** Steps the shared selected day back and forward. Future days can't be logged, so "next" stops at today. */
export function DateNav() {
  const { date, setDate } = useSelectedDate();
  const today = toLocalDateString(new Date());
  return (
    <>
      <Stepper
        title={dayLabel(date, today)}
        subtitle={parseDate(date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
        onPrevious={() => setDate(addDays(date, -1))}
        onNext={() => setDate(addDays(date, 1))}
        previousLabel="Previous day"
        nextLabel="Next day"
        nextHidden={date >= today}
      />
      {date !== today ? <PitchLink label="Back to today" onPress={() => setDate(today)} /> : null}
    </>
  );
}
