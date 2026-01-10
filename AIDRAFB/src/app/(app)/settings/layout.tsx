
import React from 'react';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="mx-auto max-w-6xl">{children}</div>;
}
