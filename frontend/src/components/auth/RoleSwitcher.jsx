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
      className="group flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl glass glass-hover transition-all"
    >
      <span className="text-[12px] text-slate-400 group-hover:text-slate-200 transition-colors">
        Wrong sign-in page?{" "}
        <span className="text-white font-medium">{otherCopy}</span>
      </span>
      <ArrowRight
        size={13}
        className="text-slate-500 group-hover:text-white transition-colors shrink-0"
      />
    </Link>
  );
}
