import type { PropsWithChildren } from "react";
import clsx from "clsx";
import "../styles.css";

export interface CardProps extends PropsWithChildren {
  title?: string;
  className?: string;
}

export const Card = ({ title, className, children }: CardProps) => (
  <div className={clsx("nova-card", className)}>
    {title ? <div className="nova-card__header">{title}</div> : null}
    <div className="nova-card__content">{children}</div>
  </div>
);
