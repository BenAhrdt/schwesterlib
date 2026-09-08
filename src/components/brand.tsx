import Link from "next/link";
import { Cross } from "lucide-react";
export function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark">
        <Cross size={21} strokeWidth={2.5} />
      </span>
      <span>
        Schwester<span className="brand-light">Lib</span>
        <small>PERSÖNLICH. GUT VERSORGT.</small>
      </span>
    </Link>
  );
}
