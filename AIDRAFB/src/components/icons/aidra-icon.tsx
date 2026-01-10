import { SVGProps } from 'react';

export function AidraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M15.59 7.41 14.12 8.88" />
      <path d="M9.88 15.12 8.41 16.59" />
      <path d="m16 9-8 8" />
      <path d="M8 9a4 4 0 0 0 0 6" />
      <path d="M16 15a4 4 0 0 0 0-6" />
    </svg>
  );
}
