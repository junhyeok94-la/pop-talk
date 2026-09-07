import { IconStarEmpty, IconStarFill } from "@/lib/icons";
import styles from "./popcorn-score.module.css";

/**
 * 감상평의 팝콘점수를 보여준다.
 *
 * 값은 dev.reviews.rating을 그대로 따른다 — 0.5 단위, 0.5 ~ 5.0.
 *
 * 모양은 별을 쓴다. Seed 아이콘 팩에 팝콘이 없어서 대체한 것이다.
 * 팝콘 아이콘이 생기면 IconStarFill·IconStarEmpty만 바꾸면 된다.
 *
 * 0.5점은 아이콘을 반만 보여야 하는데 잘라낼 방법이 없어, 빈 것 5개를 깔고
 * 그 위에 채운 것 5개를 얹은 뒤 위층의 폭을 백분율로 자른다.
 * 3.5점이면 위층이 70%만 보인다.
 */
export function PopcornScore({
  value,
  size = 13,
  showValue = true,
}: {
  value: number;
  size?: number;
  /** 아이콘 옆에 숫자를 함께 보일지. 목록처럼 좁은 자리에서는 끌 수 있다. */
  showValue?: boolean;
}) {
  const clamped = Math.min(5, Math.max(0, value));
  const slots = [0, 1, 2, 3, 4];

  return (
    <span className={styles.root}>
      <span
        className={styles.icons}
        role="img"
        aria-label={`팝콘점수 5점 만점에 ${clamped}점`}
        style={{ "--star-size": `${size}px` } as React.CSSProperties}
      >
        <span className={styles.layer} aria-hidden="true">
          {slots.map((i) => (
            <IconStarEmpty key={i} size={size} />
          ))}
        </span>
        {/* 위층을 점수만큼만 남긴다. overflow: hidden이 나머지를 자른다. */}
        <span
          className={`${styles.layer} ${styles.filled}`}
          aria-hidden="true"
          style={{ width: `${(clamped / 5) * 100}%` }}
        >
          {slots.map((i) => (
            <IconStarFill key={i} size={size} />
          ))}
        </span>
      </span>
      {showValue && <span className={styles.value}>{clamped.toFixed(1)}</span>}
    </span>
  );
}
