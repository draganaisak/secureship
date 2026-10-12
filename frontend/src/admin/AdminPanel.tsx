import { useState, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import CustomerManager from './CustomerManager'
import ShipmentManager from './ShipmentManager'
import PackageManager from './PackageManager'

type Tab = 'customers' | 'shipments' | 'packages'

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'w-5 h-5',
}

const UsersIcon = () => (
  <svg {...iconProps}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const TruckIcon = () => (
  <svg {...iconProps}>
    <rect x="1" y="3" width="15" height="13" />
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
)

const BoxIcon = () => (
  <svg {...iconProps}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'customers', label: 'Customers', icon: <UsersIcon /> },
  { key: 'shipments', label: 'Shipments', icon: <TruckIcon /> },
  { key: 'packages', label: 'Packages', icon: <BoxIcon /> },
]

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('shipments')
  const { user, logout } = useAuth0()

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      <header className="shrink-0 bg-violet-600 text-white">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <h1 className="shrink-0 font-semibold">SecureShip - Admin</h1>
          <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-3">
            {user && (
              <span className="truncate text-violet-100">{user.name ?? user.email}</span>
            )}
            <button
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 cursor-pointer transition"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-16 shrink-0 bg-white border-r border-slate-200">
          <nav className="flex flex-col items-center gap-1 p-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-label={t.label}
                className={`group relative flex items-center justify-center w-11 h-11 rounded-lg cursor-pointer transition ${
                  tab === t.key
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                {t.icon}
                <span className="pointer-events-none absolute left-full ml-2 z-40 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs text-white opacity-0 shadow-sm transition group-hover:opacity-100">
                  {t.label}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
          {tab === 'customers' && <CustomerManager />}
          {tab === 'shipments' && <ShipmentManager />}
          {tab === 'packages' && <PackageManager />}
        </main>
      </div>
    </div>
  )
}
