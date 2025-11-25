"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@nova/design-system";

interface FilterPanelProps {
  title: string;
  description?: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
}

export function FilterPanel({ title, description, children, defaultCollapsed }: FilterPanelProps) {
  const [collapsed, setCollapsed] = useState(Boolean(defaultCollapsed));
  const contentId = useId();
  const toggleLabel = collapsed ? "Show filters" : "Enter focus mode";

  return (
    <section
      className={`filter-panel${collapsed ? " filter-panel--collapsed" : ""}`}
      aria-label={`${title} panel`}
    >
      <div className="filter-panel__header">
        <div>
          <h3 className="filter-panel__title">{title}</h3>
          {description ? <p className="filter-panel__description">{description}</p> : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setCollapsed((state) => !state)}
          aria-expanded={!collapsed}
          aria-controls={contentId}
        >
          {toggleLabel}
        </Button>
      </div>
      <div
        id={contentId}
        className="filter-panel__body"
        hidden={collapsed}
        data-collapsed={collapsed ? "true" : "false"}
      >
        {children}
      </div>
      {collapsed ? (
        <p className="filter-panel__hint">
          Focus mode is on. Use &quot;Show filters&quot; to adjust the dataset.
        </p>
      ) : null}
    </section>
  );
}
