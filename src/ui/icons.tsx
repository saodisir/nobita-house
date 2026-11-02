import type { ReactNode } from 'react';
import type { TimeOfDayId } from '../data/time-of-day';

/** 16px line icons for the chrome, drawn in currentColor so they follow button states. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const ResetIcon = () => (
  <Icon>
    <path d="M3 8a5 5 0 1 0 1.5-3.5" />
    <path d="M3 2.5V5h2.5" />
  </Icon>
);

export const RotateIcon = () => (
  <Icon>
    <path d="M13 8a5 5 0 1 1-1.5-3.5" />
    <path d="M13 2.5V5h-2.5" />
    <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const SlidersIcon = () => (
  <Icon>
    <path d="M2.5 4.5h2.2M8 4.5h5.5M2.5 11.5h5.8M11.6 11.5h1.9" />
    <circle cx="6.3" cy="4.5" r="1.6" />
    <circle cx="10" cy="11.5" r="1.6" />
  </Icon>
);

export const PersonIcon = () => (
  <Icon>
    <circle cx="8" cy="5" r="2.6" />
    <path d="M3 14c.6-2.9 2.6-4.4 5-4.4s4.4 1.5 5 4.4" />
  </Icon>
);

export const HouseIcon = () => (
  <Icon>
    <path d="M2.5 7.3 8 2.8l5.5 4.5" />
    <path d="M3.9 8.4v4.8h8.2V8.4" />
  </Icon>
);

export const ChevronIcon = () => (
  <Icon>
    <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
  </Icon>
);

export const ChevronLeftIcon = () => (
  <Icon>
    <path d="m9.5 4.5-3.5 3.5 3.5 3.5" />
  </Icon>
);

export const ChevronRightIcon = () => (
  <Icon>
    <path d="m6.5 4.5 3.5 3.5-3.5 3.5" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon>
    <path d="M5 3.5v9l7-4.5z" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="m4.5 4.5 7 7m0-7-7 7" />
  </Icon>
);

export const SpeakerIcon = ({ muted }: { muted: boolean }) => (
  <Icon>
    <path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor" />
    {muted ? (
      <path d="m11 6 3.5 4m0-4L11 10" />
    ) : (
      <path d="M10.8 5.6a3.4 3.4 0 0 1 0 4.8M12.6 3.8a6 6 0 0 1 0 8.4" />
    )}
  </Icon>
);

export const RainIcon = () => (
  <Icon>
    <path d="M4.6 9.5a2.6 2.6 0 0 1-.3-5.2 3.6 3.6 0 0 1 7 .9 2.2 2.2 0 0 1 .1 4.3z" />
    <path d="m5.5 11.5-.7 2M8.3 11.5l-.7 2M11.1 11.5l-.7 2" />
  </Icon>
);

// Sunrise and sunset share the horizon and half sun; the arrow says which way it is going.
const horizon = (
  <>
    <path d="M2 12.5h12" />
    <path d="M4.5 12.5a3.5 3.5 0 0 1 7 0" />
  </>
);

const timeOfDayGlyphs: Record<TimeOfDayId, ReactNode> = {
  dawn: (
    <>
      {horizon}
      <path d="M8 6V2.5M6.5 4 8 2.5 9.5 4" />
    </>
  ),
  morning: (
    <>
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </>
  ),
  sunset: (
    <>
      {horizon}
      <path d="M8 2.5V6M6.5 4.5 8 6l1.5-1.5" />
    </>
  ),
  night: <path d="M12.8 10.2A5.5 5.5 0 0 1 5.8 3.2a5.5 5.5 0 1 0 7 7z" />,
};

export const TimeOfDayIcon = ({ id }: { id: TimeOfDayId }) => <Icon>{timeOfDayGlyphs[id]}</Icon>;
