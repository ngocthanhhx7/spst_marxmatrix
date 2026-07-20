import { Link } from 'react-router';

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <Link className={`brand-mark ${className}`.trim()} to="/" aria-label="MarxMatrix">
      <svg aria-hidden="true" viewBox="0 0 40 40" focusable="false">
        <path className="brand-mark__frame" d="M2 2h36v36H2z" />
        <path className="brand-mark__axis" d="M20 2v36M2 20h36" />
        <path className="brand-mark__signal" d="M8 29 16 21l6 5 10-15" />
        <circle className="brand-mark__point" cx="32" cy="11" r="3" />
      </svg>
      <span>MarxMatrix</span>
    </Link>
  );
}
