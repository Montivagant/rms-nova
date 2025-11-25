"use client";

import { useTransition, type ChangeEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormField, Select } from "@nova/design-system";

type WindowPickerProps = {
  value: number;
  options: number[];
  defaultValue: number;
  label?: string;
  param?: string;
  className?: string;
};

export default function WindowPicker({
  value,
  options,
  defaultValue,
  label = "Window",
  param = "window",
  className
}: WindowPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString());
      if (nextValue === String(defaultValue)) {
        params.delete(param);
      } else {
        params.set(param, nextValue);
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    });
  };

  return (
    <FormField label={label} className={className}>
      <Select value={String(value)} onChange={handleChange} disabled={isPending}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option} days
          </option>
        ))}
      </Select>
    </FormField>
  );
}

