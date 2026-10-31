// Einheitliche Strich-Icons (24 × 24, currentColor).
const PFADE = {
  heute: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z',
  kamera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  fortschritt: 'M5 20V11M12 20V5M19 20v-6',
  profil: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  mikro: 'M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zM5 11a7 7 0 0 0 14 0M12 18v3',
  senden: 'M5 12h13M13 6l6 6-6 6',
  zurueck: 'M15 6l-6 6 6 6',
  weiter: 'M9 6l6 6-6 6',
  haken: 'M5 12.5 10 17 19 7',
  plus: 'M12 5v14M5 12h14',
  buch: 'M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM8 7h6',
  lautsprecher: 'M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6',
  stopp: 'M6 6h12v12H6z',
  team: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  freigabe: 'M5 12.5 10 17 19 7',
  hochladen: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  herunterladen: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  warnung: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5V13M12 16.5h.01',
  aktualisieren: 'M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3M4 4v4h4M20 20v-4h-4',
  neu: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  kopieren: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  hoch: 'M12 19V5M6 11l6-6 6 6',
  licht: 'M13 2 5 13.5h6L10 22l8-11.5h-6z',
  abmelden: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3',
} as const

export type IconName = keyof typeof PFADE

export function Icon({ name, groesse = 24, staerke = 1.8 }: { name: IconName; groesse?: number; staerke?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={staerke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PFADE[name]} />
    </svg>
  )
}
