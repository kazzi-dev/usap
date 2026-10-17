"use client";

import type { LanguageCode } from "@usap/shared";
import { isLanguageCode, LANGUAGE_OPTIONS } from "@/lib/languages";

interface LanguageSelectProps {
  id?: string;
  value: LanguageCode;
  onChange: (lang: LanguageCode) => void;
  className?: string;
}

export function LanguageSelect({ id, value, onChange, className = "" }: LanguageSelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => {
        if (isLanguageCode(e.target.value)) onChange(e.target.value);
      }}
      className={`rounded-lg border border-neutral-700 bg-neutral-900 text-white outline-none focus:border-sky-500 ${className}`}
    >
      {LANGUAGE_OPTIONS.map((option) => (
        <option key={option.code} value={option.code}>
          {option.native === option.label ? option.label : `${option.label} (${option.native})`}
        </option>
      ))}
    </select>
  );
}
