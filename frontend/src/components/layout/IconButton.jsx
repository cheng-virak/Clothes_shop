import { Link } from 'react-router-dom';

const baseClass =
  'group relative flex h-11 w-11 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100';

const Tooltip = ({ text }) => (
  <span
    role="tooltip"
    className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-stone-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity delay-300 duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
  >
    {text}
  </span>
);

/**
 * A plain icon link/button (Blog, Cart) with the same hover/focus tooltip
 * treatment as IconMenu's trigger, so all four header icons read the same
 * way. Pass `to` for a Link, or `onClick` for a button.
 */
export default function IconButton({ icon: Icon, label, tooltip, to, onClick, badge }) {
  const content = (
    <>
      <Icon size={22} />
      {badge}
      <Tooltip text={tooltip ?? label} />
    </>
  );

  if (to) {
    return (
      <Link to={to} aria-label={label} className={baseClass}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={label} className={baseClass}>
      {content}
    </button>
  );
}
