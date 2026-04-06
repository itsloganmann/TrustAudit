import { NavLink } from "react-router-dom";

/**
 * Vertical sidebar nav with active-route highlighting.
 *
 * @param {object} props
 * @param {Array<{ to: string, label: string, icon: React.ReactNode, count?: number }>} props.items
 * @param {string} [props.className]
 */
export default function SidebarNav({ items, className = "" }) {
  return (
    <nav className={`flex flex-col gap-1 ${className}`}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `group flex items-center gap-2.5 px-3 h-9 rounded-lg text-[12.5px] font-medium tracking-tight transition-all ${
              isActive
                ? "bg-white/[0.08] text-white border border-white/[0.1]"
                : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent"
            }`
          }
        >
          <span className="opacity-80 group-hover:opacity-100 transition-opacity">
            {item.icon}
          </span>
          <span className="flex-1">{item.label}</span>
          {typeof item.count === "number" && (
            <span className="text-[10px] text-slate-600 tabular-nums">
              {item.count}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
