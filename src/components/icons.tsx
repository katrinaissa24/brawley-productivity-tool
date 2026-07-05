import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: P, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconInbox = (p: P) =>
  base(
    p,
    <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>,
  );

export const IconSun = (p: P) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22" />
      <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
      <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
      <line x1="2" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="19.1" x2="6.7" y2="17.3" />
      <line x1="17.3" y1="6.7" x2="19.1" y2="4.9" />
    </>,
  );

export const IconZap = (p: P) =>
  base(p, <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />);

export const IconCheckCircle = (p: P) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="8 12.5 11 15.5 16 9.5" />
    </>,
  );

export const IconChart = (p: P) =>
  base(
    p,
    <>
      <line x1="6" y1="20" x2="6" y2="12" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="9" />
    </>,
  );

export const IconSearch = (p: P) =>
  base(
    p,
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </>,
  );

export const IconPlus = (p: P) =>
  base(
    p,
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>,
  );

export const IconX = (p: P) =>
  base(
    p,
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>,
  );

export const IconCheck = (p: P) => base(p, <polyline points="5 12.5 10 17.5 19 7" />);

export const IconChevronDown = (p: P) => base(p, <polyline points="6 9 12 15 18 9" />);

export const IconChevronRight = (p: P) => base(p, <polyline points="9 6 15 12 9 18" />);

export const IconChevronLeft = (p: P) => base(p, <polyline points="15 6 9 12 15 18" />);

export const IconSettings = (p: P) =>
  base(
    p,
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <circle cx="9.5" cy="7" r="2.2" fill="rgb(var(--c-panel))" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="14.5" cy="17" r="2.2" fill="rgb(var(--c-panel))" />
    </>,
  );

export const IconCalendar = (p: P) =>
  base(
    p,
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </>,
  );

export const IconClock = (p: P) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </>,
  );

export const IconTarget = (p: P) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>,
  );

export const IconRepeat = (p: P) =>
  base(
    p,
    <>
      <polyline points="17 2 21 6 17 10" />
      <path d="M3 12v-2a4 4 0 0 1 4-4h14" />
      <polyline points="7 22 3 18 7 14" />
      <path d="M21 12v2a4 4 0 0 1-4 4H3" />
    </>,
  );

export const IconArchive = (p: P) =>
  base(
    p,
    <>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
      <line x1="10" y1="13" x2="14" y2="13" />
    </>,
  );

export const IconTrash = (p: P) =>
  base(
    p,
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </>,
  );

export const IconPencil = (p: P) =>
  base(
    p,
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
  );

export const IconFlag = (p: P) =>
  base(
    p,
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </>,
  );

export const IconGrip = (p: P) =>
  base(
    p,
    <>
      <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" />
    </>,
  );

export const IconMore = (p: P) =>
  base(
    p,
    <>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>,
  );

export const IconBoard = (p: P) =>
  base(
    p,
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9.5" y1="4" x2="9.5" y2="20" />
      <line x1="15.5" y1="4" x2="15.5" y2="20" />
    </>,
  );

export const IconList = (p: P) =>
  base(
    p,
    <>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1" fill="currentColor" stroke="none" />
    </>,
  );

export const IconLink = (p: P) =>
  base(
    p,
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>,
  );

export const IconBell = (p: P) =>
  base(
    p,
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>,
  );

export const IconKeyboard = (p: P) =>
  base(
    p,
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <line x1="7" y1="15" x2="17" y2="15" />
      <circle cx="7" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="11" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none" />
    </>,
  );

export const IconDatabase = (p: P) =>
  base(
    p,
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </>,
  );

export const IconDownload = (p: P) =>
  base(
    p,
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>,
  );

export const IconUpload = (p: P) =>
  base(
    p,
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 8 12 3 17 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>,
  );

export const IconFolder = (p: P) =>
  base(
    p,
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  );

export const IconArrowRight = (p: P) =>
  base(
    p,
    <>
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="13 5 20 12 13 19" />
    </>,
  );

export const IconCircle = (p: P) => base(p, <circle cx="12" cy="12" r="9" />);

export const IconPause = (p: P) =>
  base(
    p,
    <>
      <line x1="9" y1="6" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="18" />
    </>,
  );

export const IconAlert = (p: P) =>
  base(
    p,
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
    </>,
  );

export const IconSparkle = (p: P) =>
  base(
    p,
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
  );

export const IconEye = (p: P) =>
  base(
    p,
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>,
  );
