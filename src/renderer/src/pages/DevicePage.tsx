import type { ReactElement } from 'react'
import { useStore } from '../store'
import { Card, StatusDot } from '../components/Controls'
import { IconRefresh } from '../components/Icons'
import { USAGE_PAGE_CONFIG, USAGE_PAGE_OTA, USAGE_PAGE_VIA } from '@shared/ids'

const PAGE_NAMES: Record<number, string> = {
  [USAGE_PAGE_VIA]: 'VIA (раскладка)',
  [USAGE_PAGE_CONFIG]: 'Настройки / экран',
  [USAGE_PAGE_OTA]: 'Прошивка (только чтение)',
  0x01: 'Generic Desktop',
  0x0c: 'Consumer'
}

const h = (n: number, pad = 4): string => '0x' + n.toString(16).toUpperCase().padStart(pad, '0')

export function DevicePage(): ReactElement {
  const { status, probe, setProbe, run, busy, toast } = useStore()
  const connected = !!status?.connected

  const doProbe = (): Promise<void> =>
    run('Опрос клавиатуры', async () => {
      const p = await window.gmk.device.probe()
      setProbe(p)
      toast(p.errors.length ? 'info' : 'ok', p.errors.length ? 'Ответили не все интерфейсы, подробности в логе' : 'Клавиатура ответила')
    }).then(() => undefined)

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Устройство</h1>
          <p>
            Приложение само ничего не отправляет на клавиатуру: поиск устройства идёт только через sysfs, а обмен
            начинается после нажатия кнопки.
          </p>
        </div>
        <div className="page-actions">
          <button className="v-btn v-btn-primary" disabled={!connected || !!busy} onClick={doProbe}>
            <IconRefresh width={14} height={14} /> Опросить
          </button>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Подключение" hint={connected ? undefined : 'ожидание'}>
          <dl className="kv">
            <dt>Статус</dt>
            <dd>
              <span className={`status ${connected ? 'ok' : ''}`}>
                <StatusDot state={connected ? 'ok' : 'idle'} />
                {connected ? 'подключена' : 'не найдена'}
              </span>
            </dd>
            <dt>Режим</dt>
            <dd>{status?.mode === 'usb' ? 'Кабель USB' : status?.mode === 'dongle' ? '2.4G-донгл (Telink)' : '—'}</dd>
            <dt>VID:PID</dt>
            <dd>{status?.productId ? `320F:${status.productId.toString(16).toUpperCase()}` : '—'}</dd>
            <dt>Продукт</dt>
            <dd>{status?.product || '—'}</dd>
            <dt>bcdDevice</dt>
            <dd>{status?.release != null ? h(status.release) : '—'}</dd>
          </dl>
        </Card>

        <Card title="Прошивка" hint={probe ? undefined : 'нажмите «Опросить»'}>
          <dl className="kv">
            <dt>VIA protocol</dt>
            <dd>
              {probe?.viaProtocol ?? '—'}
              {probe?.viaProtocol != null && (
                <span className="muted"> · {probe.viaProtocol >= 11 ? 'прошивка V0112, новые коды' : 'прошивка V0104, старые коды'}</span>
              )}
            </dd>
            <dt>Слоёв</dt>
            <dd>{probe?.layers ?? '—'}</dd>
            <dt>Версия</dt>
            <dd>
              {probe?.firmware ? h(probe.firmware.version, 8) : '—'}
              {probe?.firmware && status?.mode === 'dongle' && <span className="muted"> · ответ донгла, не клавиатуры</span>}
            </dd>
            <dt>CRC</dt>
            <dd>{probe?.firmware ? h(probe.firmware.crc, 8) : '—'}</dd>
            <dt>Ответ</dt>
            <dd>{probe?.firmware ? probe.firmware.raw.map((b) => b.toString(16).padStart(2, '0')).join(' ') : '—'}</dd>
          </dl>
          {probe?.errors.map((e) => (
            <div className="note" key={e}>
              <StatusDot state="error" />
              <span>{e}</span>
            </div>
          ))}
        </Card>

        <Card title="HID-интерфейсы" hint={status ? `${status.all.length}` : undefined} mono>
          {status?.all.length ? (
            status.all.map((i, n) => (
              <div key={n} className="row selectable">
                <span>{i.path}</span>
                <span className="muted">if{i.interface}</span>
                <span className="muted">{h(i.usagePage)}</span>
                <span className="secondary" style={{ fontFamily: 'var(--font-sans)' }}>
                  {PAGE_NAMES[i.usagePage] ?? ''}
                </span>
              </div>
            ))
          ) : (
            <span className="muted">Нет интерфейсов</span>
          )}
        </Card>

        <Card title="Подсказки">
          {status?.mode === 'dongle' && (
            <div className="note">
              <StatusDot state="idle" />
              <span>
                Через 2.4G-донгл работает только VIA: раскладка, а также эффект, яркость и скорость подсветки.
                Экран, часы, логотип, Win Lock, цвет и направление подсветки настраиваются только по кабелю.
              </span>
            </div>
          )}
          <div className="note">
            <StatusDot state="idle" />
            <span>
              Нет доступа к <code>/dev/hidraw*</code>? Установите udev-правило из пакета (
              <code>/usr/lib/udev/rules.d/50-gmk87.rules</code>) и переподключите клавиатуру.
            </span>
          </div>
          <div className="note">
            <StatusDot state="idle" />
            <span>
              Если клавиатура перестала реагировать, выньте донгл или кабель и подключите снова. Обновление прошивки
              приложение не поддерживает и не отправляет.
            </span>
          </div>
        </Card>
      </div>
    </>
  )
}
