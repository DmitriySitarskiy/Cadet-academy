import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Package } from 'lucide-react';
import { PageHeader, Segmented, Notice, ListEditor, EmptyState, formatDateTime } from './ui';
import { api } from '../services/api';
import { CraftItem, CraftReport, PortalConfig } from '../types';

interface Props {
  config: PortalConfig;
  onConfigChanged: () => void;
}

export const CraftCatalogPage: React.FC<Props> = ({ config, onConfigChanged }) => {
  const [tab, setTab] = useState<'items' | 'purposes' | 'log'>('items');
  const [items, setItems] = useState<CraftItem[]>(config.catalog);
  const [purposes, setPurposes] = useState<string[]>(config.purposes);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [log, setLog] = useState<CraftReport[] | null>(null);

  useEffect(() => {
    setItems(config.catalog);
    setPurposes(config.purposes);
  }, [config]);

  useEffect(() => {
    if (tab === 'log' && !log) api.getCrafts().then(setLog).catch((e) => setNotice({ kind: 'error', text: e.message }));
  }, [tab]);

  const dirty = JSON.stringify(items) !== JSON.stringify(config.catalog) || JSON.stringify(purposes) !== JSON.stringify(config.purposes);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await api.saveCatalog(
        items.filter((i) => i.name.trim()).map((i) => ({ ...i, name: i.name.trim() })),
        purposes.map((p) => p.trim()).filter(Boolean)
      );
      setNotice({ kind: 'ok', text: 'Збережено. Нові значення вже доступні офіцерам.' });
      onConfigChanged();
    } catch (e: any) {
      setNotice({ kind: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const patch = (id: string, p: Partial<CraftItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <div>
      <PageHeader
        title="Каталог крафту"
        description="Позиції, які офіцери обирають у звіті крафту, і вартість матеріалів за одиницю. Старі звіти зберігають ціни на момент подачі."
        actions={
          tab !== 'log' && (
            <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
              <Save className="h-4 w-4" />
              {saving ? 'Збереження…' : 'Зберегти'}
            </button>
          )
        }
      />
      {notice && <div className="mb-5"><Notice kind={notice.kind}>{notice.text}</Notice></div>}
      <div className="mb-5">
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as any)}
          options={[
            { value: 'items', label: 'Позиції', count: items.length },
            { value: 'purposes', label: 'Мета крафту', count: purposes.length },
            { value: 'log', label: 'Журнал звітів' },
          ]}
        />
      </div>

      {tab === 'items' && (
        <section className="panel p-5 sm:p-6">
          {items.length === 0 && <p className="mb-4 text-sm text-slate-400">Позицій ще немає. Додайте першу.</p>}
          <div className="space-y-2">
            {items.length > 0 && (
              <div className="hidden grid-cols-[minmax(0,1fr)_8rem_6rem_2.5rem] gap-2 px-1 text-xs text-slate-500 sm:grid">
                <span>Назва</span><span>Матеріалів за 1 шт.</span><span>Доступна</span><span />
              </div>
            )}
            {items.map((i) => (
              <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_6rem_2.5rem]">
                <input className="field" value={i.name} maxLength={60} onChange={(e) => patch(i.id, { name: e.target.value })} aria-label="Назва" />
                <input className="field num" type="number" min={0} max={100000} value={i.cost} onChange={(e) => patch(i.id, { cost: Math.max(0, Math.round(Number(e.target.value))) })} aria-label="Вартість матеріалів" />
                <label className="hidden items-center gap-2 text-sm text-slate-300 sm:flex">
                  <input type="checkbox" checked={i.active} onChange={(e) => patch(i.id, { active: e.target.checked })} /> так
                </label>
                <button className="btn btn-ghost !px-2.5" onClick={() => setItems((xs) => xs.filter((x) => x.id !== i.id))} aria-label="Видалити позицію">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn-secondary mt-4" onClick={() => setItems((xs) => [...xs, { id: `new_${Date.now()}_${xs.length}`, name: '', cost: 0, active: true }])}>
            <Plus className="h-4 w-4" />
            Додати позицію
          </button>
          <p className="hint">Вимкнену позицію офіцери не бачать, але історія звітів з нею лишається.</p>
        </section>
      )}

      {tab === 'purposes' && (
        <section className="panel p-5 sm:p-6">
          <p className="mb-4 text-sm text-slate-400">Варіанти для поля «Мета, для чого». Офіцер також може ввести свій текст.</p>
          <ListEditor values={purposes} onChange={setPurposes} placeholder="Додати мету" max={20} />
        </section>
      )}

      {tab === 'log' && (
        <div className="panel divide-y divide-[#142038]">
          {log && log.length === 0 && <EmptyState icon={<Package className="h-5 w-5" />} title="Звітів ще немає" />}
          {(log || []).map((r) => (
            <div key={r.id} className="grid gap-1 p-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
              <div className="text-xs text-slate-500">{formatDateTime(r.createdAt)}</div>
              <div className="min-w-0">
                <div className="truncate text-sm text-slate-100">{r.officer.department ? `${r.officer.department} ` : ''}{r.officer.name}</div>
                <div className="mt-0.5 truncate text-xs text-slate-400">{r.lines.map((l) => `${l.name} - ${l.qty}`).join(', ')} · {r.purpose}</div>
              </div>
              <div className="num text-sm font-semibold text-amber-300">{r.totalCost}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
