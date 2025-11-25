import { Children, cloneElement, type PropsWithChildren, type ReactElement, useId } from "react";
import clsx from "clsx";
import "../styles.css";

export interface FormFieldProps extends PropsWithChildren {
  label: string;
  /**
   * Optional id for the control. Defaults to an auto-generated id.
   */
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
}

export const FormField = ({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children
}: FormFieldProps) => {
  const generatedId = useId();
  const controlId = htmlFor ?? `nova-field-${generatedId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  type ControlProps = {
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean | "true" | "false";
  };

  const child = Children.only(children) as ReactElement<ControlProps>;
  const control = cloneElement(child, {
    id: child.props.id ?? controlId,
    "aria-describedby": [child.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
    "aria-invalid": error ? true : child.props["aria-invalid"]
  });

  return (
    <div className={clsx("nova-form-field", className)}>
      <label className="nova-form-field__label" htmlFor={controlId}>
        <span>{label}</span>
        {required ? <span className="nova-form-field__required" aria-hidden="true">*</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="nova-form-field__hint">
          {hint}
        </p>
      ) : null}
      <div className="nova-form-field__control">{control}</div>
      {error ? (
        <p id={errorId} role="alert" className="nova-form-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
};
