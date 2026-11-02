import { useState, type ReactElement } from 'react'
import { useStore } from './store'
import { OutputPanel } from './components/OutputPanel'
import { Modal, Spinner, StatusDot, Switch } from './components/Controls'
import {
  IconChip, IconClose, IconMacro, IconGear, IconKeyboard, IconLight, IconMinus, IconScreen, IconSidebar, IconSquare
} from './components/Icons'
import { DevicePage } from './pages/DevicePage'
import { KeymapPage } from './pages/KeymapPage'
import { LightingPage } from './pages/LightingPage'
import { DisplayPage } from './pages/DisplayPage'
import { MacrosPage } from './pages/MacrosPage'

type PageId = 'device' | 'keymap' | 'macros' | 'lighting' | 'display'

const PAGES: Array<{ id: PageId; label: string; icon: (p: { width: number; height: number }) => ReactElement; hint: string }> = [
  { id: 'device', label: 'Устройство', icon: IconChip, hint: 'info' },
  { id: 'keymap', label: 'Раскладка', icon: IconKeyboard, hint: 'VIA' },
  { id: 'macros', label: 'Макросы', icon: IconMacro, hint: 'VIA' },
  { id: 'lighting', label: 'Подсветка', icon: IconLight, hint: 'RGB' },
  { id: 'display', label: 'Экран и часы', icon: IconScreen, hint: '240×135' }
]

export function App(): ReactElement {
  const [page, setPage] = useState<PageId>('device')
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { busy } = useStore()

  return (
    <div className="app">
      <header className="titlebar">
        <button className="v-btn v-btn-ghost v-btn-icon" title="Сайдбар" onClick={() => setCollapsed((c) => !c)}>
          <IconSidebar width={15} height={15} />
        </button>
        <span className="titlebar-title">GMK87 Control</span>
        {busy && (
          <span className="status muted" style={{ marginLeft: 8, fontSize: 12 }}>
            <Spinner /> {busy}
          </span>
        )}
        <span className="titlebar-spacer" />
        <button className="v-btn v-btn-ghost v-btn-icon" title="Настройки" onClick={() => setSettingsOpen(true)}>
          <IconGear width={15} height={15} />
        </button>
        <div className="titlebar-controls">
          <button className="titlebar-control" title="Свернуть" onClick={() => window.gmk.window.minimize()}>
            <IconMinus width={14} height={14} />
          </button>
          <button className="titlebar-control" title="Развернуть" onClick={() => window.gmk.window.toggleMaximize()}>
            <IconSquare width={12} height={12} />
          </button>
          <button className="titlebar-control close" title="Закрыть" onClick={() => window.gmk.window.close()}>
            <IconClose width={14} height={14} />
          </button>
        </div>
      </header>
      <div className="body">
        <Sidebar page={page} setPage={setPage} collapsed={collapsed} />
        <main className="main">
          <div className="page">
            {page === 'device' && <DevicePage />}
            {page === 'keymap' && <KeymapPage />}
            {page === 'macros' && <MacrosPage />}
            {page === 'lighting' && <LightingPage />}
            {page === 'display' && <DisplayPage />}
          </div>
          <OutputPanel />
        </main>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function Sidebar({ page, setPage, collapsed }: { page: PageId; setPage: (p: PageId) => void; collapsed: boolean }): ReactElement {
  const { status, probe } = useStore()
  const connected = !!status?.connected
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-top">
        <div className="device-summary">
          <span className="device-name">Zuoya GMK87</span>
          <span className={`status ${connected ? 'ok' : ''}`}>
            <StatusDot state={connected ? 'ok' : 'idle'} />
            {connected ? (status!.mode === 'usb' ? 'Кабель USB' : '2.4G-донгл') : 'Не подключена'}
          </span>
          {probe?.viaProtocol != null && (
            <span className="mono muted" style={{ fontSize: 11 }}>
              VIA {probe.viaProtocol} · {probe.viaProtocol >= 11 ? 'V0112' : 'V0104'}
            </span>
          )}
        </div>
      </div>
      <nav className="sidebar-mid">
        <div className="sidebar-section-title">Настройка</div>
        {PAGES.map((p) => (
          <button key={p.id} className={`nav-item${page === p.id ? ' active' : ''}`} onClick={() => setPage(p.id)}>
            <p.icon width={16} height={16} />
            {p.label}
            <span className="nav-hint">{p.hint}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="muted mono" style={{ fontSize: 11 }}>
          {connected ? `320f:${status!.productId?.toString(16)}` : 'ожидание устройства…'}
        </div>
      </div>
    </aside>
  )
}

function SettingsModal({ onClose }: { onClose: () => void }): ReactElement {
  const { settings, setSettings } = useStore()
  if (!settings) return <></>
  const update = async (p: Partial<typeof settings>): Promise<void> => setSettings(await window.gmk.settings.set(p))
  return (
    <Modal title="Настройки" onClose={onClose}
      footer={<button className="v-btn v-btn-primary" onClick={onClose}>Готово</button>}>
      <Switch checked={settings.syncClockOnWrite} onChange={(v) => void update({ syncClockOnWrite: v })}
        label="Синхронизировать часы при каждой записи настроек" />
      <Switch checked={settings.logPackets} onChange={(v) => void update({ logPackets: v })}
        label="Писать HID-пакеты в лог (hex)" />
      <Switch checked={settings.vendorOverDongle} onChange={(v) => void update({ vendorOverDongle: v })}
        label="Пробовать протокол экрана и настроек через 2.4G-донгл (экспериментально)" />
      <div className="field-hint">
        Донгл не передаёт этот протокол клавиатуре: обычно ответа нет или приходит пустой блок. Пустой блок
        приложение не запишет, но по кабелю надёжнее.
      </div>
      <div className="field">
        <div className="field-label">Папка для резервных копий раскладки</div>
        <div className="row">
          <input className="v-input mono" style={{ flex: 1 }} readOnly value={settings.backupDir} />
          <button className="v-btn v-btn-secondary" onClick={async () => setSettings(await window.gmk.settings.pickBackupDir())}>
            Выбрать…
          </button>
        </div>
      </div>
    </Modal>
  )
}
