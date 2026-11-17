import { X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { downloadText } from "@/lib/vellum/api";
import { loadModels, sendMessage } from "@/lib/vellum/send";
import { backupFromState, useVellum } from "@/lib/vellum/store";
import {
  DEFAULT_SAMPLING,
  MOODS,
  PRESETS,
  cloneSampling,
  parseBackup,
  uid,
  type Provider,
  type Sampling,
} from "@/lib/vellum/types";
import { prefersDirect } from "@/lib/vellum/urls";

function Sheet({
  title,
  center,
  children,
}: {
  title: string;
  center?: boolean;
  children: ReactNode;
}) {
  const setPanel = useVellum((state) => state.setPanel);
  return (
    <div className={center ? "sheet center" : "sheet"} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="sheet-hit" aria-label="Закрыть" onClick={() => setPanel(null)} />
      <div className="sheet-card">
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="icon-btn" aria-label="Закрыть панель" onClick={() => setPanel(null)} autoFocus>
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

function Switch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <div className="switch-row">
      <span>{label}</span>
      <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} onClick={onClick}>
        <span className="track">
          <i />
        </span>
      </button>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="stack">
      <span className="row-between">
        <span>{label}</span>
        <span className="faint" style={{ fontVariantNumeric: "tabular-nums" }}>
          {value.toFixed(2)}
        </span>
      </span>
      <span className="slider">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </span>
    </label>
  );
}

export function Panels() {
  const panel = useVellum((state) => state.panel);
  if (!panel) return null;
  if (panel === "settings") return <SettingsPanel />;
  if (panel === "library") return <LibraryPanel />;
  if (panel === "build") return <BuildPanel />;
  if (panel === "params") return <ParamsPanel />;
  return <ModelPanel />;
}

function SettingsPanel() {
  const providers = useVellum((state) => state.providers);
  const activeProviderId = useVellum((state) => state.activeProviderId);
  const seed = useVellum((state) => state.seed);
  const setSeed = useVellum((state) => state.setSeed);
  const upsertProvider = useVellum((state) => state.upsertProvider);
  const removeProvider = useVellum((state) => state.removeProvider);
  const setActiveProvider = useVellum((state) => state.setActiveProvider);
  const defaultModel = useVellum((state) => state.defaultModel);
  const setDefaultModel = useVellum((state) => state.setDefaultModel);
  const instructions = useVellum((state) => state.instructions);
  const memory = useVellum((state) => state.memory);
  const setInstructions = useVellum((state) => state.setInstructions);
  const setMemory = useVellum((state) => state.setMemory);
  const stream = useVellum((state) => state.stream);
  const enterToSend = useVellum((state) => state.enterToSend);
  const autoTitle = useVellum((state) => state.autoTitle);
  const setStream = useVellum((state) => state.setStream);
  const setEnterToSend = useVellum((state) => state.setEnterToSend);
  const setAutoTitle = useVellum((state) => state.setAutoTitle);
  const toastMsg = useVellum((state) => state.toastMsg);
  const importBackup = useVellum((state) => state.importBackup);
  const clearAll = useVellum((state) => state.clearAll);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<"test" | "models" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!seed) return;
    setEditing({
      id: "",
      name: seed.name,
      baseUrl: seed.baseUrl,
      apiKey: "",
      keyOptional: seed.keyOptional,
      direct: prefersDirect(seed.baseUrl),
      minimal: false,
    });
    if (!useVellum.getState().defaultModel) setDefaultModel(seed.model);
    setSeed(null);
  }, [seed, setDefaultModel, setSeed]);

  const blank = (): Provider => ({
    id: "",
    name: "Свой сервер",
    baseUrl: "https://",
    apiKey: "",
    keyOptional: false,
    direct: false,
    minimal: false,
  });

  const save = () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.baseUrl.trim() || editing.baseUrl.trim() === "https://") {
      toastMsg("Нужны имя и адрес API");
      return;
    }
    const provider = { ...editing, id: editing.id || uid(), name: editing.name.trim(), baseUrl: editing.baseUrl.trim() };
    upsertProvider(provider);
    setActiveProvider(provider.id);
    setEditing(provider);
    toastMsg("Провайдер сохранён");
  };

  return (
    <Sheet title="Настройки">
      <section className="block">
        <h2>Провайдер</h2>
        <div className="chip-wrap" style={{ marginBottom: 10 }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="chip-btn"
              onClick={() => {
                const existing = providers.find((item) => item.baseUrl.replace(/\/+$/, "") === preset.baseUrl.replace(/\/+$/, ""));
                setEditing(
                  existing ?? {
                    id: "",
                    name: preset.name,
                    baseUrl: preset.baseUrl,
                    apiKey: "",
                    keyOptional: !!preset.keyOptional,
                    direct: prefersDirect(preset.baseUrl),
                    minimal: false,
                  },
                );
                if (!defaultModel) setDefaultModel(preset.model);
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
        <div className="stack">
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className="provider-row"
              data-on={editing?.id === provider.id || (!editing && provider.id === activeProviderId) ? "true" : "false"}
              onClick={() => setEditing(provider)}
            >
              <b>{provider.name}</b>
              <span className="faint" style={{ display: "block" }}>
                {provider.baseUrl}
                {provider.id === activeProviderId ? " · активный" : ""}
              </span>
            </button>
          ))}
          <button type="button" className="btn-ghost" onClick={() => setEditing(blank())}>
            Новый провайдер
          </button>
        </div>
        {editing ? (
          <div className="stack" style={{ marginTop: 12 }}>
            <input className="field" aria-label="Имя" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
            <input
              className="field"
              aria-label="Адрес API"
              value={editing.baseUrl}
              onChange={(event) =>
                setEditing({
                  ...editing,
                  baseUrl: event.target.value,
                  direct: editing.direct || prefersDirect(event.target.value),
                })
              }
            />
            <div className="row-between">
              <input
                id="api-key"
                className="field"
                aria-label="API-ключ"
                type={showKey ? "text" : "password"}
                placeholder="API-ключ"
                value={editing.apiKey}
                autoComplete="off"
                onChange={(event) => setEditing({ ...editing, apiKey: event.target.value })}
              />
              <button type="button" className="btn-ghost" onClick={() => setShowKey((value) => !value)}>
                {showKey ? "Скрыть" : "Показать"}
              </button>
            </div>
            <Switch label="Ключ не обязателен" on={editing.keyOptional} onClick={() => setEditing({ ...editing, keyOptional: !editing.keyOptional })} />
            <Switch
              label="Прямой доступ из браузера"
              on={editing.direct}
              onClick={() => setEditing({ ...editing, direct: !editing.direct })}
            />
            <Switch label="Минимальный запрос" on={editing.minimal} onClick={() => setEditing({ ...editing, minimal: !editing.minimal })} />
            <p className="faint">
              В вебе запрос идёт через сервер приложения, чтобы обойти CORS. Ключ не записывается на сервере. Прямой доступ нужен для локальных серверов и тех, кто пускает браузер.
            </p>
            <div className="chip-wrap">
              <button type="button" className="btn-primary" onClick={save}>
                Сохранить
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy !== null}
                onClick={() => {
                  save();
                  const provider = { ...editing, id: editing.id || useVellum.getState().providers.at(-1)?.id || "" };
                  const stored = useVellum.getState().providers.find((item) => item.baseUrl === editing.baseUrl.trim()) ?? provider;
                  setBusy("test");
                  void loadModels(stored)
                    .then((models) => toastMsg(models.length ? `Связь есть, моделей: ${models.length}` : "Ответ получен, список пуст"))
                    .catch((error: unknown) => toastMsg(error instanceof Error ? error.message : "Нет связи"))
                    .finally(() => setBusy(null));
                }}
              >
                Проверить
              </button>
              {editing.id ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    removeProvider(editing.id);
                    setEditing(null);
                  }}
                >
                  Удалить
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
      <section className="block">
        <h2>Модель по умолчанию</h2>
        <input className="field" aria-label="Модель по умолчанию" value={defaultModel} placeholder="gpt-4o-mini" onChange={(event) => setDefaultModel(event.target.value)} />
      </section>
      <section className="block">
        <h2>Инструкции</h2>
        <textarea className="area" aria-label="Общие инструкции" placeholder="Как с вами говорить" value={instructions} onChange={(event) => setInstructions(event.target.value)} />
      </section>
      <section className="block">
        <h2>Память</h2>
        <textarea className="area" aria-label="Память" placeholder="Коротко о вас: что модель должна помнить" value={memory} onChange={(event) => setMemory(event.target.value)} />
      </section>
      <section className="block">
        <h2>Поведение</h2>
        <Switch label="Ответ потоком" on={stream} onClick={() => setStream(!stream)} />
        <Switch label="Enter отправляет" on={enterToSend} onClick={() => setEnterToSend(!enterToSend)} />
        <Switch label="Называть чаты автоматически" on={autoTitle} onClick={() => setAutoTitle(!autoTitle)} />
      </section>
      <section className="block">
        <h2>Данные</h2>
        <div className="chip-wrap">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => downloadText("vellum-backup.json", JSON.stringify(backupFromState(useVellum.getState()), null, 2), "application/json")}
          >
            Экспорт
          </button>
          <label className="btn-ghost">
            Импорт
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void file.text().then((raw) => {
                  const backup = parseBackup(raw);
                  if (!backup) {
                    toastMsg("Это не резервная копия Vellum");
                    return;
                  }
                  importBackup(backup);
                  toastMsg("Данные восстановлены");
                });
              }}
            />
          </label>
          <button type="button" className="btn-ghost" onClick={() => (confirmClear ? clearAll() : setConfirmClear(true))}>
            {confirmClear ? "Подтвердить очистку" : "Стереть всё"}
          </button>
        </div>
      </section>
    </Sheet>
  );
}

function useTarget() {
  const chat = useVellum((state) => state.chats.find((item) => item.id === state.activeChatId) ?? null);
  const sampling = useVellum((state) => state.sampling);
  const providers = useVellum((state) => state.providers);
  const activeProviderId = useVellum((state) => state.activeProviderId);
  const models = useVellum((state) => state.models);
  const defaultModel = useVellum((state) => state.defaultModel);
  return { chat, sampling, providers, activeProviderId, models, defaultModel };
}

function ParamsPanel() {
  const { chat, sampling } = useTarget();
  const setChatSampling = useVellum((state) => state.setChatSampling);
  const setSampling = useVellum((state) => state.setSampling);
  const setChatInstruction = useVellum((state) => state.setChatInstruction);
  const value = chat?.sampling ?? sampling;
  const apply = (next: Sampling) => {
    if (chat) setChatSampling(chat.id, next);
    else setSampling(next);
  };
  return (
    <Sheet title="Параметры" center>
      <p className="faint">{chat ? "Только этот чат." : "Для новых чатов."}</p>
      <div className="mood-row">
        {MOODS.map((mood) => (
          <button
            key={mood.id}
            type="button"
            className="chip-btn"
            onClick={() => apply({ ...value, temperature: mood.temperature, topP: mood.topP })}
          >
            {mood.label}
          </button>
        ))}
      </div>
      <Slider label="Температура" min={0} max={2} step={0.05} value={value.temperature} onChange={(temperature) => apply({ ...value, temperature })} />
      <Slider label="Top P" min={0} max={1} step={0.05} value={value.topP} onChange={(topP) => apply({ ...value, topP })} />
      <Slider label="Presence" min={-2} max={2} step={0.1} value={value.presencePenalty} onChange={(presencePenalty) => apply({ ...value, presencePenalty })} />
      <Slider label="Frequency" min={-2} max={2} step={0.1} value={value.frequencyPenalty} onChange={(frequencyPenalty) => apply({ ...value, frequencyPenalty })} />
      <label className="stack">
        Макс. токенов
        <input
          className="field"
          inputMode="numeric"
          placeholder="пусто — без лимита"
          value={value.maxTokens ?? ""}
          onChange={(event) => {
            const raw = event.target.value.trim();
            apply({ ...value, maxTokens: raw ? Math.max(1, Number(raw) || 0) : null });
          }}
        />
      </label>
      {chat ? (
        <>
          <label className="stack">
            Инструкция чата
            <textarea className="area" value={chat.instruction} onChange={(event) => setChatInstruction(chat.id, event.target.value)} />
          </label>
          <button type="button" className="btn-ghost" onClick={() => setSampling(cloneSampling(value))}>
            Сделать настройками по умолчанию
          </button>
        </>
      ) : (
        <button type="button" className="btn-ghost" onClick={() => setSampling(cloneSampling(DEFAULT_SAMPLING))}>
          Сбросить
        </button>
      )}
    </Sheet>
  );
}

function ModelPanel() {
  const { chat, providers, activeProviderId, models, defaultModel } = useTarget();
  const setChatModel = useVellum((state) => state.setChatModel);
  const setChatProvider = useVellum((state) => state.setChatProvider);
  const setDefaultModel = useVellum((state) => state.setDefaultModel);
  const setActiveProvider = useVellum((state) => state.setActiveProvider);
  const toastMsg = useVellum((state) => state.toastMsg);
  const providerId = chat?.providerId || activeProviderId;
  const provider = providers.find((item) => item.id === providerId);
  const list = provider ? models[provider.id] ?? [] : [];
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? list.filter((item) => item.toLowerCase().includes(needle)) : list;
  }, [filter, list]);
  const model = chat?.model || defaultModel;
  const setModel = (value: string) => {
    if (chat) setChatModel(chat.id, value);
    else setDefaultModel(value);
  };
  return (
    <Sheet title="Модель" center>
      <label className="stack">
        Провайдер
        <select
          className="field"
          value={providerId}
          onChange={(event) => {
            if (chat) setChatProvider(chat.id, event.target.value);
            else setActiveProvider(event.target.value);
          }}
        >
          <option value="">Не выбран</option>
          {providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="stack">
        ID модели
        <input className="field" value={model} placeholder="id модели" onChange={(event) => setModel(event.target.value)} />
      </label>
      <button
        type="button"
        className="btn-ghost"
        disabled={!provider || busy}
        onClick={() => {
          if (!provider) return;
          setBusy(true);
          void loadModels(provider)
            .then((items) => {
              toastMsg(items.length ? `Моделей: ${items.length}` : "Список пуст");
              if (!model && items[0]) setModel(items[0]);
            })
            .catch((error: unknown) => toastMsg(error instanceof Error ? error.message : "Не удалось загрузить"))
            .finally(() => setBusy(false));
        }}
      >
        Загрузить список
      </button>
      <input className="field" placeholder="Фильтр" value={filter} onChange={(event) => setFilter(event.target.value)} />
      <div className="model-list">
        {shown.map((item) => (
          <button key={item} type="button" data-on={item === model ? "true" : "false"} onClick={() => setModel(item)}>
            {item}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function LibraryPanel() {
  const prompts = useVellum((state) => state.prompts);
  const addPrompt = useVellum((state) => state.addPrompt);
  const removePrompt = useVellum((state) => state.removePrompt);
  const setDraft = useVellum((state) => state.setDraft);
  const setPanel = useVellum((state) => state.setPanel);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <Sheet title="Библиотека">
      <div className="stack">
        {prompts.map((prompt) => (
          <article key={prompt.id} className="starter glass-quiet">
            <b>{prompt.title}</b>
            <span>{prompt.body}</span>
            <div className="chip-wrap" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setDraft(prompt.body);
                  setPanel(null);
                }}
              >
                Вставить
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setPanel(null);
                  void sendMessage(prompt.body);
                }}
              >
                Отправить
              </button>
              <button type="button" className="btn-ghost" onClick={() => removePrompt(prompt.id)}>
                Удалить
              </button>
            </div>
          </article>
        ))}
      </div>
      <section className="block">
        <h2>Новый промпт</h2>
        <div className="stack">
          <input className="field" placeholder="Название" value={title} onChange={(event) => setTitle(event.target.value)} />
          <textarea className="area" placeholder="Текст" value={body} onChange={(event) => setBody(event.target.value)} />
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (!title.trim() || !body.trim()) return;
              addPrompt({ id: uid(), title: title.trim(), body: body.trim() });
              setTitle("");
              setBody("");
            }}
          >
            Сохранить в библиотеку
          </button>
        </div>
      </section>
    </Sheet>
  );
}

function BuildPanel() {
  return (
    <Sheet title="Android APK">
      <p className="lede" style={{ textAlign: "left" }}>
        В проекте лежит нативное приложение Vellum на Kotlin и Jetpack Compose: чаты, потоковый ответ, несколько провайдеров, вложения и те же параметры. Ключ уходит напрямую провайдеру, без веб-прокси — так подключаются и облако, и Ollama в локальной сети.
      </p>
      <ol className="prose-v">
        <li>Залейте репозиторий на GitHub.</li>
        <li>Откройте вкладку Actions.</li>
        <li>Выберите workflow Build APK и запустите его кнопкой Run workflow.</li>
        <li>Скачайте артефакт vellum-debug и установите APK. Это отладочная сборка, не из магазина.</li>
      </ol>
      <p className="faint">
        Файл сборки — .github/workflows/android-apk.yml. Он ставит JDK 17, Android SDK 35 и собирает debug APK. Для Ollama на эмуляторе укажите адрес http://10.0.2.2:11434/v1, для телефона — IP компьютера в сети.
      </p>
    </Sheet>
  );
}
