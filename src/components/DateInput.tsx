import * as React from "react";
import { validDate } from "../models/schema";
export const DateValidationContext = React.createContext<
  (id: string, invalid: boolean) => void
>(() => undefined);
export const displayDate = (iso: string | null | undefined): string =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
export function parseDisplayDate(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return validDate(iso) ? iso : null;
}
interface Props {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  readOnly?: boolean;
  label?: string;
  onInvalidChange?: (invalid: boolean) => void;
}
export default function DateInput(p: Props): React.ReactElement {
  const [text, setText] = React.useState(displayDate(p.value));
  const [invalid, setInvalid] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  const reportInvalid = React.useContext(DateValidationContext);
  const id = React.useId();
  React.useEffect(() => () => reportInvalid(id, false), [reportInvalid, id]);
  React.useEffect(() => {
    setText(displayDate(p.value));
    setInvalid(false);
    ref.current?.setCustomValidity("");
  }, [p.value]);
  return (
    <span className="mb-date-input">
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        aria-label={p.label}
        aria-invalid={invalid || undefined}
        data-mb-date="true"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        value={text}
        disabled={p.disabled}
        readOnly={p.readOnly}
        onChange={(e) => {
          const value = e.target.value;
          setText(value);
          const parsed = parseDisplayDate(value);
          const bad = !!value && !parsed;
          setInvalid(bad);
          reportInvalid(id, bad);
          p.onInvalidChange?.(bad);
          e.target.setCustomValidity(
            bad ? "กรุณากรอกวันที่ถูกต้องเป็น dd/mm/yyyy" : "",
          );
          if (!value || parsed) p.onChange(parsed);
        }}
      />
      {invalid && (
        <small className="mb-error">กรุณากรอกวันที่ถูกต้อง dd/mm/yyyy</small>
      )}
    </span>
  );
}
