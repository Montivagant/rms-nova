import { forwardRef, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";
import "../styles.css";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error = false, rows = 3, ...rest }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={clsx("nova-textarea", error && "nova-textarea--error", className)}
      aria-invalid={error}
      {...rest}
    />
  )
);

Textarea.displayName = "Textarea";
