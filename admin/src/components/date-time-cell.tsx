import styles from "./date-time-cell.module.css";

/** "YYYY-MM-DD HH:mm:ss"를 날짜/시각 두 줄로 나눠 보여주는 표 셀. */
export function DateTimeCell({ value }: { value?: string | null }) {
  if (!value) return <span className={styles.none}>—</span>;
  const [date, time] = value.split(" ");
  return (
    <div className={styles.cell}>
      <div className={styles.date}>{date}</div>
      {time && <div className={styles.time}>{time}</div>}
    </div>
  );
}
