export interface BirthdayPerson {
  id: string;
  display_name: string;
  avatar_url: string | null;
  /** "YYYY-MM-DD" */
  birthday: string;
}

export interface NextBirthday {
  /** "MM-DD" */
  md: string;
  daysUntil: number;
  people: BirthdayPerson[];
}

export interface NextAgendaEvent {
  id: string;
  title: string;
  /** "YYYY-MM-DD" */
  event_date: string;
  event_time: string | null;
  daysUntil: number;
  confirmedCount: number;
}

export interface HomeHighlights {
  todayBirthdays: BirthdayPerson[];
  nextBirthday: NextBirthday | null;
  nextEvent: NextAgendaEvent | null;
}
