import { Link } from 'react-router-dom';
import { HiOutlineMail } from 'react-icons/hi';
import { useTopLevelCategories } from '../../hooks/useCategories.js';

const SOCIALS = ['Instagram', 'Facebook', 'X'];

function FooterColumn({ title, children }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h3>
      <ul className="space-y-2 text-sm text-stone-600">{children}</ul>
    </div>
  );
}

const linkClass = 'transition hover:text-stone-900';

export default function Footer() {
  const { categories } = useTopLevelCategories();

  return (
    <footer className="border-t border-stone-200 bg-stone-50">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 md:grid-cols-4 lg:px-8">
        <FooterColumn title="Shop">
          <li>
            <Link to="/products" className={linkClass}>
              All Products
            </Link>
          </li>
          {categories.map((cat) => (
            <li key={cat.slug}>
              <Link to={`/products?category=${cat.slug}`} className={linkClass}>
                {cat.label}
              </Link>
            </li>
          ))}
        </FooterColumn>

        <FooterColumn title="Company">
          <li>
            <Link to="/about" className={linkClass}>
              About
            </Link>
          </li>
          <li>
            <Link to="/contact" className={linkClass}>
              Contact
            </Link>
          </li>
        </FooterColumn>

        <FooterColumn title="Help">
          <li>
            <Link to="/size-guide" className={linkClass}>
              Size Guide
            </Link>
          </li>
          <li>
            <Link to="/shipping-returns" className={linkClass}>
              Shipping &amp; Returns
            </Link>
          </li>
          <li>
            <a href="mailto:hello@shopeclothes.test" className={`flex items-center gap-1.5 ${linkClass}`}>
              <HiOutlineMail size={16} />
              hello@shopeclothes.test
            </a>
          </li>
        </FooterColumn>

        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Follow
          </h3>
          {/* Placeholder only — no real social accounts exist for this demo yet. */}
          <ul className="space-y-2 text-sm text-stone-400">
            {SOCIALS.map((name) => (
              <li key={name} aria-disabled="true" title="Coming soon">
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-stone-200 px-4 py-4 text-center text-xs text-stone-500 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} Shope Clothes. All rights reserved.
      </div>
    </footer>
  );
}
