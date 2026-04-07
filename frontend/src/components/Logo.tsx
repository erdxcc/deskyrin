import { Link } from "react-router-dom";

export function Logo({ large }: { large?: boolean }) {
  return (
    <Link
      to="/"
      className={`group font-display inline-flex font-semibold tracking-tight ${
        large ? "text-3xl sm:text-4xl" : "text-xl"
      }`}
    >
      <span className="text-gradient transition-opacity group-hover:opacity-90">
        Deskyrin
      </span>
    </Link>
  );
}
