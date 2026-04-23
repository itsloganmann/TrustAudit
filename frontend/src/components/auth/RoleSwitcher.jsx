import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * Friendly cross-link telling the user how to switch to the other role's
 * signin/signup page.
 *
 * @param {object} props
 * @param {"vendor"|"driver"} props.currentRole
 * @param {"signin"|"signup"} props.mode
 */
export default function RoleSwitcher({ currentRole, mode }) {
  const otherRole = currentRole === "vendor" ? "driver" : "vendor";
  const otherCopy =
    otherRole === "vendor"
      ? "I'm an enterprise CFO or accountant"
      : "I'm a supplier driver or field agent";

  return (
    <Link
      to={`/auth/${otherRole}/${mode}`}
      className="group flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 transition-all"
    >
      <span className="text-[12px] text-zinc-600 group-hover:text-zinc-900 transition-colors">
        Wrong sign-in page?{" "}
        <span className="text-zinc-900 font-medium">{otherCopy}</span>
      </span>
      <ArrowRight
        size={13}
        className="text-zinc-400 group-hover:text-zinc-900 transition-colors shrink-0"
      />
    </Link>
  );
}
