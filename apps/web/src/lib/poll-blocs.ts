/** Publisher-reported blocs, copied from the linked Israeli poll articles.
 * These are not a party-level classification or a coalition prediction.
 */
export interface PollBloc {
  pollId: string;
  groups: { label: string; seats: number; color: string }[];
  /** Seats this poll gave Ra'am and the Joint List, which the publisher left out of its blocs. */
  arabListSeats: number;
}
export const pollBlocs: PollBloc[] = [
  {
    pollId: "poll:hamadad-c13-2026-09-23",
    groups: [
      { label: "גוש האופוזיציה", seats: 52, color: "bg-sky-400" },
      { label: "הקואליציה", seats: 51, color: "bg-amber-400" },
      { label: "הנדל–זליכה", seats: 4, color: "bg-violet-400" },
    ],
    arabListSeats: 13,
  },
  {
    pollId: "poll:midgam-n12-2026-09-22",
    groups: [
      { label: "הגוש המתנגד לנתניהו – מפלגות ציוניות", seats: 54, color: "bg-sky-400" },
      { label: "הקואליציה", seats: 50, color: "bg-amber-400" },
      { label: "הנדל–זליכה (הגוש השלישי)", seats: 4, color: "bg-violet-400" },
    ],
    arabListSeats: 12,
  },
  {
    pollId: "poll:nextdata-c14-2026-09-23",
    groups: [
      { label: "גוש הימין", seats: 63, color: "bg-amber-400" },
      { label: "גוש השמאל", seats: 45, color: "bg-sky-400" },
    ],
    arabListSeats: 12,
  },
];
